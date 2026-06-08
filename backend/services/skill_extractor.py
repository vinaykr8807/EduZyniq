import json
import requests
from llm_service import OLLAMA_HOST, OLLAMA_MODEL

DOMAIN_MAP = {
    "Web Development": ["HTML", "CSS", "JavaScript", "React", "Node", "TypeScript", "Vue", "Angular"],
    "Data Science": ["Python", "Pandas", "NumPy", "Matplotlib", "Scikit-Learn", "SQL", "Statistics"],
    "AI/ML": ["TensorFlow", "PyTorch", "Deep Learning", "CNN", "RNN", "NLP", "Computer Vision"],
    "Backend": ["Node", "Django", "Spring", "FastAPI", "Go", "Java", "PHP", "PostgreSQL", "MongoDB"],
    "DevOps": ["Docker", "Kubernetes", "AWS", "CI/CD", "Jenkins", "Terraform", "Ansible"],
    "UI/UX Design": ["Figma", "Wireframing", "Prototyping", "User Research", "Design Systems"],
    "Quantum Computing": ["Qiskit", "Quantum Algorithms", "Linear Algebra", "Circuits"],
}

ROLE_SKILLS = {
    "Frontend Engineer": ["HTML", "CSS", "JavaScript", "React", "Redux", "TypeScript"],
    "Fullstack Developer": ["React", "Node", "SQL", "HTML", "CSS", "JavaScript", "API Design"],
    "Data Scientist": ["Python", "SQL", "Machine Learning", "Statistics", "Data Visualization"],
    "Backend Engineer": ["Node" or "Python", "SQL", "NoSQL", "System Design", "Docker"],
    "DevOps Engineer": ["Cloud (AWS/Azure)", "Docker", "Kubernetes", "CI/CD", "Linux"],
    "Cloud Architect": ["AWS", "Azure", "GCP", "Terraform", "Networking"],
    "Cyber Security Analyst": ["Networking", "Linux", "SIEM", "Incident Response", "Security"],
    "ML Engineer": ["Python", "Machine Learning", "Deep Learning", "MLOps"],
    "UI/UX Designer": ["Figma", "Wireframing", "Prototyping", "User Research"],
    "Quantum Computing Researcher": ["Qiskit", "Quantum Algorithms", "Linear Algebra"]
}

def extract_skills_with_llm(resume_text):
    prompt = f"""
    Analyze the following resume text and extract technical skills.
    Categorize them into: Programming Languages, Frameworks, Tools, and Domains.
    
    Resume Text:
    {resume_text[:4000]}
    
    Return the result in JSON format ONLY:
    {{
        "languages": ["python", "js"],
        "frameworks": ["react", "fastapi"],
        "tools": ["docker", "git"],
        "domains": ["Web Development", "Backend"]
    }}
    """
    
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "format": "json",
        "stream": False
    }
    
    try:
        response = requests.post(f"{OLLAMA_HOST}/api/generate", json=payload, timeout=60)
        res_json = response.json()
        return json.loads(res_json['response'])
    except Exception as e:
        print(f"Skill Extraction Error: {e}")
        return {"languages": [], "frameworks": [], "tools": [], "domains": []}

def detect_primary_domain(skills_list):
    domain_score = {}
    skills_upper = [s.upper() for s in skills_list]

    for domain, techs in DOMAIN_MAP.items():
        score = sum(1 for tech in techs if tech.upper() in skills_upper)
        domain_score[domain] = score

    if not domain_score or max(domain_score.values()) == 0:
        return "General"
        
    return max(domain_score, key=domain_score.get)

def find_skill_gaps(user_skills, target_role):
    required = ROLE_SKILLS.get(target_role, [])
    if not required: return []
    
    user_skills_upper = [s.upper() for s in user_skills]
    missing = [s for s in required if s.upper() not in user_skills_upper]
    return missing
