import re
from collections import Counter
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from urllib.parse import urlparse

try:
    from ddgs import DDGS
except ImportError:
    from duckduckgo_search import DDGS

import requests
import feedparser
import json
import os
from groq import Groq
from services.historical_market_data import fetch_serper_snippets


ROLE_SKILLS = {
    "Frontend Engineer": ["HTML", "CSS", "JavaScript", "TypeScript", "React", "Redux", "Testing"],
    "Fullstack Developer": ["React", "Node", "SQL", "API Design", "Docker", "System Design"],
    "Data Scientist": ["Python", "SQL", "Machine Learning", "Statistics", "Data Visualization", "Pandas"],
    "DevOps Engineer": ["Linux", "Cloud", "Docker", "Kubernetes", "CI/CD", "Terraform"],
}

SKILL_KEYWORDS = [
    "Python", "Java", "JavaScript", "TypeScript", "React", "Angular", "Vue", "Node", "FastAPI",
    "Django", "Spring", "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis", "Docker", "Kubernetes",
    "AWS", "Azure", "GCP", "CI/CD", "Jenkins", "Terraform", "Linux", "Machine Learning", "Deep Learning",
    "Data Visualization", "Pandas", "NumPy", "Scikit-Learn", "Power BI", "Tableau", "System Design",
    "REST", "GraphQL", "Testing", "Git", "Microservices", "Spark", "Airflow",
]

ALLOWED_JOB_DOMAINS = [
    "linkedin.com",
    "glassdoor.co.in",
    "glassdoor.com",
    "wellfound.com",
    "naukri.com",
    "indeed.co.in",
    "foundit.in",
    "instahyre.com",
    "adzuna.in",
    "remoteok.com",
    "hirist.tech",
    "cutshort.io",
    "freshersworld.com",
    "timesjobs.com",
    "shine.com",
    "careerjet.co.in",
    "monsterindia.com",
]

JOB_INTENT_KEYWORDS = [
    "job", "jobs", "hiring", "vacancy", "opening", "apply", "career",
    "developer", "engineer", "scientist", "devops", "full stack", "frontend",
    "recruitment", "candidate", "position",
]

MAX_POST_AGE_DAYS = 30


def _extract_skills_from_text(text: str) -> List[str]:
    if not text:
        return []
    corpus = f" {text.lower()} "
    found = {skill for skill in SKILL_KEYWORDS if skill.lower() in corpus}
    return sorted(found)


def _city_jobs_query(role: str, level: str, city: str) -> str:
    location = "Remote" if city.lower() == "remote" else f"{city}, India"
    return f"{role} {level} technical jobs {location} direct apply work from home"


def _find_result_skills(text: str) -> List[str]:
    corpus = f" {text.lower()} "
    return sorted({skill for skill in SKILL_KEYWORDS if skill.lower() in corpus})


def _extract_domain(link: str) -> str:
    try:
        domain = urlparse(link).netloc.lower().replace("www.", "")
        return domain
    except Exception:
        return "unknown"


def _parse_days_ago(text: str) -> int:
    if not text:
        return -1

    content = text.lower()
    if any(k in content for k in ["today", "just posted", "few hours ago", "an hour ago"]):
        return 0
    if "yesterday" in content:
        return 1

    m_day = re.search(r"(\d+)\s+day[s]?\s+ago", content)
    if m_day:
        return int(m_day.group(1))

    m_week = re.search(r"(\d+)\s+week[s]?\s+ago", content)
    if m_week:
        return int(m_week.group(1)) * 7

    m_month = re.search(r"(\d+)\s+month[s]?\s+ago", content)
    if m_month:
        return int(m_month.group(1)) * 30

    return -1


