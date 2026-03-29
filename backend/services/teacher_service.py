import os
import io
import json
import re
from groq import Groq
from dotenv import load_dotenv
from services.pexels_service import get_pexels_image, get_pexels_video
from services.wikipedia_service import get_wikipedia_image
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, Image
from reportlab.lib.enums import TA_CENTER, TA_LEFT

load_dotenv()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))


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
            (r'(?<!\\)cdot\b', r'\\cdot'),
            (r'(?<!\\)times\b', r'\\times'),
            (r'(?<!\\)theta\b', r'\\theta'),
            (r'(?<!\\)alpha\b', r'\\alpha'),
            (r'(?<!\\)beta\b', r'\\beta'),
            (r'(?<!\\)lambda\b', r'\\lambda'),
            (r'(?<!\\)sigma\b', r'\\sigma'),
            (r'(?<!\\)pi\b', r'\\pi'),
            (r'(?<!\\)mu\b', r'\\mu'),
            (r'(?<!\\)rho\b', r'\\rho'),
            (r'(?<!\\)rightarrow\b', r'\\rightarrow'),
            (r'(?<!\\)left\b', r'\\left'),
            (r'(?<!\\)right\b', r'\\right'),
            (r'(?<!\\)text\{', r'\\text{'),
        ]
        for pattern, replacement in fixes:
            t = re.sub(pattern, replacement, t)
        return t

    if '```' in text:
        parts = re.split(r'(```[\s\S]*?```)', text)
        return "".join([p if p.startswith('```') else _do_repairs(p) for p in parts])
    
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
    # Strip leading/trailing whitespace
    raw = raw.strip()
    
    # Remove ```json ... ``` or ``` ... ``` fences
    raw = re.sub(r'^```(?:json)?\s*', '', raw, flags=re.S)
    raw = re.sub(r'\s*```$', '', raw, flags=re.S)
    
    # Sometimes Groq wraps the JSON in a sentence; try to find the first { ... }
    match = re.search(r'\{.*\}', raw, re.S)
    if match:
        raw = match.group(0)

    def repair_corrupted_latex(text):
        # 1. Restore common control characters misparsed as LaTeX
        text = text.replace('\f', '\\f') # \f -> \frac, \functions
        text = text.replace('\b', '\\b') # \b -> \begin, \mathbb
        text = text.replace('\r', '\\r') # \r -> \rho, \rightarrow
        text = text.replace('\t', '\\t') # \t -> \text, \theta, \times
        text = text.replace('\n', '\\n') # \n -> \nu, \nabla, \normalsize
        # 2. Clean extra quotes or artifacts that might break JSON
        return text

    def fix_backslashes(text):
        text = text.replace('\\"', '___QUOTE_ESC___')
        text = text.replace('\\', '\\\\')
        text = text.replace('___QUOTE_ESC___', '\\"')
        return text

    try:
        # First repair existing corruption
        repaired = repair_corrupted_latex(raw)
        # Then double-escape for json.loads consistency
        fixed = fix_backslashes(repaired)
        return _normalize_latex_payload(json.loads(fixed))
    except Exception:
        # Fallback
        try:
            return _normalize_latex_payload(json.loads(raw))
        except Exception as e:
            print(f"JSON Parse Error: {e}")
            raise e


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
    search_query = f"top in-demand technical skills for {role} {domain} 2026 hiring trends india global"
    market_raw = get_market_trends(search_query)

    prompt = f"""You are a Lead Tech Recruiter and Market Intelligence Analyst.
Based on these current market signals:
{market_raw}

For the role: "{role}" in domain: "{domain}", provide a structured JSON response for a student:
- required_skills: list of 10-12 must-have technical skills
- nice_to_have_skills: list of 5-8 bonus/emerging skills
- top_tools: list of 5-6 specific tools/frameworks
- avg_salary_india: salary range in INR (LPA)
- demand_level: "Very High" | "High" | "Moderate" | "Low"
- growth_trend: A 2-sentence expert outlook on this role's future.
- trend_analytics: A list of objects for a chart: [ {{"skill": "SkillName", "demand_score": 0-100}}, ... ] (top 6 skills)

Return ONLY valid JSON."""

    try:
        response = client.chat.completions.create(
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
            "required_skills": ["Technical Skill 1", "Technical Skill 2"],
            "nice_to_have_skills": ["Emerging Tech 1"],
            "top_tools": ["Industry Tool 1"],
            "avg_salary_india": "6-15 LPA",
            "demand_level": "High",
            "growth_trend": "Market is evolving with focus on AI integration.",
            "trend_analytics": [{"skill": "Python", "demand_score": 90}, {"skill": "Cloud", "demand_score": 85}],
            "error": str(e)
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
        res = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )
        return _parse_groq_json(res.choices[0].message.content)
    except Exception as e:
        return {"error": str(e)}


