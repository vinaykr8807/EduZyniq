import os
import io
import json
import re
import codecs
from typing import Optional, List, Dict, Any
from groq import Groq
import httpx
from dotenv import load_dotenv
from services.pexels_service import get_pexels_video
from services.wikipedia_service import get_wikipedia_image
from services.langgraph_pipelines import run_notes_generation_graph
import requests
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, Image
from reportlab.lib.enums import TA_CENTER, TA_LEFT

load_dotenv()
_groq_client = None


def _get_groq_client() -> Groq:
    """Create the Groq client lazily so import-time dependency issues do not stop FastAPI startup."""
    global _groq_client
    if _groq_client is None:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError("GROQ_API_KEY is not configured.")
        _groq_client = Groq(api_key=api_key, http_client=httpx.Client())
    return _groq_client


def _strip_md(text: str) -> str:
    """Remove markdown formatting tokens so ReportLab doesn't render them as raw text."""
    import re
    text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)   # **bold** -> bold
    text = re.sub(r'\*([^*]+)\*', r'\1', text)        # *italic* -> italic
    text = re.sub(r'`([^`]+)`', r'\1', text)          # `code` -> code
    text = re.sub(r'^#+\s*', '', text, flags=re.M)    # ## Heading -> Heading
    return text.strip()


def _normalize_latex_text(text: str) -> str:
    """Repair common LaTeX corruption while preserving markdown code blocks."""
    if not isinstance(text, str) or not text:
        return text

    import re
    
    def _do_repairs(t):
        t = t.replace('\x08', '\\b').replace('\x0c', '\\f')
        fixes = [
            (r'(?<!\\)begin\{', r'\\begin{'),
            (r'(?<!\\)end\{', r'\\end{'),
            (r'(?<!\\)frac\{', r'\\frac{'),
            (r'(?<!\\)text\{', r'\\text{'),
            (r'(?<![\\\w])ext\{', r'\\text{'),     # Case where \t was eaten
            (r'(?<![\\\w])imes\b', r'\\times'),  # Case where \t was eaten
            (r'(?<![\\\w])right\b', r'\\right'), # Case where \r was eaten
            (r'(?<![\\\w])ight\b', r'\\right'),  # Case where \ri was eaten
            (r'(?<![\\\w])left\b', r'\\left'),
            (r'(?<![\\\w])eft\b', r'\\left'),    # Case where \l was eaten
            (r'(?<!\\)cdot\b', r'\\cdot'),
            (r'(?<!\\)times\b', r'\\times'),
            (r'(?<!\\)theta\b', r'\\theta'),
            (r'(?<![\\\w])heta\b', r'\\theta'),
            (r'(?<!\\)alpha\b', r'\\alpha'),
            (r'(?<!\\)beta\b', r'\\beta'),
            (r'(?<!\\)lambda\b', r'\\lambda'),
            (r'(?<!\\)sigma\b', r'\\sigma'),
            (r'(?<!\\)pi\b', r'\\pi'),
            (r'(?<!\\)mu\b', r'\\mu'),
            (r'(?<!\\)rho\b', r'\\rho'),
            (r'(?<!\\)rightarrow\b', r'\\rightarrow'),
            (r'(?<![\\\w])ightarrow\b', r'\\rightarrow'),
            (r'(?<!\\)sum\b', r'\\sum'),
            (r'(?<![\\\w])um\b', r'\\sum'),
        ]
        for pattern, replacement in fixes:
            t = re.sub(pattern, replacement, t)
        return t

    if '```' in text:
        # Split by triple backticks. The separators will be in segments
        segments = text.split('```')
        new_segments = []
        is_inside_code = False
        
        for idx, segment in enumerate(segments):
            if is_inside_code:
                # We are directly after an opening ```.
                # Re-add the triple backticks we removed with split()
                new_segments.append('```' + segment)
                # If there's another segment coming, it means there's a closing ```
                if idx < len(segments) - 1:
                    new_segments[-1] += '```'
                is_inside_code = False
            else:
                # We are in plain text
                new_segments.append(_do_repairs(segment))
                is_inside_code = True
        
        return "".join(new_segments)
    
    return _do_repairs(text)


def _normalize_latex_payload(value):
    """Recursively normalize LaTeX-like strings in parsed JSON payloads."""
    if isinstance(value, str):
        return _normalize_latex_text(value)
    if isinstance(value, list):
        return [_normalize_latex_payload(item) for item in value]
    if isinstance(value, dict):
        return {key: (_normalize_latex_payload(item) if key != 'd2_code' else item) for key, item in value.items()}
    return value