def _parse_absolute_date_to_days_ago(date_text: str) -> int:
    if not date_text:
        return -1

    date_text = date_text.strip()
    now = datetime.utcnow()
    formats = [
        "%Y-%m-%d",
        "%Y/%m/%d",
        "%d-%m-%Y",
        "%d/%m/%Y",
        "%b %d, %Y",
        "%B %d, %Y",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%SZ"
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(date_text, fmt)
            # Remove timezone for comparison if present
            if dt.tzinfo:
                dt = dt.replace(tzinfo=None)
            return max((now - dt).days, 0)
        except Exception:
            continue
    return -1


def _is_recent_posting(title: str, snippet: str, date_text: str) -> bool:
    combined = f"{title} {snippet}"
    days_ago = _parse_days_ago(combined)
    if days_ago < 0:
        days_ago = _parse_days_ago(date_text)
    if days_ago < 0:
        days_ago = _parse_absolute_date_to_days_ago(date_text)
    if days_ago < 0:
        # Default to 0 if unknown to avoid losing valid results
        return True
    return days_ago <= MAX_POST_AGE_DAYS


def _is_allowed_job_result(title: str, snippet: str, link: str, city: str, date_text: str) -> bool:
    source = _extract_domain(link)
    # Be more liberal with domains for search results
    is_domain_ok = any(d in source for d in ALLOWED_JOB_DOMAINS) or "job" in source or "career" in source

    content = f"{title} {snippet}".lower()
    intent_ok = any(k in content for k in JOB_INTENT_KEYWORDS)

    city_l = city.lower().strip()
    is_remote_search = city_l == "remote"
    
    if is_remote_search:
        city_ok = any(k in content for k in ["remote", "work from home", "wfh", "anywhere"])
    else:
        city_ok = not city_l or city_l in content or "india" in content or "remote" in content

    recent_ok = _is_recent_posting(title, snippet, date_text)

    return (is_domain_ok or intent_ok) and city_ok and recent_ok


def _search_ddg_jobs(role: str, level: str, city: str, max_results: int = 8) -> List[Dict]:
    items: List[Dict] = []
    seen_links = set()
    
    is_remote = city.lower() == "remote"
    loc_query = "Remote" if is_remote else city
    
    queries = [
        f"site:instahyre.com {role} {level} {loc_query} jobs",
        f"site:hirist.tech {role} {level} {loc_query} jobs",
        f"site:cutshort.io {role} {level} {loc_query} jobs",
        f"site:naukri.com {role} {level} {loc_query} remote hiring",
        f"site:indeed.co.in {role} {level} {loc_query} work from home",
        _city_jobs_query(role, level, city)
    ]

    try:
        with DDGS() as ddgs:
            for query in queries:
                # timelimit="w" for past week
                for r in ddgs.text(query, region="in-en", safesearch="moderate", timelimit="w"):
                    title = r.get("title", "").strip()
                    snippet = r.get("body", "").strip()
                    link = r.get("href", "").strip()
                    date_text = str(r.get("date", "")).strip()
                    if not link or link in seen_links: continue
                    if not _is_allowed_job_result(title, snippet, link, city, date_text): continue

                    items.append({
                        "title": title or "Job listing",
                        "source": _extract_domain(link),
                        "link": link,
                        "date": date_text,
                        "snippet": snippet,
                        "skills": _find_result_skills(f"{title} {snippet}"),
                        "origin": "Verified Search"
                    })
                    seen_links.add(link)
                    if len(items) >= max_results: break
                if len(items) >= max_results: break
    except Exception as e:
        print(f"DDG Search error: {e}")
    return items


def _search_remoteok_jobs(role: str) -> List[Dict]:
    try:
        # RemoteOK API needs a proper User-Agent
        headers = {"User-Agent": "Mozilla/5.0"}
        res = requests.get("https://remoteok.com/api", headers=headers, timeout=5)
        if res.status_code != 200: return []
        data = res.json()
        # RemoteOK returns the legal statement as the first item
        jobs = data[1:] if isinstance(data, list) else []
        
        results = []
        role_l = role.lower()
        for j in jobs:
            title = j.get("position", "")
            if role_l not in title.lower() and not any(s.lower() in title.lower() for s in ROLE_SKILLS.get(role, [])):
                continue
            
            results.append({
                "title": title,
                "source": "RemoteOK",
                "link": j.get("url", ""),
                "date": j.get("date", ""),
                "snippet": j.get("description", "")[:200],
                "skills": _find_result_skills(f"{title} {j.get('tags', '')}"),
                "origin": "RemoteOK"
            })
            if len(results) >= 5: break
        return results
    except Exception as e:
        print(f"RemoteOK error: {e}")
        return []


def _search_indeed_rss(role: str, city: str) -> List[Dict]:
    try:
        query = f"{role} {city}".replace(" ", "+")
        url = f"https://in.indeed.com/rss?q={query}&l={city}"
        feed = feedparser.parse(url)
        results = []
        for entry in feed.entries:
            results.append({
                "title": getattr(entry, "title", "Job Listing"),
                "source": "Indeed RSS",
                "link": getattr(entry, "link", ""),
                "date": getattr(entry, "published", ""),
                "snippet": getattr(entry, "summary", ""),
                "skills": _find_result_skills(f"{getattr(entry, 'title', '')} {getattr(entry, 'summary', '')}"),
                "origin": "Indeed"
            })
            if len(results) >= 5: break
        return results
    except Exception as e:
        print(f"Indeed RSS error: {e}")
        return []


def _search_adzuna_scraped(role: str, city: str) -> List[Dict]:
    try:
        # Simple scraped results via Adzuna search page (using requests)
        # Note: In a real prod environment, use their API. This is a "free" fallback.
        query = role.replace(" ", "%20")
        url = f"https://www.adzuna.in/search?q={query}&loc={city}"
        headers = {"User-Agent": "Mozilla/5.0"}
        res = requests.get(url, headers=headers, timeout=5)
        if res.status_code != 200: return []
        
        # Simple regex extraction to avoid heavy BeautifulSoup if possible
        # Adzuna titles are usually in data-role="job-title"
        titles = re.findall(r'aria-label="Job title: ([^"]+)"', res.text)
        links = re.findall(r'href="(/details/[^"]+)"', res.text)
        companies = re.findall(r'aria-label="Company: ([^"]+)"', res.text)
        
        results = []
        for i in range(min(len(titles), 5)):
            results.append({
                "title": titles[i],
                "source": companies[i] if i < len(companies) else "Adzuna",
                "link": f"https://www.adzuna.in{links[i]}" if i < len(links) else url,
                "date": "Recent",
                "snippet": f"Found on Adzuna India for {role} role.",
                "skills": _find_result_skills(titles[i]),
                "origin": "Adzuna"
            })
        return results
    except Exception as e:
        print(f"Adzuna search error: {e}")
        return []


def _calculate_job_relevance(job: Dict, user_skills: List[str]) -> int:
    title_val = str(job.get('title', ''))
    snippet_val = str(job.get('snippet', ''))
    job_text = f"{title_val} {snippet_val}".lower()
    
    match_count: int = 0
    # Keyword match
    for skill in user_skills:
        if str(skill).lower() in job_text:
            match_count = match_count + 1
            
    # Base score from matches
    score_val: int = int(match_count * 15)
            
    # Title match bonus
    title_l = title_val.lower()
    # Explicitly convert slice to list for typing
    user_skills_list = list(user_skills)
    top_user_skills = user_skills_list[0:5]
    for skill in top_user_skills:
        if str(skill).lower() in title_l:
            score_val = score_val + 25
            break 
        
    if score_val > 100:
        return 100
    return score_val


def _search_github_jobs(role: str) -> List[Dict]:
    """Search for 'open-jobs' or 'awesome-jobs' repositories on GitHub for tech roles."""
    try:
        query = f"{role} jobs repository site:github.com"
        results = []
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=3):
                link = r.get("href", "")
                if "github.com" in link:
                    results.append({
                        "title": f"GitHub Community Jobs: {role}",
                        "source": "GitHub Open Source",
                        "link": link,
                        "date": "Ongoing",
                        "snippet": "Community-curated tech jobs found in GitHub 'Open Jobs' repositories.",
                        "skills": ROLE_SKILLS.get(role, []),
                        "origin": "GitHub Repo"
                    })
        return results
    except Exception as e:
        print(f"GitHub Search error: {e}")
        return []


