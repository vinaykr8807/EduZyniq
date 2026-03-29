import os
import json
import re
from groq import Groq
from services.market_research import get_market_trends
from services.skill_extractor import detect_primary_domain, find_skill_gaps, ROLE_SKILLS


ROADMAP_TEMPLATES = {
    "Frontend Engineer": {
        "beginner": [
            "HTML & Semantic Markup: [forms, accessibility basics, SEO tags]",
            "Modern CSS: [flexbox, grid, responsive breakpoints]",
            "JavaScript Fundamentals: [ES6 syntax, array methods, async basics]",
        ],
        "intermediate": [
            "React Core: [components, state management, hooks]",
            "TypeScript for UI: [types, interfaces, component props]",
            "State & Data Flow: [Redux or Context, API integration, error states]",
        ],
        "advanced": [
            "Performance Engineering: [memoization, code splitting, lazy loading]",
            "Frontend Architecture: [design systems, folder strategy, testing pyramid]",
            "Production Readiness: [monitoring, security headers, CI checks]",
        ],
        "projects": [
            "E-commerce Frontend: [React, TypeScript, cart, payment UI]",
            "Dashboard Platform: [charts, auth guards, role-based navigation]",
        ],
    },
    "Fullstack Developer": {
        "beginner": [
            "Web Fundamentals: [HTTP, REST basics, JSON payload design]",
            "Frontend Basics: [React components, routing, forms]",
            "Backend Basics: [Node/FastAPI routes, validation, auth intro]",
        ],
        "intermediate": [
            "Database Design: [SQL schema design, indexing, joins]",
            "API Engineering: [pagination, error handling, rate limits]",
            "Deployment Workflow: [Docker basics, environment configs, CI]",
        ],
        "advanced": [
            "Scalable Systems: [caching, queues, horizontal scaling]",
            "Observability: [logs, metrics, tracing fundamentals]",
            "Security Hardening: [JWT best practices, OWASP checks, secret management]",
        ],
        "projects": [
            "Fullstack SaaS: [React, API service, PostgreSQL, auth]",
            "Realtime Collaboration Tool: [WebSocket, optimistic updates, role permissions]",
        ],
    },
    "Data Scientist": {
        "beginner": [
            "Python for Data: [NumPy, Pandas, data cleaning]",
            "Statistics Core: [probability, distributions, hypothesis testing]",
            "SQL for Analysis: [joins, aggregations, window functions]",
        ],
        "intermediate": [
            "Machine Learning Workflow: [feature engineering, model selection, evaluation]",
            "Data Visualization: [matplotlib/seaborn, storytelling, dashboarding]",
            "Model Validation: [cross-validation, leakage prevention, bias-variance]",
        ],
        "advanced": [
            "MLOps Basics: [model packaging, tracking, reproducible pipelines]",
            "Advanced Modeling: [ensemble methods, NLP/CV specialization]",
            "Business Impact Framing: [metric mapping, experimentation, ROI communication]",
        ],
        "projects": [
            "Churn Prediction System: [feature store, model monitoring, explainability]",
            "Recommendation Engine: [ranking logic, offline metrics, A/B testing plan]",
        ],
    },
    "DevOps Engineer": {
        "beginner": [
            "Linux Foundations: [shell, processes, permissions]",
            "Networking Basics: [DNS, load balancers, TLS basics]",
            "Container Fundamentals: [Docker images, compose, registries]",
        ],
        "intermediate": [
            "CI/CD Pipelines: [build/test/deploy stages, rollback strategy]",
            "Cloud Infrastructure: [compute, storage, IAM policies]",
            "Kubernetes Core: [pods, services, deployments]",
        ],
        "advanced": [
            "Infrastructure as Code: [Terraform modules, state management]",
            "Reliability Engineering: [SLO/SLI, incident response, runbooks]",
            "Security Operations: [secret rotation, policy enforcement, runtime security]",
        ],
        "projects": [
            "Production CI/CD Blueprint: [GitHub Actions, Kubernetes deploy, alerts]",
            "Cloud Platform Starter: [IaC, observability stack, autoscaling]",
        ],
    },
}


def _ensure_list(value):
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    if isinstance(value, str):
        return [v.strip() for v in re.split(r"[,;\n]+", value) if v.strip()]
    return []


def _extract_skills_from_text(text: str):
    if not text:
        return []
    normalized_text = f" {text.lower()} "
    candidate_skills = set()

    for skills in ROLE_SKILLS.values():
        for skill in skills:
            s = str(skill).strip()
            if not s:
                continue
            if s.lower() in normalized_text:
                candidate_skills.add(s)

    # Add common skills not always present in ROLE_SKILLS entries
    additional_skills = [
        "Python", "Java", "C++", "SQL", "NoSQL", "React", "Node", "FastAPI",
        "Docker", "Kubernetes", "AWS", "TypeScript", "JavaScript", "Pandas",
        "Machine Learning", "Statistics", "Linux", "CI/CD",
    ]
    for skill in additional_skills:
        if skill.lower() in normalized_text:
            candidate_skills.add(skill)

    return sorted(candidate_skills)


def _build_fallback_analysis(text: str, role: str):
    extracted_skills = _extract_skills_from_text(text)
    missing_skills = find_skill_gaps(extracted_skills, role)
    strong_domain = detect_primary_domain(extracted_skills)

    required = ROLE_SKILLS.get(role, [])
    if required:
        readiness_score = int((max(len(required) - len(missing_skills), 0) / len(required)) * 100)
    else:
        readiness_score = 35 if extracted_skills else 0

    roadmap = ROADMAP_TEMPLATES.get(role, ROADMAP_TEMPLATES["Fullstack Developer"])
    return {
        "extracted_skills": extracted_skills,
        "strong_domains": [strong_domain] if strong_domain else ["General"],
        "missing_skills": missing_skills,
        "readiness_score": readiness_score,
        "roadmap": roadmap,
    }