def _parse_groq_json(raw: str) -> dict:
    """Robustly extract JSON from a Groq response that may have markdown fences or unescaped LaTeX backslashes."""
    import re
    import json
    # Strip leading/trailing whitespace
    raw = raw.strip()
    
    # Remove ```json ... ``` or ``` ... ``` fences
    raw = re.sub(r'^```(?:json)?\s*', '', raw, flags=re.S)
    raw = re.sub(r'\s*```$', '', raw, flags=re.S)
    
    # Sometimes Groq wraps the JSON in a sentence; try to find the first { ... }
    match = re.search(r'\{.*\}', raw, re.S)
    if match:
        raw = match.group(0)

    # 1. Clean common AI-generated JSON artifacts
    # Replace literal control characters if they slipped into the raw JSON string
    def repair_json_string(s):
        # We only want to handle cases where actual control characters (0-31) were used
        # which would break json.loads
        return s.replace('\f', '\\f').replace('\b', '\\b').replace('\r', '\\r').replace('\t', '\\t')

    try:
        # We use strict=False to allow literal control characters (like newlines) 
        # that some models mistakenly include in JSON strings.
        return _normalize_latex_payload(json.loads(repair_json_string(raw), strict=False))
    except Exception as e:
        print(f"JSON Parse Error (Attempt 1): {e}")
        # Final fallback - try raw content if it's already a clean JSON string
        try:
            return _normalize_latex_payload(json.loads(raw, strict=False))
        except Exception as e2:
            print(f"JSON Parse Error (Final Fallback): {e2}")
            # If everything fails, it's not valid JSON
            raise e2


def _recover_failed_generation(error: Exception) -> Optional[dict]:
    """Best-effort recovery for providers that include a near-valid JSON payload in the error message."""
    error_msg = str(error)
    if "failed_generation" not in error_msg:
        return None

    patterns = [
        r"failed_generation': '([\s\S]*)'\}\}\s*$",
        r'"failed_generation": "([\s\S]*)"\}\}\s*$',
    ]

    for pattern in patterns:
        match = re.search(pattern, error_msg)
        if not match:
            continue

        raw = match.group(1)
        candidates = [raw]

        try:
            candidates.append(codecs.decode(raw, "unicode_escape"))
        except Exception:
            pass

        for candidate in candidates:
            try:
                recovered = _parse_groq_json(candidate)
                print("Recovered structured payload from failed_generation.")
                return recovered
            except Exception as parse_err:
                print(f"failed_generation recovery parse error: {parse_err}")

    return None


def _request_json_completion(messages: list[dict], temperature: float, max_tokens: int) -> dict:
    """Request structured JSON, then recover or retry if the provider rejects valid-ish output."""
    try:
        response = _get_groq_client().chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            response_format={"type": "json_object"}
        )
        return _parse_groq_json(response.choices[0].message.content.strip())
    except Exception as first_error:
        recovered = _recover_failed_generation(first_error)
        if recovered is not None:
            return recovered

        if "json_validate_failed" not in str(first_error):
            raise first_error

        print("Retrying Groq JSON generation with stricter escaping guidance…")
        retry_messages = [
            {
                "role": "system",
                "content": (
                    "Your previous reply failed JSON validation. "
                    "Return ONLY strict JSON. "
                    "Escape every backslash inside LaTeX and code strings. "
                    "Do not use markdown fences. "
                    "If LaTeX would break JSON escaping, simplify the equation text instead of returning invalid JSON."
                ),
            },
            *messages,
        ]

        try:
            retry_response = _get_groq_client().chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=retry_messages,
                temperature=min(temperature, 0.3),
                max_tokens=max_tokens,
            )
            return _parse_groq_json(retry_response.choices[0].message.content.strip())
        except Exception as retry_error:
            recovered_retry = _recover_failed_generation(retry_error)
            if recovered_retry is not None:
                return recovered_retry
            raise retry_error


def _request_text_completion(messages: list[dict], temperature: float, max_tokens: int) -> str:
    """Request plain markdown/text content without forcing a JSON wrapper."""
    response = _get_groq_client().chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return (response.choices[0].message.content or "").strip()