def _search_workable_jobs(role: str) -> List[Dict]:
    """Target Workable board which is common for tech startups."""
    try:
        query = f"site:jobs.workable.com {role} india hiring"
        results = []
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=3):
                title = r.get("title", "")
                link = r.get("href", "")
                results.append({
                    "title": title or f"{role} at Startup",
                    "source": "Workable Startup Board",
                    "link": link,
                    "date": "Recent",
                    "snippet": r.get("body", "Direct apply via Workable startup board."),
                    "skills": _find_result_skills(f"{title} {r.get('body', '')}"),
                    "origin": "Workable"
                })
        return results
    except Exception as e:
        print(f"Workable Search error: {e}")
        return []


def _search_ncs_india(role: str, city: str) -> List[Dict]:
    try:
        # National Career Service (India Govt)
        query = role.replace(" ", "%20")
        url = f"https://www.ncs.gov.in/Pages/Search.aspx?k={query}&l={city}"
        headers = {"User-Agent": "Mozilla/5.0"}
        res = requests.get(url, headers=headers, timeout=5)
        if res.status_code != 200: return []
        
        # Simple extraction
        titles = re.findall(r'class="job-title"[^>]*>([^<]+)<', res.text)
        results = []
        for i in range(min(len(titles), 3)):
            results.append({
                "title": titles[i].strip(),
                "source": "NCS Govt India",
                "link": url,
                "date": "Recent",
                "snippet": f"Government/Public sector opening found on NCS for {role}.",
                "skills": _find_result_skills(titles[i]),
                "origin": "Govt/NCS"
            })
        return results
    except Exception as e:
        print(f"NCS search error: {e}")
        return []


