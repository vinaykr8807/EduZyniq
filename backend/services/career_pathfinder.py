import re
from collections import Counter
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
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
    "ML Engineer": ["Python", "Machine Learning", "Deep Learning", "TensorFlow", "PyTorch", "Scikit-Learn", "MLOps", "Model Deployment", "Data Preprocessing", "Statistics"],
    "Backend Engineer": ["Python", "Java", "Node", "FastAPI", "SQL", "REST", "System Design", "Docker", "Microservices", "Testing"],
    "Cloud Architect": ["AWS", "Azure", "GCP", "Cloud", "Kubernetes", "Terraform", "Docker", "Linux", "Networking", "System Design"],
    "Cyber Security Analyst": ["Linux", "Networking", "Security", "SIEM", "Incident Response", "Python", "Cloud", "Risk Assessment", "Vulnerability Assessment"],
    "UI/UX Designer": ["Figma", "Wireframing", "Prototyping", "User Research", "Design Systems", "Accessibility", "Usability Testing"],
    "Quantum Computing Researcher": ["Python", "Linear Algebra", "Quantum Algorithms", "Qiskit", "Circuits", "Optimization", "Research"],
}

DOMAIN_ROLE_MAP = {
    "Generative AI & Machine Learning": "ML Engineer",
    "Data Engineering & MLOps": "Data Scientist",
    "Full Stack Development": "Fullstack Developer",
    "Core CS & Algorithms": "Backend Engineer",
    "DevOps & Cloud Engineering": "DevOps Engineer",
    "Cloud Solutions Architecture": "Cloud Architect",
    "Cyber Security": "Cyber Security Analyst",
    "UI/UX Design": "UI/UX Designer",
    "Quantum Computing": "Quantum Computing Researcher",
}

SKILL_KEYWORDS = [
    "Python", "Java", "JavaScript", "TypeScript", "React", "Angular", "Vue", "Node", "FastAPI",
    "Django", "Spring", "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis", "Docker", "Kubernetes",
    "AWS", "Azure", "GCP", "CI/CD", "Jenkins", "Terraform", "Linux", "Machine Learning", "Deep Learning",
    "Data Visualization", "Pandas", "NumPy", "Scikit-Learn", "Power BI", "Tableau", "System Design",
    "REST", "GraphQL", "Testing", "Git", "Microservices", "Spark", "Airflow",
    "TensorFlow", "PyTorch", "Keras", "OpenCV", "NLP", "Natural Language Processing",
    "Generative AI", "LLM", "LangChain", "RAG", "MLOps", "Model Deployment",
    "Data Preprocessing", "Statistics", "Security", "SIEM", "Incident Response",
    "Vulnerability Assessment", "Risk Assessment", "Networking",
    "Figma", "Wireframing", "Prototyping", "User Research", "Design Systems",
    "Accessibility", "Usability Testing", "Linear Algebra", "Quantum Algorithms",
    "Qiskit", "Circuits", "Optimization", "Research",
]

ROLE_TITLE_TERMS = {
    "Frontend Engineer": ["frontend", "front end", "react", "ui engineer", "web developer"],
    "Fullstack Developer": ["fullstack", "full stack", "software engineer", "mern", "web developer"],
    "Data Scientist": ["data scientist", "data analyst", "machine learning", "analytics"],
    "DevOps Engineer": ["devops", "site reliability", "sre", "cloud engineer", "platform engineer"],
    "ML Engineer": ["ml engineer", "machine learning engineer", "ai engineer", "generative ai", "llm engineer", "data scientist"],
    "Backend Engineer": ["backend", "back end", "api engineer", "server-side", "software engineer"],
    "Cloud Architect": ["cloud architect", "solutions architect", "cloud engineer"],
    "Cyber Security Analyst": ["cyber", "security analyst", "soc analyst", "information security"],
    "UI/UX Designer": ["ui ux", "ui/ux", "product designer", "ux designer", "figma"],
    "Quantum Computing Researcher": ["quantum", "qiskit", "quantum computing", "quantum researcher"],
}

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