def _sanitize_d2(d2: str) -> str:
    """Robustly clean AI-generated D2 diagram code and inject ELK layout for better spacing."""
    if not d2:
        return ""

    # Strip markdown fences
    d2 = re.sub(r'^```(?:d2)?\s*', '', d2.strip(), flags=re.I)
    d2 = re.sub(r'\s*```\s*$', '', d2)

    # Expand collapsed single-line D2 (semicolon or space-brace separated)
    if "\n" not in d2:
        d2 = re.sub(r';\s*', '\n', d2)
        d2 = d2.replace('{ ', '{\n  ').replace(' }', '\n}')

    # Inject ELK layout engine with horizontal flow.
    # We remove theme/spacing because they were being rendered as literal boxes in some D2 versions.
    clean_lines = [
        'direction: right',
        'vars: {',
        '  d2-config: {',
        '    layout-engine: elk',
        '  }',
        '}'
    ]
    
    def quote_nodes(head):
        # Quote individual nodes in a connection string like "A -> B -> C"
        import re
        # Find parts separated by arrows but keep the arrows
        parts = re.split(r'(\s*->\s*|\s*<-\s*|\s*<->\s*)', head)
        for idx, part in enumerate(parts):
            p = part.strip()
            # If it's a node (not an arrow) and not already quoted, and has spaces
            if p and '->' not in p and '<-' not in p and '"' not in p and ' ' in p:
                parts[idx] = f'"{p}"'
            elif p and '->' not in p and '<-' not in p and '"' not in p:
                # Even single words with odd characters should be quoted for safety
                if not re.match(r'^[a-zA-Z0-9_]+$', p):
                    parts[idx] = f'"{p}"'
        return ''.join(parts)

    for line in d2.splitlines():
        # Prevent AI from overriding our layout engine or adding junk
        if 'layout-engine' in line or 'vars:' in line:
            continue
            
        # Remove comments and trailing/leading whitespace
        line = re.sub(r'#.*$', '', line).strip()
        if not line:
            continue

        # Remove leading bullet points or common markdown prefixes AI might add
        line = re.sub(r'^[*\-•\d\.\s]+', '', line)

        # Keep direction and container braces as-is
        if line in ('{', '}') or re.match(r'^direction\s*:', line, re.I):
            clean_lines.append(line)
            continue

        # Clean markdown bold/italic from entire line early
        line = line.replace('**', '').replace('*', '').replace('`', '')

        # Standard connection or node label: <Part A> : <Part B>
        if ':' in line:
            parts = line.split(':', 1)
            head = quote_nodes(parts[0].strip())
            tail = parts[1].strip()

            # Extract only the first quoted text from tail if it exists
            quote_match = re.search(r'"([^"]*)"', tail)
            if quote_match:
                label_text = quote_match.group(1)
            else:
                label_text = tail

            # Limit label words for readability and re-quote
            label_words = label_text.split()
            label_text = ' '.join(label_words[:4]) if label_words else ''
            
            clean_lines.append(f'{head}: "{label_text}"')
        else:
            # Simple node or connection without label
            clean_lines.append(quote_nodes(line))

    result = '\n'.join(clean_lines)
    if result and not result.endswith('\n'):
        result += '\n'
    return result


def get_market_skills(role: str, domain: str) -> dict:
    """Ask Groq what skills the market currently demands for a given role/domain, enriched by live research."""
    from services.market_research import get_market_trends
    
    # Live scrape current signals
    search_query = f"{role} {domain} required skills employee reviews interview questions job description 2026 India startups"
    market_raw = get_market_trends(search_query, max_results=4)

    prompt = f"""You are a Lead Tech Recruiter and Market Intelligence Analyst.
You are comparing a student's resume skills against what employers actually ask for in job descriptions, interview reviews, and startup hiring pages.

Current source signals from Serper searches across Glassdoor/AmbitionBox/Indeed/Wellfound/CutShort/Hirist/Instahyre/LinkedIn/startup sources:
{market_raw}

For the role: "{role}" in domain: "{domain}", provide a structured JSON response for a student:
- required_skills: list of 10-12 must-have technical skills
- nice_to_have_skills: list of 5-8 bonus/emerging skills
- top_tools: list of 5-6 specific tools/frameworks
- avg_salary_india: salary range in INR (LPA)
- demand_level: "Very High" | "High" | "Moderate" | "Low"
- beginner_summary: 2 simple sentences explaining what this role actually does, for a fresher.
- growth_trend: A 2-sentence expert outlook on this role's future.
- trend_analytics: A list of objects for a chart: [ {{"skill": "SkillName", "demand_score": 0-100}}, ... ] (top 6 skills)
- source_summary: 3 short bullets explaining what employee reviews/interview pages and job descriptions commonly expect.
- evidence_matrix: list of 6 objects: {{"skill": "SkillName", "demand_score": 0-100, "why_required": "plain English reason", "evidence": "short quote-like source signal summary"}}
- fresher_action_plan: 5 practical steps a fresher should take next, in priority order.
- confidence_note: Explain whether the evidence is live-source-backed or limited.

Rules:
- Prioritize repeated skills from job descriptions and employee/interview review snippets.
- Include startup-relevant expectations, not only big-company stacks.
- Keep skills specific and role-matched. For Frontend Engineer, do not include AWS/Azure unless source signals clearly show it for frontend roles.
- Do not list generic placeholders.

Return ONLY valid JSON."""

    try:
        response = _get_groq_client().chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=1000,
            response_format={"type": "json_object"}
        )
        return _parse_groq_json(response.choices[0].message.content.strip())
    except Exception as e:
        print(f"Market Skills Data Error: {e}")
        return {
            "error": f"Market research failed: {e}",
            "no_fallback_used": True,
            "required_skills": [],
            "nice_to_have_skills": [],
            "top_tools": [],
            "trend_analytics": [],
            "evidence_matrix": [],
            "source_summary": [],
        }