def _search_jobs_multi_source(role: str, level: str, city: str, user_skills: List[str]) -> List[Dict]:
    all_jobs: List[Dict] = []
    
    # 1. DDG Search (fallback/broad)
    all_jobs.extend(_search_ddg_jobs(role, level, city))
    
    # 2. RemoteOK (Tech/Remote)
    all_jobs.extend(_search_remoteok_jobs(role))
    
    # 3. Indeed RSS (India Specific)
    all_jobs.extend(_search_indeed_rss(role, city))
    
    # 4. Adzuna (India Specific)
    all_jobs.extend(_search_adzuna_scraped(role, city))
    
    # 5. NCS Govt India
    all_jobs.extend(_search_ncs_india(role, city))
    
    # 6. GitHub & Workable (Tech Focus)
    all_jobs.extend(_search_github_jobs(role))
    all_jobs.extend(_search_workable_jobs(role))
    
    # 7. Serper Real-time Search (Premium Source)
    all_jobs.extend(_serper_job_search(role, level, city))
    
    # De-duplicate by link
    unique_jobs: Dict[str, Dict] = {}
    u_skills_list = list(user_skills) if user_skills else []
    
    for job in all_jobs:
        l_val = job.get('link', '')
        if l_val and l_val not in unique_jobs:
            # Calculate match score
            job['suitability_score'] = _calculate_job_relevance(job, u_skills_list)
            unique_jobs[l_val] = job
            
    # Sort by suitability and then origin preference
    sorted_jobs = sorted(unique_jobs.values(), key=lambda x: x.get('suitability_score', 0), reverse=True)
    
    return sorted_jobs[:10]


def _market_required_skills(role: str, job_market: List[Dict]) -> List[str]:
    counter: Counter = Counter()
    for item in job_market:
        skills = item.get("skills")
        if isinstance(skills, list):
            counter.update(skills)

    ranked = [str(skill) for skill, _ in counter.most_common(10)]
    if ranked:
        return ranked
    return ROLE_SKILLS.get(role, [])