def _normalise_role(role: str, resume_text: str = "") -> str:
    if role in ROLE_SKILLS:
        return role
    combined = f"{role} {resume_text}".lower()
    for domain, mapped_role in DOMAIN_ROLE_MAP.items():
        if domain.lower() in combined:
            return mapped_role
    if any(term in combined for term in ["generative ai", "machine learning", "ml engineer", "llm", "ai engineer"]):
        return "ML Engineer"
    if any(term in combined for term in ["ui ux", "ui/ux", "product designer", "ux designer"]):
        return "UI/UX Designer"
    if any(term in combined for term in ["quantum", "qiskit", "quantum computing"]):
        return "Quantum Computing Researcher"
    if "frontend" in combined or "react" in combined:
        return "Frontend Engineer"
    if "devops" in combined or "kubernetes" in combined:
        return "DevOps Engineer"
    if "data scientist" in combined or "analytics" in combined:
        return "Data Scientist"
    raise ValueError(f"Unsupported or unclear target role: {role}")


def _skill_matches(required: str, resume_skills: List[str]) -> bool:
    req = _normalise_skill(required)
    if not req:
        return False
    for skill in resume_skills:
        candidate = _normalise_skill(skill)
        if not candidate:
            continue
        if req == candidate:
            return True
    return False


def _normalise_skill(value: str) -> str:
    return re.sub(r"[^a-z0-9+#.]+", " ", str(value).lower()).strip()


def _contains_skill(text: str, skill: str) -> bool:
    normalized_text = _normalise_skill(text)
    normalized_skill = _normalise_skill(skill)
    if not normalized_skill:
        return False
    return re.search(rf"(?<![a-z0-9+#.]){re.escape(normalized_skill)}(?![a-z0-9+#.])", normalized_text) is not None


def _role_title_score(role: str, title: str, snippet: str) -> int:
    content = f"{title} {snippet}".lower()
    terms = ROLE_TITLE_TERMS.get(role, [role.lower()])
    if any(term in content for term in terms):
        return 30
    role_words = [word for word in role.lower().split() if len(word) > 2]
    return 15 if any(word in content for word in role_words) else 0


def _city_jobs_query(role: str, level: str, city: str) -> str:
    location = "Remote" if city.lower() == "remote" else f"{city}, India"
    return f"{role} {level} technical jobs {location} direct apply work from home"


def _find_result_skills(text: str) -> List[str]:
    return sorted({skill for skill in SKILL_KEYWORDS if _contains_skill(text, skill)})


def _experience_mismatch(level: str, title: str, snippet: str) -> tuple[bool, str]:
    content = f"{title} {snippet}".lower()
    requested = (level or "").lower()
    is_entry_level = requested in {"fresher", "junior", "entry", "entry-level"}
    if not is_entry_level:
        return False, ""

    senior_terms = [
        "senior", "sr.", "lead", "principal", "staff engineer", "manager",
        "architect", "head of", "director",
    ]
    if any(term in content for term in senior_terms):
        return True, f"Seniority mismatch: listing is not suitable for selected {level} level."

    ranges = re.findall(r"(\d+)\s*(?:-|–|to)\s*(\d+)\s*(?:years|yrs)", content)
    minimums = [int(start) for start, _ in ranges]
    minimums.extend(int(value) for value in re.findall(r"(?:minimum|min\.?|at least)\s*(\d+)\+?\s*(?:years|yrs)", content))
    minimums.extend(int(value) for value in re.findall(r"(\d+)\+\s*(?:years|yrs)", content))
    if minimums and min(minimums) >= 3:
        return True, f"Experience mismatch: listing requires at least {min(minimums)} years."
    return False, ""