from typing import Optional, List, Dict, Any

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
        system_prompt = f"""You are an industry-expert {domain} tutor. A student is studying "{subtopic}" under "{topic}".
{context_injection}
Provide an exhaustive, high-detail, and master-level solution to their specific doubt.
INSTRUCTIONS:
- provide at least 3-4 detailed paragraphs or structured sections.
- GO BEYOND a simple definition; explain internals, mechanics, and common industry scenarios.
- ALWAYS include code examples, analogies, and technical nuances.
- MATHEMATICAL EQUATIONS: Use LaTeX for any mathematical notations. 
  - Wrap inline math in single dollar signs: `$ E = mc^2 $`.
  - Wrap block math in double dollar signs: `$$ P(A|B) = \frac{{P(B|A)P(A)}}{{P(B)}} $$`.
- RESEARCH DEPTH: Use formal, academic, and professional language — like a top-tier research paper (e.g., talk about algorithmic complexity, state-space transitions, or architectural isomorphisms where applicable).
- NEVER leave a list or category empty (e.g., if you write "Examples:", you MUST list 3+ examples).
- Use professional Markdown (Headings, Bullets, Code Blocks).
- Ensure the technical depth matches a Senior Engineer's explanation.

Return a JSON object:
{{
  "explanation": "An exhaustive, master-level markdown response with research depth and LaTeX math...",
  "visual_query": "Wikipedia title for the topic",
  "stock_query": "pexels stock photo keyword",
  "video_query": "tutorial video query"
}}
"""
    else:
        system_prompt = f"""You are a master {domain} tutor and industry expert teaching "{subtopic}" (part of "{topic}").
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
(The diagram will be automatically rendered from the d2_code key. Do not include it here.)

## ⚠️ Expert Pitfalls & Optimization
(What are the 3 things beginners get wrong?)

Also, provide THREE search queries for image/video.
IMPORTANT: 
- For `visual_query`, use the most logical title or technical keyword for Wikipedia images.
- For `stock_query`, use a broad stock photo term for fallback (e.g. "server", "code"). 
- For `video_query`, use a specific tutorial query.

Return a JSON object:
{{
  "explanation": "FULL deep-dive markdown content with Research Depth and LaTeX equations.",
  "d2_code": "Generate a clean, high-level D2 architecture diagram. \\nRules: \\n1. Focus on a simple layout: 1 main Container for the core system and 1-2 external boxes. \\n2. Max 6-8 nodes total for maximum readability. \\n3. Use 'Source -> Target: \\"Label\\"' syntax — ALWAYS quote labels. \\n4. Use very short 1-2 word labels for connections to avoid overlap. \\n5. Connections MUST be on a single line. \\n6. NO icons, NO complex nesting, NO markdown fences.",
  "visual_query": "Wikipedia technical title",
  "stock_query": "stock photo keyword",
  "video_query": "specific instructional video query"
}}
"""

    messages = [{"role": "system", "content": system_prompt}]
    if history:
        for msg in history:
            messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})
    
    if has_doubt and doubt_text:
        messages.append({"role": "user", "content": doubt_text})
    else:
        # Standard lesson request
        messages.append({"role": "user", "content": f"Explain {subtopic} in {topic}."})

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0.7,
            max_tokens=3000,
            response_format={"type": "json_object"}
        )
        data = _parse_groq_json(response.choices[0].message.content.strip())
        explanation = data.get("explanation", "")
        
        # Extract and sanitize d2_code
        d2_code = data.get("d2_code", "").strip()
        d2_code = re.sub(r'^```(?:d2)?\s*', '', d2_code, flags=re.I)
        d2_code = re.sub(r'\s*```$', '', d2_code)
        d2_code = _sanitize_d2(d2_code)
        print(f"  → Final D2 Source (Fixed):\n{d2_code}")

        # Merge diagram into explanation for frontend renderer
        if d2_code and "```d2" not in explanation:
            explanation += f"\n\n## 🗺️ Visual System Flowchart\n```d2\n{d2_code}\n```"

        # Fetch visuals using Wikipedia (Primary) with Pexels (Fallback)
        wiki_query = data.get("visual_query") or subtopic
        image_url = get_wikipedia_image(wiki_query)
        
        if not image_url:
            print(f"  → Wikipedia image not found for '{wiki_query}', falling back to Pexels...")
            stock_q = data.get("stock_query") or data.get("visual_query") or "technology computer"
            image_url = get_pexels_image(stock_q)

        video_url = get_pexels_video(data.get("video_query") or f"tutorial {subtopic}")

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
        response = client.chat.completions.create(
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

    # 2. Build PDF
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
        import requests
        from io import BytesIO
        
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
                        # For PDF simplicity, if inline is complex, we render as image or just bold/italic
                        # But CodeCogs supports \inline
                        try:
                            math_url = f"https://latex.codecogs.com/png.latex?%5Cinline%20%5Ccolor%7B%231a2e1f%7D%20{requests.utils.quote(math)}"
                            # We'll use Paragraph to keep it in flow if possible, 
                            # but ReportLab Paragraph <img> is tricky for dynamic sizes.
                            # So we'll just bold it for now or use a basic italic style
                            p_text += f"<i><b>{math}</b></i> "
                        except:
                            p_text += f"<i>{math}</i>"
                    else:
                        p_text += part
                if p_text.strip():
                    story.append(Paragraph(p_text, style))

    # Header
    story.append(Paragraph(_strip_md(subtopic), title_style))
    story.append(Paragraph(f"{_strip_md(topic)} · {domain} · Edunovas AI Notes", subtitle_style))
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
            resp = requests.get(img_url, timeout=5)
            if resp.ok:
                story.append(Image(BytesIO(resp.content), width=16*cm, height=8*cm))
                story.append(Spacer(1, 10))
    except: pass

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
            import requests
            from io import BytesIO
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
    story.append(Paragraph("Generated by Edunovas AI · For educational use only",
                             ParagraphStyle('Footer', parent=styles['Normal'],
                                            fontSize=8, textColor=colors.grey,
                                            alignment=TA_CENTER, spaceBefore=6)))

    doc.build(story)
    buffer.seek(0)
    return buffer