def get_pro_coach_beginner_guide(role: str, domain: str) -> dict:
    """Generates a professional 'Zero-to-Hero' coaching guide for absolute beginners."""
    prompt = f"""You are a Senior Career Mentor. A student with ZERO knowledge wants to become a successful {role} in {domain}.
Generate a professional, encouraging, and comprehensive 'Zero-to-Hero' Blueprint.
Include:
1. Executive Summary (The professional path)
2. Week 1-4: The Foundation (What to learn first, exactly)
3. Month 2-3: Building Competency
4. Essential Soft Skills for {role}s
5. Industry Trends they must watch.

Return JSON:
{{
  "guide_title": "string",
  "summary": "markdown",
  "phases": [ {{"phase": "Phase Name", "focus": "markdown details"}} ],
  "soft_skills": ["skill1", "skill2"],
  "trends": ["trend1", "trend2"]
}}
"""
    try:
        res = _get_groq_client().chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )
        return _parse_groq_json(res.choices[0].message.content)
    except Exception as e:
        return {"error": str(e)}

def explain_subtopic(topic: str, subtopic: str, domain: str,
                     has_doubt: bool = False, doubt_text: Optional[str] = None,
                     history: Optional[List[Dict[str, str]]] = None, 
                     user_email: Optional[str] = None) -> Dict[str, Any]:
    """Generate a Groq-powered explanation for a subtopic with RAG and chat memory."""
    from services.rag_service import generate_rag_context
    from services.personal_rag_service import get_personal_context
    from services.rag import search_knowledge
    from supabase_client import supabase

    try:
        rag_context = generate_rag_context(topic, subtopic, domain)
    except Exception as e:
        print(f"RAG context failed (non-fatal): {e}")
        rag_context = ""

    # [4/7] Local KB Search
    kb_context = ""
    try:
        print("  [4/7] Local KB search…")
        local_hits = search_knowledge(f"{subtopic} {topic}", top_k=3)
        if local_hits:
            kb_context = "\n".join([f"- {h['text']} (Source: {h['source']})" for h in local_hits])
            print(f"        → Injected {len(local_hits)} local KB hits")
    except Exception as e:
        print(f"Local KB search failed: {e}")

    personal_context = ""
    if user_email:
        try:
            personal_context = get_personal_context(user_email, doubt_text or subtopic, supabase)
        except Exception as e:
            print(f"Personal RAG failed (non-fatal): {e}")
            personal_context = ""

    context_injection = ""
    if rag_context:
        context_injection = f"\n\nREAL-TIME WEB CONTEXT:\n{rag_context}\n"
    
    if kb_context:
        context_injection += f"\n\nLOCAL KNOWLEDGE BASE:\n{kb_context}\n"

    if personal_context:
        context_injection += f"\n{personal_context}\n"

    if context_injection:
        context_injection = f"\n\nHere is some additional context to help you personalize your response:\n{context_injection}\nUse this context to provide an extremely detailed, context-aware, and personalized explanation.\n"

    print("  [5/7] Generating explanation via Groq…")

    if has_doubt and doubt_text:
        explanation_system_prompt = f"""You are an industry-expert {domain} tutor. A student is studying "{subtopic}" under "{topic}".
{context_injection}
Provide an exhaustive, high-detail, and master-level solution to their specific doubt.
INSTRUCTIONS:
- provide at least 3-4 detailed paragraphs or structured sections.
- GO BEYOND a simple definition; explain internals, mechanics, and common industry scenarios.
- ALWAYS include code examples, analogies, and technical nuances.
- MATHEMATICAL EQUATIONS: Use LaTeX for any mathematical notations.
  - Wrap inline math in single dollar signs: `$ E = mc^2 $`.
  - Wrap block math in double dollar signs: `$$ P(A|B) = \\frac{{P(B|A)P(A)}}{{P(B)}} $$`.
- RESEARCH DEPTH: Use formal, academic, and professional language.
- Use professional Markdown (Headings, Bullets, Code Blocks).
- Return ONLY the markdown explanation. Do NOT return JSON.
"""
    else:
        explanation_system_prompt = f"""You are a master {domain} tutor and industry expert teaching "{subtopic}" (part of "{topic}").
{context_injection}
Provide an extremely deep, master-level explanation of this topic.
Your explanation MUST follow this exact structure and style:

# 🏛️ Core Architecture & Mastery: {subtopic}

## 📌 Executive Abstract
(A formal, academic abstract describing the necessity, history, and core premise of the topic in professional language.)

## ⚙️ Fundamental Axioms & Mechanics
(Deeply investigate the underlying logic, mathematical proofs if applicable, and technical architecture. Use formal terminology.)

## 🧮 Mathematical Formulation
(Include detailed mathematical equations using LaTeX. Use `$ $` for inline and `$$ $$` for standalone blocks.)

## 💻 Technical Implementation & Prototypes
(Provide clean, professional code examples or syntactical logic.)

## 🚀 Advanced System Design & Recursive Edge Cases
(Where does it break? How do experts use it at scale? Discuss optimization paradigms.)

## 🗺️ Visual System Flowchart
(Mention the flow conceptually, but do NOT include diagram code. The diagram is generated separately.)

## ⚠️ Expert Pitfalls & Optimization
(What are the 3 things beginners get wrong?)

IMPORTANT:
- Return ONLY markdown explanation text.
- Do NOT return JSON.
- Do NOT include ```d2 fences or raw diagram code.
"""

    explanation_messages = [{"role": "system", "content": explanation_system_prompt}]
    if history:
        for msg in history:
            explanation_messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})
    
    if has_doubt and doubt_text:
        explanation_messages.append({"role": "user", "content": doubt_text})
    else:
        # Standard lesson request
        explanation_messages.append({"role": "user", "content": f"Explain {subtopic} in {topic}."})

    try:
        explanation = _request_text_completion(
            messages=explanation_messages,
            temperature=0.55 if has_doubt else 0.65,
            max_tokens=2600,
        )
        explanation = _normalize_latex_text(explanation)

        d2_code = ""
        wiki_query = subtopic
        video_query = f"tutorial {subtopic}"

        if not has_doubt:
            metadata_messages = [
                {
                    "role": "system",
                    "content": f"""You are generating lightweight lesson metadata for "{subtopic}" in "{topic}" ({domain}).
Return ONLY strict JSON with these keys:
- d2_code
- visual_query
- stock_query
- video_query

Rules for d2_code:
- Max 6 nodes total.
- Use only simple one-line edges like `A -> B: "Label"`.
- Keep labels to 1-2 words where possible.
- No markdown fences.
- No prose outside JSON.
""",
                },
                {
                    "role": "user",
                    "content": (
                        f"Create flow-graph and media metadata for this lesson.\n\n"
                        f"Topic: {topic}\n"
                        f"Subtopic: {subtopic}\n"
                        f"Domain: {domain}\n\n"
                        f"Lesson excerpt:\n{explanation[:1400]}"
                    ),
                },
            ]

            try:
                metadata = _request_json_completion(
                    messages=metadata_messages,
                    temperature=0.2,
                    max_tokens=700,
                )
            except Exception as metadata_error:
                print(f"Teacher metadata generation error: {metadata_error}")
                metadata = {}

            d2_code = str(metadata.get("d2_code", "") or "").strip()
            d2_code = re.sub(r'^```(?:d2)?\s*', '', d2_code, flags=re.I)
            d2_code = re.sub(r'\s*```$', '', d2_code)
            d2_code = _sanitize_d2(d2_code)
            if d2_code:
                print(f"  → Final D2 Source (Fixed):\n{d2_code}")
                if "```d2" not in explanation:
                    explanation += f"\n\n## 🗺️ Visual System Flowchart\n```d2\n{d2_code}\n```"

            wiki_query = str(metadata.get("visual_query") or subtopic)
            video_query = str(metadata.get("video_query") or f"tutorial {subtopic}")

        # Fetch visuals using topic-relevant Wikipedia/Wikimedia diagrams only.
        # If we cannot find a trustworthy technical image, prefer showing none.
        image_url = get_wikipedia_image(wiki_query)
        
        if not image_url:
            print(f"  → No trustworthy Wikipedia image found for '{wiki_query}'. Skipping image card.")

        video_url = None if has_doubt else get_pexels_video(video_query)

        return {
            "explanation": explanation,
            "d2_code": d2_code,
            "topic": topic,
            "subtopic": subtopic,
            "domain": domain,
            "image_url": image_url,
            "video_url": video_url
        }
    except Exception as e:
        error_msg = str(e)
        print(f"Teacher service error: {error_msg}")
        
        # Friendly fallback if JSON or API fails
        return {
            "explanation": f"I encountered a slight technical hiccup while deep-diving into **{subtopic}**. \n\nHowever, in short: {subtopic} is a critical concept in {domain} that focuses on efficiency and scalability. \n\nPlease try again in a moment or ask a specific doubt about it!",
            "topic": topic,
            "subtopic": subtopic,
            "domain": domain
        }