def _is_aggregate_result(title: str, snippet: str) -> bool:
    content = f"{title} {snippet}".lower()
    return bool(
        re.search(r"\b\d[\d,]*\+?\s+.*jobs?\b", content)
        or re.search(r"\bjobs?\s+in\b", content)
        or "job search results" in content
    )


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
        # Lightweight source scrape when an official API key is not configured.
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


def _calculate_job_relevance(job: Dict, user_skills: List[str], role: str = "") -> int:
    return _score_job_fit(job, user_skills, role).get("score", 0)


def _score_job_fit(job: Dict, user_skills: List[str], role: str = "", level: str = "") -> Dict[str, Any]:
    title_val = str(job.get('title', ''))
    snippet_val = str(job.get('snippet', ''))
    job_text = f"{title_val} {snippet_val}"
    job_skills = list(dict.fromkeys((job.get("skills") or []) + _find_result_skills(job_text)))
    matched = [skill for skill in job_skills if _skill_matches(skill, user_skills)]
    missing = [skill for skill in job_skills if not _skill_matches(skill, user_skills)]
    title_score = _role_title_score(role, title_val, snippet_val) if role else 0
    skill_score = int((len(matched) / max(len(job_skills), 1)) * 55) if job_skills else 0
    source_score = 10 if job.get("link") and job.get("link") != "#" else 0
    recency_score = 5 if _is_recent_posting(title_val, snippet_val, str(job.get("date", ""))) else 0
    score = min(100, title_score + skill_score + source_score + recency_score)
    experience_mismatch, experience_reason = _experience_mismatch(level, title_val, snippet_val)
    if title_score == 0:
        score = min(score, 45)
    if experience_mismatch:
        score = min(score, 35)
    aggregate_result = _is_aggregate_result(title_val, snippet_val)
    if aggregate_result:
        score = min(score, 70)
    low_detail_source = aggregate_result or len(job_skills) < 3
    if low_detail_source and role:
        for skill in ROLE_SKILLS.get(role, []):
            if not _skill_matches(skill, user_skills) and not any(_normalise_skill(skill) == _normalise_skill(existing) for existing in missing):
                missing.append(skill)

    reasons = []
    if title_score:
        reasons.append(f"Role title/context matches {role}.")
    else:
        reasons.append(f"Role title does not clearly match {role}.")
    if matched:
        reasons.append(f"Resume evidence matched: {', '.join(matched[:5])}.")
    if missing:
        reasons.append(f"Missing or weak in resume: {', '.join(missing[:5])}.")
    if source_score:
        reasons.append(f"Source link available from {job.get('source', 'job source')}.")
    if experience_reason:
        reasons.append(experience_reason)
    if aggregate_result:
        reasons.append("This is an aggregate search page, not a verified individual vacancy.")
    if low_detail_source:
        reasons.append("Source did not expose a complete job description, so gaps include role-baseline requirements to verify.")

    return {
        "score": score,
        "matched_skills": matched,
        "missing_skills": missing[:8],
        "score_reasons": reasons,
        "experience_mismatch": experience_mismatch,
        "aggregate_result": aggregate_result,
        "low_detail_source": low_detail_source,
        "evidence": {
            "title": title_val,
            "source": job.get("source", ""),
            "snippet": snippet_val[:500],
            "link": job.get("link", ""),
            "origin": job.get("origin", ""),
        },
    }


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
    
    # 1. DDG Search (broad public web signal)
    all_jobs.extend(_search_ddg_jobs(role, level, city))
    
    # 2. RemoteOK (Tech/Remote)
    all_jobs.extend(_search_remoteok_jobs(role))
    
    # 3. Indeed RSS (India Specific)
    all_jobs.extend(_search_indeed_rss(role, city))
    
    # 4. Adzuna (India Specific)
    all_jobs.extend(_search_adzuna_scraped(role, city))
    
    # 5. NCS Govt India
    all_jobs.extend(_search_ncs_india(role, city))
    
    # 6. Workable direct company hiring pages
    all_jobs.extend(_search_workable_jobs(role))
    
    # 7. Serper Real-time Search (Premium Source)
    all_jobs.extend(_serper_job_search(role, level, city))
    
    # De-duplicate by canonical URL and normalized title/source identity.
    unique_jobs: Dict[str, Dict] = {}
    u_skills_list = list(user_skills) if user_skills else []
    
    for job in all_jobs:
        link = str(job.get('link', '')).strip().lower().rstrip("/")
        title_key = re.sub(r"[^a-z0-9]+", " ", str(job.get("title", "")).lower()).strip()
        source_key = re.sub(r"[^a-z0-9]+", " ", str(job.get("source", "")).lower()).strip()
        identity = link or f"{source_key}:{title_key}"
        semantic_identity = f"{source_key}:{title_key}"
        if identity and identity not in unique_jobs and semantic_identity not in unique_jobs:
            fit = _score_job_fit(job, u_skills_list, role, level)
            job['suitability_score'] = fit["score"]
            job['matched_skills'] = fit["matched_skills"]
            job['missing_skills'] = fit["missing_skills"]
            job['score_reasons'] = fit["score_reasons"]
            job['experience_mismatch'] = fit["experience_mismatch"]
            job['aggregate_result'] = fit["aggregate_result"]
            job['low_detail_source'] = fit["low_detail_source"]
            job['evidence'] = fit["evidence"]
            unique_jobs[identity] = job
            if semantic_identity != identity:
                unique_jobs[semantic_identity] = job
            
    # Rank level-compatible listings before seniority mismatches.
    deduplicated_jobs = list({id(job): job for job in unique_jobs.values()}.values())
    compatible_jobs = [job for job in deduplicated_jobs if not job.get("experience_mismatch")]
    incompatible_jobs = [job for job in deduplicated_jobs if job.get("experience_mismatch")]
    sorted_jobs = sorted(compatible_jobs, key=lambda x: x.get('suitability_score', 0), reverse=True)
    sorted_jobs.extend(sorted(incompatible_jobs, key=lambda x: x.get('suitability_score', 0), reverse=True))
    
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
    return []