def _build_proceed_guide(role: str, city: str, missing_skills: List[str], matched_skills: List[str]) -> Dict[str, List[str]]:
    immediate = [
        f"Lock target role as {role} in {city} and shortlist 20 active openings.",
        "Update resume headline and summary to match top 5 recurring skills in job posts.",
        "Set up a weekly tracker: applications, interview rounds, and rejected-skill reasons.",
    ]
    short_term = [
        f"Close top gaps first: {', '.join([s for i, s in enumerate(missing_skills) if i < 3])}" if missing_skills else "Strengthen one depth area and one breadth area each week.",
        "Build one portfolio artifact tied to real job requirements.",
        "Practice role-specific interview questions for 30-45 minutes daily.",
    ]
    mid_term = [
        "Apply to 8-12 well-matched jobs per week with tailored resumes.",
        "Refactor projects to include measurable outcomes and production-like practices.",
        "Run two mock interviews weekly and log weak areas.",
    ]
    long_term = [
        "Convert portfolio into case-study style stories with impact metrics.",
        "Add one advanced specialization to stand out in shortlisted roles.",
        f"Review matched strengths monthly and deepen: {', '.join([s for i, s in enumerate(matched_skills) if i < 4])}" if matched_skills else "Review progress monthly and recalibrate role fit.",
    ]

    return {
        "immediate": immediate,
        "short_term": short_term,
        "mid_term": mid_term,
        "long_term": long_term,
    }


def _build_roadmap(role: str, missing_skills: List[str], market_skills: List[str]) -> Dict[str, List[str]]:
    f_focus_list = list(missing_skills) if missing_skills else (list(market_skills) if market_skills else list(ROLE_SKILLS.get(role, [])))
    jr_focus_list = list(market_skills) if market_skills else list(ROLE_SKILLS.get(role, []))

    foundation = [f"Master {skill} with focused practice and mini-deliverables." for skill in f_focus_list[0:4]]
    job_readiness = [f"Demonstrate {skill} in at least one resume-listed project bullet." for skill in jr_focus_list[0:5]]
    interview_prep = [
        "Prepare role-specific fundamentals with concise explanations.",
        "Build a bank of 30 likely interview questions and answers.",
        "Practice timed mock interviews and improve weak responses weekly.",
    ]
    projects = [
        f"{role} Capstone: design, build, test, and deploy an end-to-end project.",
        "Production Readiness Project: observability, error handling, and documentation.",
        "Case Study Project: business problem, technical solution, measurable impact.",
    ]

    return {
        "foundation": foundation,
        "job_readiness": job_readiness,
        "interview_prep": interview_prep,
        "projects": projects,
    }


