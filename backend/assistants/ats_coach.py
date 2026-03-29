import os
import json
import re
from groq import Groq

def calculate_ats_score(text: str, role: str):
    """
    Evaluates a resume text for ATS (Applicant Tracking System) compatibility.
    Returns a score breakdown and improvement suggestions.
    """
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return {
            "total_score": 0,
            "breakdown": {"parseability": 0, "keyword_match": 0, "impact_metrics": 0, "formatting": 0, "section_completeness": 0},
            "suggestions": ["API Key missing for analysis"]
        }

    client = Groq(api_key=api_key)
    
    prompt = f"""
    You are an expert ATS (Applicant Tracking System) Specialist and Senior Technical Recruiter.
    Evaluate the following resume text for a {role} position.
    
    RESUME TEXT:
    {text[:5000]}
    
    TASK:
    Evaluate the resume based on the following criteria (0-100 scale each):
    1. Parseability: Is the text clean, chronological, and free of complex tables/columns that break ATS?
    2. Keyword Match: How well does the terminology align with the {role} job domain?
    3. Impact Metrics: Are there quantifiable achievements (e.g., "Increased X by 20%", "Optimized Y")?
    4. Formatting & Layout: Professionalism of the structure (deduced from text flow).
    5. Section Completeness: Presence of Contact, Summary, Experience, Skills, Education.

    RETURN ONLY A JSON OBJECT:
    {{
        "total_score": number (average of breakdown),
        "breakdown": {{
            "parseability": number,
            "keyword_match": number,
            "impact_metrics": number,
            "formatting": number,
            "section_completeness": number
        }},
        "critical_keywords_found": ["skill1", "skill2"],
        "missing_critical_keywords": ["keywordA", "keywordB"],
        "improvement_suggestions": [
            "suggestion 1 (actionable)",
            "suggestion 2 (actionable)"
        ]
    }}
    """

    try:
        res = client.chat.completions.create(
            messages=[{"role": "system", "content": "You are a master of ATS optimization. Provide critical, high-fidelity scoring."}, {"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            response_format={"type": "json_object"}
        )
        data = json.loads(res.choices[0].message.content)
        return data
    except Exception as e:
        print(f"ATS Score Error: {e}")
        return {
            "total_score": 45,
            "breakdown": {"parseability": 50, "keyword_match": 40, "impact_metrics": 30, "formatting": 50, "section_completeness": 60},
            "suggestions": ["Failed to perform deep AI analysis. Reviewing basics recommended."]
        }