def _normalize_analysis(raw_analysis: dict, text: str, role: str):
    fallback = _build_fallback_analysis(text, role)
    analysis = raw_analysis if isinstance(raw_analysis, dict) else {}

    extracted = _ensure_list(
        analysis.get("extracted_skills")
        or analysis.get("skills")
        or analysis.get("technical_skills")
    )

    strong = _ensure_list(
        analysis.get("strong_domains")
        or analysis.get("domains")
        or analysis.get("strength_domains")
    )

    missing = _ensure_list(
        analysis.get("missing_skills")
        or analysis.get("critical_gaps")
        or analysis.get("gaps")
        or analysis.get("missing_competencies")
    )

    readiness = analysis.get("readiness_score")
    if isinstance(readiness, str):
        try:
            readiness = int(re.sub(r"[^\d]", "", readiness))
        except Exception:
            readiness = None
    if not isinstance(readiness, int):
        readiness = fallback["readiness_score"]

    raw_roadmap = analysis.get("roadmap", {})
    roadmap = {
        "beginner": _ensure_list(raw_roadmap.get("beginner")) if isinstance(raw_roadmap, dict) else [],
        "intermediate": _ensure_list(raw_roadmap.get("intermediate")) if isinstance(raw_roadmap, dict) else [],
        "advanced": _ensure_list(raw_roadmap.get("advanced")) if isinstance(raw_roadmap, dict) else [],
        "projects": _ensure_list(raw_roadmap.get("projects")) if isinstance(raw_roadmap, dict) else [],
    }

    # Fill missing sections with deterministic defaults so UI never renders blank panels.
    for phase in ("beginner", "intermediate", "advanced", "projects"):
        if not roadmap[phase]:
            roadmap[phase] = fallback["roadmap"][phase]

    merged_extracted = sorted(set(extracted + fallback["extracted_skills"]))
    merged_missing = sorted(set(missing + find_skill_gaps(merged_extracted, role)))
    merged_strong = sorted(set((strong or fallback["strong_domains"]) + [detect_primary_domain(merged_extracted)]))

    return {
        "extracted_skills": merged_extracted,
        "strong_domains": [d for d in merged_strong if d] or ["General"],
        "missing_skills": merged_missing,
        "readiness_score": max(min(readiness, 100), 0),
        "roadmap": roadmap,
    }

def analyze_resume_deep(text: str, role: str, level: str):
    api_key = os.getenv("GROQ_API_KEY")
    client = Groq(api_key=api_key) if api_key else None
    
    if not client:
        return _build_fallback_analysis(text, role)

    # STAGE 1: Extract Keyword Tags for Search
    tag_prompt = f"Extract 5-7 core technical 'search tags' from this resume that are most relevant for a {role} search on LinkedIn/Glassdoor. Resume: {text[:2000]}. Return ONLY a comma-separated list."
    try:
        tag_res = client.chat.completions.create(
            messages=[{"role": "user", "content": tag_prompt}],
            model="llama-3.3-70b-versatile"
        )
        search_tags = tag_res.choices[0].message.content
    except:
        search_tags = f"{role}, {level} skills"

    # STAGE 2: Targeted Market & Interview Research
    search_query = f"site:glassdoor.com OR site:linkedin.com OR site:levels.fyi {search_tags} technical interview questions architecture topics job requirements 2026"
    market_data = get_market_trends(search_query, max_results=8) # Higher search volume

    # STAGE 3: Final Analysis & Super-Detailed Roadmap
    prompt = f"""
    You are a Lead Career Architect. 
    Analyze the provided resume for {role} ({level} level) against current industry signals.
    
    INDUSTRY SIGNALS (Scraped from LinkedIn/Glassdoor):
    {market_data}
    
    RESUME DATA:
    {text[:4000]}
    
    TASK:
    1. Extract technical skills and strong domains.
    2. Identify CRITICAL GAPS specifically for the {role} role in today's market.
    3. Generate a "Super Detailed Digital Roadmap".
       - Each category (Beginner, Intermediate, Advanced) must contain 3-4 MAJOR TOPICS.
       - Each major topic MUST be formatted as: "Main Topic Name: [Subtopic A, Subtopic B, Subtopic C]".
       - Ensure the content is extremely granular and tailored to the gaps found.
    4. Provide 2-3 High-Impact Portfolio Project ideas.

    Return ONLY a JSON object:
    {{
        "extracted_skills": ["skill1", "skill2"],
        "strong_domains": ["domain1"],
        "missing_skills": ["skillA", "skillB"],
        "readiness_score": 75,
        "roadmap": {{
            "beginner": ["Basics of X: [Syntax, Variables, Memory Management]", "Env Setup: [IDE, Docker, Git]"],
            "intermediate": ["System Design: [Scalability, Sharding, Load Balancing]", "..."],
            "advanced": ["Deep Optimization: [Caching, Profiling, Assembler hacks]", "..."],
            "projects": ["Fullstack App: [Using React, FastAPI, Redis]", "..."]
        }}
    }}
    """
    
    try:
        chat_completion = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            response_format={"type": "json_object"},
            stream=False
        )
        analysis = json.loads(chat_completion.choices[0].message.content)
        return _normalize_analysis(analysis, text, role)
    except Exception as e:
        print(f"Deep Analysis Error: {e}")
        return _build_fallback_analysis(text, role)