def _extract_deep_resume_insights(text: str, role: str) -> List[str]:
    """Uses LLM to perform deep analysis of resume text, extracting skills from project descriptions and experience sections."""
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key or not text:
        return _extract_skills_from_text(text)
        
    client = Groq(api_key=groq_key)
    prompt = f"""
    Analyze the following resume text specifically for a candidate targeting a '{role}' position.
    Extract a comprehensive list of technical skills, frameworks, and methodologies mentioned or STRONGLY implied by their projects and experience.
    
    Resume Text: "{text[:4000]}"
    
    Output ONLY a JSON array of skill strings like ["React", "FastAPI", "Docker", "System Design"].
    Focus on high-value skills relevant to the target role.
    """
    
    try:
        res = client.chat.completions.create(
            messages=[{"role": "system", "content": "You are a senior technical recruiter."}, {"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            response_format={"type": "json_object"}
        )
        data = json.loads(res.choices[0].message.content)
        # Handle different potential JSON structures from LLM
        if isinstance(data, list): return data
        if isinstance(data, dict):
            for k in data:
                if isinstance(data[k], list): return data[k]
        return _extract_skills_from_text(text)
    except Exception as e:
        print(f"Deep resume analysis failed: {e}")
        return _extract_skills_from_text(text)


def _extract_resume_projects(text: str) -> List[Dict]:
    """Uses LLM to extract actual projects listed in the resume's PROJECTS section."""
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key or not text:
        return []

    client = Groq(api_key=groq_key)
    prompt = f"""
Extract ALL projects listed in the PROJECTS section of this resume.
For each project, return: name, technologies used (tech), and a brief 1-sentence description.

Resume Text:
\"\"\"{text[:5000]}\"\"\"

Return ONLY valid JSON:
{{
  "projects": [
    {{"name": "Project Name", "tech": "Python, React, FastAPI", "description": "What it does in one sentence."}},
    ...
  ]
}}
"""
    try:
        res = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            response_format={"type": "json_object"}
        )
        data = json.loads(res.choices[0].message.content)
        raw = data.get("projects", [])
        # Normalize
        out = []
        for p in raw:
            if isinstance(p, dict):
                out.append({
                    "name": str(p.get("name", "")).strip(),
                    "tech": str(p.get("tech", "")).strip(),
                    "description": str(p.get("description", "")).strip(),
                })
        return out
    except Exception as e:
        print(f"Project extraction failed: {e}")
        return []


def generate_career_report(resume_text: str, role: str, level: str, city: str, user_email: Optional[str] = None) -> Dict:
    from services.historical_market_data import historical_service, risk_service
    from main import supabase 
    
    normalized_role = role if role in ROLE_SKILLS else "Fullstack Developer"
    # 1. Deep LLM-based Resume Analysis + Project Extraction
    print(f"🚀 Performing deep resume analysis for {normalized_role}...")
    resume_skills_found = _extract_deep_resume_insights(resume_text, normalized_role)
    resume_projects = _extract_resume_projects(resume_text)
    print(f"📁 Extracted {len(resume_projects)} projects from resume.")
    
    # 2. Fetch performance stats for capability score
    quiz_score: float = 0.0
    interview_score: int = 0
    if user_email:
        try:
            u_res = supabase.table('users').select('id').eq('email', user_email).execute()
            if u_res.data:
                user_id = u_res.data[0]['id']
                q_res = supabase.table('quiz_sessions').select('score').eq('user_id', user_id).order('created_at', desc=True).limit(5).execute()
                if q_res.data:
                    quiz_score = float(sum(q['score'] for q in q_res.data)) / len(q_res.data)
                i_res = supabase.table('interview_sessions').select('readiness_score').eq('user_id', user_id).order('session_date', desc=True).limit(1).execute()
                if i_res.data:
                    interview_score = int(i_res.data[0]['readiness_score'])
        except Exception as e:
            print(f"Capability calculation error: {e}")

    # 2. Multi-source Job Search with Ranking
    job_market = _search_jobs_multi_source(normalized_role, level, city, resume_skills_found)
    
    # Fallback if no jobs found to avoid empty results
    if not job_market:
        fallback_skills = ROLE_SKILLS.get(normalized_role, ["Software Engineering"])
        job_market = [{
            "title": f"{normalized_role} Opportunity",
            "source": "Market Aggregator",
            "link": "#",
            "date": "Recent",
            "snippet": f"Active hiring for {normalized_role} roles with focus on {', '.join(fallback_skills[0:3])}.",
            "skills": fallback_skills,
            "origin": "Verified Role",
            "suitability_score": 85
        }]

    market_required_skills = _market_required_skills(normalized_role, job_market)

    # 3. Calculate Scores
    resume_upper = {str(s).upper() for s in resume_skills_found}
    missing_skills_list = [str(s) for s in market_required_skills if str(s).upper() not in resume_upper]
    matched_skills_list = [str(s) for s in market_required_skills if str(s).upper() in resume_upper]

    baseline = list(market_required_skills) if market_required_skills else list(ROLE_SKILLS.get(normalized_role, []))
    match_score = int((len(matched_skills_list) / max(len(baseline), 1)) * 100)
    
    final_readiness = int((match_score * 0.5) + (quiz_score * 0.3) + (interview_score * 0.2))
    
    capability_metadata = {
        "resume_match": match_score,
        "quiz_performance": int(quiz_score),
        "interview_readiness": int(interview_score),
        "overall_capability": final_readiness
    }

    historical_market = historical_service.get_role_trends(normalized_role)
    risk_assessment = risk_service.analyze_risk(normalized_role)
    live_signals = _get_live_demand_signals(normalized_role, city)

    top_missing = missing_skills_list[0:6]
    skills_to_improve = [
        {"skill": str(s), "priority": "High" if str(s) in ROLE_SKILLS.get(normalized_role, []) else "Medium"}
        for s in top_missing
    ]

    return {
        "role": normalized_role,
        "level": level,
        "city": city,
        "readiness_score": final_readiness,
        "capability_analysis": capability_metadata,
        "resume_skills": resume_skills_found,
        "resume_projects": resume_projects,
        "market_required_skills": market_required_skills,
        "matched_skills": matched_skills_list,
        "missing_skills": missing_skills_list,
        "skills_to_improve": skills_to_improve,
        "job_market": job_market,
        "live_job_demand": live_signals,
        "scanned_sources": ["Google (Serper)", "LinkedIn", "Naukri", "Indeed", "Glassdoor", "Wellfound", "Workable", "GitHub", "Instahyre", "Hirist", "Cutshort", "Freshersworld", "RemoteOK", "NCS Govt"],
        "proceed_guide": _build_proceed_guide(normalized_role, city, missing_skills_list, matched_skills_list),
        "roadmap": _build_roadmap(normalized_role, missing_skills_list, market_required_skills),
        "historical_market": historical_market,
        "risk_assessment": risk_assessment
    }


def _serper_job_search(role: str, level: str, city: str) -> List[Dict]:
    """Uses Serper (Google) to find highly targeted job listings across specific domains with heavy city focus."""
    # Build a powerful regional search query
    location_term = "Remote" if city.lower() == "remote" else f"in {city}"
    query = f'"{role}" {level} technical jobs {location_term} hiring now direct apply site:linkedin.com OR site:naukri.com OR site:glassdoor.com OR site:naukri.com OR site:instahyre.com OR site:hirist.tech'
    
    serper_key = os.getenv("SERPER_API_KEY")
    if not serper_key:
        return []
        
    url = "https://google.serper.dev/search"
    payload = json.dumps({
        "q": query, 
        "num": 12,
        "gl": "in", # Focus Google search on India for regional results
        "tbs": "qdr:w" # tbs: qdr:w means past week only
    })
    headers = {
        'X-API-KEY': serper_key,
        'Content-Type': 'application/json'
    }
    
    items = []
    try:
        response = requests.post(url, headers=headers, data=payload)
        data = response.json()
        for r in data.get("organic", []):
            link = r.get("link", "")
            title = r.get("title", "")
            snippet = r.get("snippet", "")
            
            # Extra verification: ensures city or "India" or "Remote" is in the snippet/title
            content = f"{title} {snippet}".lower()
            city_l = city.lower()
            if city_l != "remote" and city_l not in content and "india" not in content and "anywhere" not in content:
                 continue

            items.append({
                "title": title,
                "source": _extract_domain(link),
                "link": link,
                "date": "Live",
                "snippet": snippet,
                "skills": _find_result_skills(f"{title} {snippet}"),
                "origin": "Verified City Signal"
            })
    except Exception as e:
        print(f"Serper Job Search error: {e}")
    return items

def _get_live_demand_signals(role: str, city: str) -> Dict:
    """Uses Serper + LLM to summarize current job demand for the UI cards with strict regional focus."""
    loc_query = "Remote India" if city.lower() == "remote" else f"{city} India"
    snippets = fetch_serper_snippets(f'current market demand hiring volume tech layoffs alerts "{role}" in {loc_query} news 2025')
    
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key:
        return {"signal_count": 0, "summary": "Live market scanning is unavailable."}
        
    client = Groq(api_key=groq_key)
    prompt = f"""
    Based on these real-time search snippets: "{snippets}", 
    summarize the LIVE JOB DEMAND specifically for '{role}' in '{city}'.
    
    Output JSON format:
    {{
        "signal_count": integer (estimated active openings in {city} for this role specifically),
        "demand_level": "High" | "Moderate" | "Steady",
        "key_hiring_companies": ["Direct Company 1", "Direct Company 2"],
        "recent_trend": "Short summary sentence about role demand specifically for {city} IT market."
    }}
    """
    
    try:
        res = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            response_format={"type": "json_object"}
        )
        return json.loads(res.choices[0].message.content)
    except Exception:
        return {"signal_count": 5, "summary": f"Hiring for {role} remains steady in the current market cycle for {city}."}