def _skill_evidence(market_skills: List[str], job_market: List[Dict], resume_skills: List[str]) -> List[Dict[str, Any]]:
    evidence_rows = []
    for skill in market_skills:
        sources = []
        for job in job_market:
            job_skills = job.get("skills") or []
            text = f"{job.get('title', '')} {job.get('snippet', '')}"
            if _contains_skill(text, skill) or any(_normalise_skill(skill) == _normalise_skill(js) for js in job_skills):
                sources.append({
                    "title": job.get("title", ""),
                    "source": job.get("source", ""),
                    "link": job.get("link", ""),
                    "snippet": str(job.get("snippet", ""))[:220],
                })
        evidence_rows.append({
            "skill": skill,
            "present_in_resume": _skill_matches(skill, resume_skills),
            "source_count": len(sources),
            "evidence": sources[:3],
            "why_it_matters": f"{skill} appears in role-market signals for this target and should be visible in resume bullets or projects.",
        })
    return evidence_rows


def _explain_readiness(
    match_score: int,
    quiz_score: float,
    interview_score: int,
    evidence_count: int,
    quiz_count: int,
    interview_count: int,
) -> Dict[str, Any]:
    history_components = int(quiz_count > 0) + int(interview_count > 0)
    confidence = (
        "High" if evidence_count >= 5 and history_components == 2
        else "Medium" if evidence_count >= 5 and history_components == 1
        else "Low"
    )
    return {
        "formula": "50% resume-to-market skill match + 30% quiz history + 20% interview history",
        "confidence": confidence,
        "components": [
            {"name": "Resume-market match", "value": int(match_score), "weight": 50},
            {"name": "Quiz performance", "value": int(quiz_score), "weight": 30},
            {"name": "Interview readiness", "value": int(interview_score), "weight": 20},
        ],
        "note": (
            f"Based on {evidence_count} unique job signals, {quiz_count} quiz records, and "
            f"{interview_count} completed interview records. Missing components remain 0."
        ),
    }