def generate_topic_notes_pdf(topic: str, subtopic: str, domain: str) -> io.BytesIO:
    """Generate professional PDF notes for a subtopic using Groq content + ReportLab, enhanced by RAG."""
    import html
    import requests
    from io import BytesIO
    from services.rag_service import generate_rag_context
    rag_context = generate_rag_context(topic, subtopic, domain)
    context_injection = ""
    if rag_context:
        context_injection = f"\n\nHere is some real-time extracted context from the web to help you:\n{rag_context}\n\nUse this context to accurately enrich the generated notes, scaling from fundamental definitions to advanced applications.\n"

    # 1. Get content from Groq
    prompt = f"""You are an expert technical educator creating professional study notes for "{subtopic}" ({topic} — {domain}).
{context_injection}
Generate structured notes with these sections in JSON:
{{
  "summary": "Formal overview of the subtopic",
  "executive_abstract": "Research-paper style professional abstract...",
  "mechanics": "Detailed investigation into axioms and technical proofs. Include LaTeX mathematical equations ($ for inline, $$ for block).",
  "mathematical_model": "Step-by-step LaTeX derivation or model...",
  "advanced_design": "System design, isomorphisms, and scaling...",
  "d2_code": "Generate a clean, high-level D2 architecture diagram. Rules: 1. Use 1 main Container and 1-2 external boxes. 2. Max 6 nodes. 3. Use 'A -> B: \"Label\"' syntax. 4. Use 1-2 word labels to avoid overlap. 5. NO icons or markdown fences.",
  "key_concepts": ["concept 1", "concept 2", "concept 3", "concept 4", "concept 5"],
  "table_data": [
    {{"term": "Term 1", "definition": "Definition 1", "example": "Example 1"}}
  ],
  "code_example": "Code snippet...",
  "common_mistakes": ["mistake 1", "mistake 2"],
  "practice_tasks": ["task 1", "task 2"]
}}

CRITICAL: 
1. Use LaTeX for ANY mathematical notation.
2. BACKSLASHES in LaTeX MUST BE DOUBLE-ESCAPED for JSON (e.g., use \\\\frac instead of \\frac).
3. Return ONLY valid JSON.
"""

    try:
        response = _get_groq_client().chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=3500,
            response_format={"type": "json_object"}
        )
        raw = response.choices[0].message.content.strip()
        data = _parse_groq_json(raw)
    except Exception as e:
        print(f"pdf generation groq error: {e}")
        try:
            print(f"raw output was: {raw[:500]}...")
        except:
            pass
        data = {
            "summary": f"FALLBACK TRIGGERED! Exception details: {str(e)}",
            "key_concepts": ["Core concept 1", "Core concept 2", "Core concept 3"],
            "table_data": [{"term": "Key Term", "definition": "Definition", "example": "Example"}],
            "code_example": "",
            "common_mistakes": ["Common mistake 1", "Common mistake 2"],
            "practice_tasks": ["Practice task 1", "Practice task 2"]
        }

    # 2. Route the prepared notes through LangGraph before rendering.
    data = run_notes_generation_graph(
        topic,
        subtopic,
        domain,
        lambda _topic, _subtopic, _domain: rag_context,
        lambda _topic, _subtopic, _domain, _rag_context: data,
    )

    # 3. Build PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4,
                            leftMargin=2*cm, rightMargin=2*cm,
                            topMargin=2*cm, bottomMargin=2*cm)

    styles = getSampleStyleSheet()
    GREEN = colors.HexColor('#2d7d46')
    LIGHT_GREEN = colors.HexColor('#e8f5e9')
    DARK = colors.HexColor('#1a2e1f')

    title_style = ParagraphStyle('Title', parent=styles['Title'],
                                  textColor=GREEN, fontSize=22, spaceAfter=4)
    subtitle_style = ParagraphStyle('Subtitle', parent=styles['Normal'],
                                     textColor=colors.HexColor('#4a7c59'), fontSize=11,
                                     spaceAfter=12)
    section_style = ParagraphStyle('Section', parent=styles['Heading2'],
                                    textColor=GREEN, fontSize=13, spaceBefore=14, spaceAfter=6)
    body_style = ParagraphStyle('Body', parent=styles['Normal'],
                                 fontSize=10, leading=16, textColor=DARK)
    bullet_style = ParagraphStyle('Bullet', parent=styles['Normal'],
                                   fontSize=10, leading=15, textColor=DARK,
                                   leftIndent=15, bulletIndent=5)
    code_style = ParagraphStyle('Code', parent=styles['Code'],
                                 fontSize=9, leading=14,
                                 backColor=colors.HexColor('#f0f7f2'),
                                 borderColor=GREEN, borderWidth=1,
                                 borderPadding=8, leftIndent=10)

    story = []

    def add_text_with_math(text, style, indent=0):
        if not text: return
        
        # 1. Clean markdown crud
        text = _strip_md(text)
        
        # 2. Split by block math $$
        blocks = re.split(r'(\$\$.*?\$\$)', text, flags=re.DOTALL)
        
        for block in blocks:
            if block.startswith('$$') and block.endswith('$$'):
                # Render Block Math
                math = block[2:-2].strip()
                if not math: continue
                try:
                    # Use CodeCogs for high quality SVG/PNG math
                    math_url = f"https://latex.codecogs.com/png.latex?%5Cdpi%7B150%7D%20%5Chuge%20%5Ccolor%7B%232d7d46%7D%20{requests.utils.quote(math)}"
                    r = requests.get(math_url, timeout=5)
                    if r.ok:
                        img = Image(BytesIO(r.content))
                        # Scale based on text width
                        img.drawWidth = min(14*cm, img.drawWidth * 0.4)
                        img.drawHeight = img.drawHeight * (img.drawWidth / (img.drawWidth / 0.4 if img.drawWidth > 0 else 1)) * 0.4
                        # Simpler height scale
                        aspect = img.imageHeight / img.imageWidth if img.imageWidth > 0 else 1
                        img.drawHeight = img.drawWidth * aspect
                        story.append(Spacer(1, 5))
                        story.append(img)
                        story.append(Spacer(1, 5))
                except:
                    story.append(Paragraph(f"Math: {math}", style))
            else:
                # Part may contain inline math $ ... $
                inlines = re.split(r'(\$.*?\$)', block)
                p_text = ""
                for part in inlines:
                    if part.startswith('$') and part.endswith('$'):
                        # Render Inline Math (Attempt simple version or just italics if complex)
                        math = part[1:-1].strip()
                        escaped_math = html.escape(math)
                        # For PDF simplicity, if inline is complex, we render as italic
                        p_text += f"<i>{escaped_math}</i> "
                    else:
                        p_text += html.escape(part)
                if p_text.strip():
                    story.append(Paragraph(p_text, style))

    # Header
    story.append(Paragraph(_strip_md(subtopic), title_style))
    story.append(Paragraph(f"{_strip_md(topic)} · {domain} · EduZyniq AI Notes", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=2, color=GREEN, spaceAfter=14))

    # Sections
    story.append(Paragraph("📌 Overview", section_style))
    add_text_with_math(data.get("summary", ""), body_style)
    story.append(Spacer(1, 10))

    # Wikipedia Image
    try:
        from services.wikipedia_service import get_wikipedia_image
        img_url = get_wikipedia_image(subtopic)
        if img_url:
            headers = {"User-Agent": "EduZyniqAI/1.0 (https://eduzyniq.ai) requests/2.0"}
            resp = requests.get(img_url, headers=headers, timeout=5)
            if resp.ok:
                story.append(Image(BytesIO(resp.content), width=16*cm, height=8*cm))
                story.append(Spacer(1, 10))
    except Exception as e:
        print(f"Error including wiki image in PDF: {e}")

    if data.get("executive_abstract"):
        story.append(Paragraph("📌 Executive Abstract", section_style))
        add_text_with_math(data.get("executive_abstract"), body_style)
        story.append(Spacer(1, 10))

    if data.get("mechanics"):
        story.append(Paragraph("⚙️ Technical Axioms & Mechanics", section_style))
        add_text_with_math(data.get("mechanics"), body_style)
        story.append(Spacer(1, 10))

    if data.get("mathematical_model"):
        story.append(Paragraph("🧮 Mathematical Model", section_style))
        add_text_with_math(data.get("mathematical_model"), body_style)
        story.append(Spacer(1, 10))

    if data.get("advanced_design"):
        story.append(Paragraph("🏗️ Advanced System Design", section_style))
        add_text_with_math(data.get("advanced_design"), body_style)
        story.append(Spacer(1, 10))

    # Flowchart Rendering (Kroki)
    d2_code = data.get("d2_code", "")
    if d2_code and isinstance(d2_code, str):
        # Sanitize d2_code robustly
        d2_code = _sanitize_d2(d2_code)
        print(f"  → Generating PDF D2 Source (Fixed):\n{d2_code}")
        
        try:
            story.append(Paragraph("📊 Architecture Flowchart", section_style))
            res = requests.post("https://kroki.io/d2/png", data=d2_code.encode(), timeout=5)
            if res.ok:
                diag_data = BytesIO(res.content)
                story.append(Image(diag_data, width=16*cm, height=10*cm))
                story.append(Spacer(1, 10))
        except:
            pass

    # Key Concepts
    story.append(Paragraph("🔑 Key Concepts", section_style))
    for concept in data.get("key_concepts", []):
        if isinstance(concept, str):
            story.append(Paragraph(f"• {_strip_md(concept)}", bullet_style))
    story.append(Spacer(1, 10))

    # Table
    table_data = data.get("table_data", [])
    if table_data and isinstance(table_data, list) and isinstance(table_data[0], dict):
        story.append(Paragraph("📊 Quick Reference Table", section_style))
        t_rows = [["Term", "Definition", "Example"]]
        for row in table_data:
            if isinstance(row, dict):
                t_rows.append([
                    Paragraph(_strip_md(str(row.get("term", ""))), body_style),
                    Paragraph(_strip_md(str(row.get("definition", ""))), body_style),
                    Paragraph(_strip_md(str(row.get("example", ""))), body_style),
                ])
        t = Table(t_rows, colWidths=[3.5*cm, 8*cm, 5*cm])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), GREEN),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LIGHT_GREEN]),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#b2dfdb')),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ]))
        story.append(t)
        story.append(Spacer(1, 10))

    # Code example
    code = data.get("code_example", "")
    if isinstance(code, str):
        code = code.strip()
    if code:
        story.append(Paragraph("💻 Code / Pseudocode Example", section_style))
        # Strip markdown code fences from code example itself
        import re as _re
        import html
        code = _re.sub(r'^```\w*\s*', '', code)
        code = _re.sub(r'\s*```$', '', code)
        code_escaped = html.escape(code).replace('\n', '<br/>').replace(' ', '&nbsp;')
        story.append(Paragraph(code_escaped, code_style))
        story.append(Spacer(1, 10))

    # Common Mistakes
    story.append(Paragraph("⚠️ Common Mistakes to Avoid", section_style))
    for mistake in data.get("common_mistakes", []):
        if isinstance(mistake, str):
            story.append(Paragraph(f"✗  {_strip_md(mistake)}", bullet_style))
    story.append(Spacer(1, 10))

    # Practice Tasks
    story.append(Paragraph("✅ Practice Tasks", section_style))
    for i, task in enumerate(data.get("practice_tasks", []), 1):
        if isinstance(task, str):
            story.append(Paragraph(f"{i}. {_strip_md(task)}", bullet_style))

    story.append(Spacer(1, 20))
    story.append(HRFlowable(width="100%", thickness=1, color=GREEN))
    story.append(Paragraph("Generated by EduZyniq AI · For educational use only",
                             ParagraphStyle('Footer', parent=styles['Normal'],
                                            fontSize=8, textColor=colors.grey,
                                            alignment=TA_CENTER, spaceBefore=6)))

    doc.build(story)
    buffer.seek(0)
    return buffer