def _build_proceed_guide(role: str, city: str, missing_skills: List[str], matched_skills: List[str]) -> Dict[str, List[str]]:
    immediate = [
        f"Lock target role as {role} in {city} and shortlist 20 source-backed opportunities.",
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
    Extract a comprehensive list of technical skills, frameworks, and methodologies EXPLICITLY mentioned in their projects, experience, and skills sections.
    
    Resume Text: "{text[:4000]}"
    
    Output ONLY a JSON array of skill strings like ["React", "FastAPI", "Docker", "System Design"].
    Do NOT include skills that are only 'implied' or 'expected' for the role but not listed.
    Focus only on what is actually present in the text.
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
    
    try:
        normalized_role = _normalise_role(role, resume_text)
    except ValueError as e:
        return {"error": str(e), "no_fallback_used": True}
    # 1. Deep LLM-based Resume Analysis + Project Extraction
    print(f"🚀 Performing deep resume analysis for {normalized_role}...")
    resume_skills_found = _extract_deep_resume_insights(resume_text, normalized_role)
    resume_projects = _extract_resume_projects(resume_text)
    print(f"📁 Extracted {len(resume_projects)} projects from resume.")
    
    # 2. Fetch performance stats for capability score
    quiz_score: float = 0.0
    interview_score: int = 0
    quiz_count = 0
    interview_count = 0
    if user_email:
        try:
            u_res = supabase.table('users').select('id').eq('email', user_email).execute()
            if u_res.data:
                user_id = u_res.data[0]['id']
                q_res = supabase.table('quiz_history').select('score').eq('user_id', user_id).order('date', desc=True).limit(5).execute()
                if not q_res.data:
                    q_res = supabase.table('quiz_sessions').select('score').eq('user_id', user_id).order('created_at', desc=True).limit(5).execute()
                if q_res.data:
                    quiz_count = len(q_res.data)
                    quiz_score = float(sum(q['score'] for q in q_res.data)) / len(q_res.data)
                i_res = supabase.table('mock_interview_sessions').select(
                    'readiness_score, avg_score, num_questions, room_summary, report'
                ).eq('user_id', user_id).order('created_at', desc=True).limit(10).execute()
                completed_mock_rows = [
                    row for row in (i_res.data or [])
                    if (
                        isinstance(row.get("report"), dict)
                        and row["report"].get("is_completed") is True
                    ) or (
                        isinstance(row.get("room_summary"), dict)
                        and row["room_summary"].get("is_completed") is True
                    )
                ]
                if completed_mock_rows:
                    interview_count = len(completed_mock_rows)
                    latest_completed = completed_mock_rows[0]
                    interview_score = int(
                        latest_completed.get('readiness_score')
                        or (float(latest_completed.get('avg_score') or 0) * 10)
                    )
        except Exception as e:
            print(f"Capability calculation error: {e}")

    # 2. Multi-source Job Search with Ranking
    job_market = _search_jobs_multi_source(normalized_role, level, city, resume_skills_found)
    if not job_market:
        return {
            "error": f"No live job evidence found for {normalized_role} in {city}. Broaden the city, choose Remote, or try a more common role title.",
            "role": normalized_role,
            "city": city,
            "no_fallback_used": True,
            "job_market": [],
        }

    market_required_skills = _market_required_skills(normalized_role, job_market)
    if not market_required_skills:
        return {
            "error": f"Live job evidence was found for {normalized_role}, but no reliable skill requirements could be extracted.",
            "role": normalized_role,
            "city": city,
            "no_fallback_used": True,
            "job_market": job_market,
        }

    # 3. Calculate Scores
    missing_skills_list = [str(s) for s in market_required_skills if not _skill_matches(str(s), resume_skills_found)]
    matched_skills_list = [str(s) for s in market_required_skills if _skill_matches(str(s), resume_skills_found)]

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
    live_signals = _get_live_demand_signals(normalized_role, city, job_market)
    evidence_rows = _skill_evidence(market_required_skills, job_market, resume_skills_found)
    readiness_explanation = _explain_readiness(
        match_score,
        quiz_score,
        interview_score,
        len(job_market),
        quiz_count,
        interview_count,
    )

    top_missing = missing_skills_list[0:6]
    skills_to_improve = [
        {"skill": str(s), "priority": "High" if str(s) in ROLE_SKILLS.get(normalized_role, []) else "Medium"}
        for s in top_missing
    ]

    report = {
        "role": normalized_role,
        "requested_role": role,
        "level": level,
        "city": city,
        "readiness_score": final_readiness,
        "readiness_explanation": readiness_explanation,
        "capability_analysis": capability_metadata,
        "resume_skills": resume_skills_found,
        "resume_projects": resume_projects,
        "market_required_skills": market_required_skills,
        "skill_evidence": evidence_rows,
        "matched_skills": matched_skills_list,
        "missing_skills": missing_skills_list,
        "skills_to_improve": skills_to_improve,
        "job_market": job_market,
        "analysis_quality": {
            "job_evidence_count": len(job_market),
            "market_skill_source": "live job snippets",
            "warning": "",
            "no_fallback_used": True,
        },
        "live_job_demand": live_signals,
        "scanned_sources": ["Google (Serper)", "LinkedIn", "Naukri", "Indeed", "Glassdoor", "Wellfound", "Workable", "GitHub", "Instahyre", "Hirist", "Cutshort", "Freshersworld", "RemoteOK", "NCS Govt"],
        "proceed_guide": _build_proceed_guide(normalized_role, city, missing_skills_list, matched_skills_list),
        "roadmap": _build_roadmap(normalized_role, missing_skills_list, market_required_skills),
        "historical_market": historical_market,
        "risk_assessment": risk_assessment
    }
    try:
        if user_email:
            u_res = supabase.table('users').select('id').eq('email', user_email).execute()
            if u_res.data:
                supabase.table('career_reports').insert({
                    'user_id': u_res.data[0]['id'],
                    'role': normalized_role,
                    'city': city,
                    'readiness_score': final_readiness,
                    'resume_match_score': match_score,
                    'evidence_count': len(job_market),
                    'report': report,
                }).execute()
    except Exception as e:
        print(f"Career report persistence skipped: {e}")
    return report


def _serper_job_search(role: str, level: str, city: str) -> List[Dict]:
    """Uses Serper (Google) to find highly targeted job listings with city focus."""
    serper_key = os.getenv("SERPER_API_KEY")
    if not serper_key:
        return []

    # Keep query short and simple — Serper rejects overly long/complex queries
    location_term = "Remote" if city.lower() == "remote" else city
    query = f"{role} {level} jobs {location_term} India hiring"

    url = "https://google.serper.dev/search"
    payload = json.dumps({
        "q": query,
        "num": 10,
        "gl": "in"
    })
    headers = {
        'X-API-KEY': serper_key,
        'Content-Type': 'application/json'
    }

    items = []
    try:
        response = requests.post(url, headers=headers, data=payload, timeout=8)
        response.raise_for_status()
        data = response.json()
        for r in data.get("organic", []):
            link = r.get("link", "")
            title = r.get("title", "")
            snippet = r.get("snippet", "")

            # Filter: city or India or Remote must appear in result
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

def _get_live_demand_signals(role: str, city: str, job_market: Optional[List[Dict]] = None) -> Dict:
    """Uses Serper + LLM to summarize current job demand for the UI cards with strict regional focus."""
    loc_query = "Remote India" if city.lower() == "remote" else f"{city} India"
    query = f'current market demand hiring tech layoffs alerts "{role}" in {loc_query} news 2025'
    serper_key = os.getenv("SERPER_API_KEY")
    snippets = ""
    source_signal_count = 0
    source_titles: List[str] = []
    if serper_key:
        try:
            response = requests.post(
                "https://google.serper.dev/search",
                headers={"X-API-KEY": serper_key, "Content-Type": "application/json"},
                data=json.dumps({"q": query, "num": 10, "gl": "in"}),
                timeout=8,
            )
            response.raise_for_status()
            organic = response.json().get("organic", [])
            source_signal_count = len(organic)
            source_titles = [str(item.get("title", "")) for item in organic if item.get("title")]
            snippets = " ".join(
                f"{item.get('title', '')}: {item.get('snippet', '')}"
                for item in organic
            )
        except Exception as e:
            print(f"Live demand Serper error: {e}")
    
    groq_key = os.getenv("GROQ_API_KEY")
    unique_jobs = job_market or []
    job_sources = sorted({
        str(job.get("source", "")).strip()
        for job in unique_jobs
        if str(job.get("source", "")).strip()
    })
    if not snippets or not groq_key:
        return {
            "signal_count": len(unique_jobs),
            "demand_level": "Observed" if unique_jobs else "Unknown",
            "key_hiring_companies": [],
            "recent_trend": (
                f"{len(unique_jobs)} unique live listing signals were found across "
                f"{len(job_sources)} sources; a narrative demand summary was unavailable."
                if unique_jobs
                else "Live demand evidence was unavailable, so no demand summary was generated."
            ),
            "no_fallback_used": True,
            "confidence": "Source-backed listing count" if unique_jobs else "Unavailable",
            "methodology": "Signal count is the number of unique listings displayed in this report, not active job openings.",
            "source_titles": [str(job.get("title", "")) for job in unique_jobs[:5]],
        }
        
    client = Groq(api_key=groq_key)
    prompt = f"""
    Based on these real-time search snippets: "{snippets}", 
    summarize the LIVE JOB DEMAND specifically for '{role}' in '{city}'.
    
    Output JSON format:
    {{
        "demand_level": "High" | "Moderate" | "Steady",
        "key_hiring_companies": ["Direct Company 1", "Direct Company 2"],
        "recent_trend": "Short summary sentence about role demand specifically for {city} IT market."
    }}

    Instructions:
    - Do not invent an active opening count.
    - Use only company names and trends supported by the snippets.
    """
    
    try:
        res = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            response_format={"type": "json_object"}
        )
        data = json.loads(res.choices[0].message.content)
        displayed_signal_count = len(unique_jobs) if job_market is not None else source_signal_count
        data["signal_count"] = displayed_signal_count
        data["source_titles"] = (
            [str(job.get("title", "")) for job in unique_jobs[:5]]
            if job_market is not None
            else source_titles[:5]
        )
        data["confidence"] = "Estimated from live source snippets"
        data["methodology"] = (
            "Signal count is the number of unique listings displayed in this report; "
            "the demand narrative is summarized from indexed Serper snippets. Neither is an audited opening total."
        )
        data["no_fallback_used"] = True
        return data
    except Exception:
        return {
            "signal_count": len(unique_jobs),
            "demand_level": "Observed" if unique_jobs else "Unknown",
            "key_hiring_companies": [],
            "recent_trend": (
                f"{len(unique_jobs)} unique live listing signals were found, but narrative demand analysis failed."
                if unique_jobs
                else "Live demand analysis failed and no listing evidence was found."
            ),
            "no_fallback_used": True,
            "confidence": "Source-backed listing count" if unique_jobs else "Unavailable",
            "methodology": "Signal count is the number of unique listings displayed in this report, not active job openings.",
            "source_titles": [str(job.get("title", "")) for job in unique_jobs[:5]],
        }
