import os
import json
from typing import Optional
from groq import Groq
import requests
from services.wikipedia_service import get_wikipedia_image

PEXELS_API_KEY = os.getenv("PEXELS_API_KEY")

def get_image(query, page=1):
    """Fetches high-quality technical images, prioritizing Wikipedia diagrams with Pexels fallback."""
    try:
        # get_wikipedia_image already handles Pexels fallback internally
        return get_wikipedia_image(query)
    except Exception as e:
        print(f"Image Fetch Error: {e}")
        return None

def generate_dynamic_quiz(subject: str, topic: str, difficulty: str, mode: str = "standard", domain: Optional[str] = None, subtopic: Optional[str] = None):
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return []
        
    client = Groq(api_key=api_key)
    
    context_str = f"in {domain}" if domain else ""
    subtopic_str = f"specifically on {subtopic}" if subtopic else ""
    
    # Mode-specific prompt additions
    if mode == "targeted":
        instruction = f"This is a TARGETED RECOVERY QUIZ. The student has shown weakness in: {subtopic or topic}. Generate questions that specifically diagnose their misunderstanding. For fill-in-the-blank types, use declarative statements with blanks (_______)."
    else:
        instruction = f"Generate a 10-question mixed-mode technical assessment. Include a mix of: 1. Conceptual MCQs, 2. True/False nuances, 3. 'Match the Following' (4 pairs), 4. Fill-in-the-blank statements (_______), and 5. Image-Based analysis. Difficulty: {difficulty}."

    prompt = f"""
    You are an expert technical interviewer and educator. 
    Create a {difficulty} level technical quiz for a student learning {subject} {context_str}.
    The quiz should be {subtopic_str} (under the broader topic of {topic}).
    
    QUIZ MODE: {mode.upper()}
    Instruction: {instruction}
    
    Rules:
    - Generate 10 questions.
    - Format: JSON object with "quiz" key containing a list.
    - Each question must have: 
        "question": string (conceptual prompt or statement),
        "options": list of 4 strings (REQUIRED),
        "answer": string (exactly matches one option),
        "explanation": string,
        "topic_tag": string (CHOOSE ONE: 'Theory', 'Logic', 'Systems', 'Implementation'),
        "type": string ('mcq', 'true_false', 'matching', 'code_completion', 'image_based'),
        "matching_pairs": JSON object (ONLY if type is 'matching'),
        "visual_query": string (if relevant)
    
    For 'code_completion' type (Fill in the Blanks):
    - The "question" MUST be a declarative statement or a code snippet where the answer is replaced by '_______'.
    - DO NOT use interrogative forms (e.g., 'What is...?', 'How do you...?').
    - Example: 'In React, the _______ hook is used to manage local state.' (Option/Answer: 'useState')

    For topic_tag:
    - 'Theory': Historical context, definitions, and high-level concepts.
    - 'Logic': Algorithmic snippets, problem-solving, and logic flows.
    - 'Systems': Architecture, scaling, infrastructure, and multi-component design.
    - 'Implementation': Code syntax, specific library APIs, and deployment steps.
    
    For 'matching' type:
    - Set "question" to "Match the following terms correctly."
    - Provide "matching_pairs" (e.g., {{"React": "Frontend Framework", "Node": "Backend Runtime"}}).
    - Set "answer" to a string representing the correct full mapping for internal grading logic, but the UI will handle the actual interaction.
    
    Return ONLY a valid JSON object.
    For 'visual_query': 
    - provide a 2-4 word string describing a TECHNICAL SCHEMATIC or ARCHITECTURAL layout relevant to the question.
    - Examples: "CPU internal architecture", "Database indexing B-Tree diagram", "REST API request-response flow", "Cloud infrastructure network schematic".
    - Avoid generic words like "computer", "brain", "server building".
    - Focus on finding INTERNAL diagrams.
    """
    
    try:
        chat_completion = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            response_format={"type": "json_object"},
            temperature=0.6,
            max_tokens=3000
        )
        
        raw_content = chat_completion.choices[0].message.content
        data = json.loads(raw_content)
        
        questions = []
        for key in ["quiz", "questions", "data", "questions_list"]:
            if key in data and isinstance(data[key], list):
                questions = data[key]
                break
        
        if not questions:
            for val in data.values():
                if isinstance(val, list) and len(val) > 0:
                    questions = val
                    break
        
        if not questions and isinstance(data, list):
            questions = data

        # Process Visuals
        for q in questions:
            if "visual_query" in q:
                q["image_url"] = get_image(q["visual_query"])
            elif mode in ["visual", "image_based"]:
                q["image_url"] = get_image(f"{subject} {topic} {q.get('topic_tag', '')}")
                
        return questions
    except Exception as e:
        print(f"Quiz Generation Error: {e}")
        return []

def generate_quiz_feedback(results: list, subject: str, topic: str):
    """
    Generates personalized mentorship advice based on quiz performance.
    'results' is a list of {question, topic_tag, is_correct, explanation}
    """
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key: return {"gaps": ["General practice needed"], "plan": ["Review foundational concepts"]}
    
    # Pre-calculate raw performance for mapping
    total = len(results)
    correct_count = sum(1 for r in results if r.get('is_correct'))
    overall_score = (correct_count / total) if total > 0 else 0
    
    # Category mapping hint
    categories = {"Theory": 0, "Logic": 0, "Systems": 0, "Implementation": 0}
    cat_counts = {"Theory": 0, "Logic": 0, "Systems": 0, "Implementation": 0}
    
    for r in results:
        tag = r.get('topic_tag', '').lower()
        # Map tag to one of the 4 buckets
        target = "Theory"
        if any(x in tag for x in ['code', 'syntax', 'impl', 'deploy', 'writing', 'completion']): target = "Implementation"
        elif any(x in tag for x in ['logic', 'problem', 'algorithm', 'math', 'reasoning']): target = "Logic"
        elif any(x in tag for x in ['system', 'arch', 'design', 'scaling', 'infra']): target = "Systems"
        
        cat_counts[target] += 1
        if r.get('is_correct'):
            categories[target] += 1
            
    # Calculate percentages per category
    cat_mastery = {}
    for k, v in categories.items():
        count = cat_counts[k]
        cat_mastery[k] = (v / count) if count > 0 else overall_score

    prompt = f"""
    Analyze these {subject} ({topic}) quiz results for a student.
    RAW PERFORMANCE METRICS (Use these as the base for the knowledge_graph):
    {json.dumps(cat_mastery)}
    
    RESULTS DATA: {json.dumps(results)}
    
    INSTRUCTIONS:
    1. "gaps": A LIST (ARRAY) of 3-5 strings. Provide a technical explanation for every question marked 'is_correct': false.
    2. "plan": A LIST (ARRAY) of 3 actionable, non-generic technical steps for improvement.
    3. "knowledge_graph": A LIST (ARRAY) of exactly 4 nodes matching these exact IDs and Labels.
       Adjust "level" (0.0 to 1.0) and "status" based on the RAW PERFORMANCE METRICS provided above.
       - status: "done" (if level > 0.8), "learning" (if level 0.4-0.8), "struggling" (if level < 0.4)
       
       [
         {{"id": "1", "label": "Theory", "level": {cat_mastery['Theory']}, "status": "..."}},
         {{"id": "2", "label": "Logic", "level": {cat_mastery['Logic']}, "status": "..."}},
         {{"id": "3", "label": "Systems", "level": {cat_mastery['Systems']}, "status": "..."}},
         {{"id": "4", "label": "Implementation", "level": {cat_mastery['Implementation']}, "status": "..."}}
       ]
    
    CRITICAL: "gaps" and "plan" MUST ALWAYS BE ARRAYS. For example: {{"gaps": ["Issue 1", "Issue 2"], "plan": ["Step 1"]}}.
    Return ONLY a valid JSON object.
    """
    
    client = Groq(api_key=api_key)
    try:
        res = client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are a master technical mentor. Your job is to translate raw quiz data into a visual mastery graph and actionable plan."},
                {"role": "user", "content": prompt}
            ],
            model="llama-3.3-70b-versatile",
            response_format={"type": "json_object"}
        )
        data = json.loads(res.choices[0].message.content)
        
        # Robustness check to prevent frontend .map() crashes
        if "gaps" in data and isinstance(data["gaps"], str):
             data["gaps"] = [data["gaps"]]
        if "plan" in data and isinstance(data["plan"], str):
             data["plan"] = [data["plan"]]
        if "gaps" not in data or not isinstance(data["gaps"], list):
             data["gaps"] = ["General review of foundational concepts recommended."]
        if "plan" not in data or not isinstance(data["plan"], list):
             data["plan"] = ["Review the explanation for missed questions.", "Practice similar problems.", "Deepen understanding of core principles."]
             
        return data
    except Exception as e:
        print(f"Feedback AI Error: {e}")
        return {"gaps": ["Error analyzing gaps"], "plan": ["Review foundational concepts"]}

def evaluate_student_explanation(topic: str, explanation: str, subject: str):
    """
    Evaluates 'Teach the AI' mode where the student explains a concept.
    Returns score, clarity rating, and missing points.
    """
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key: return {"score": 0, "feedback": "API Error"}
    
    client = Groq(api_key=api_key)
    prompt = f"""
    You are an expert tutor in {subject}. A student is trying to explain the concept of "{topic}" to you.
    STUDENT EXPLANATION:
    "{explanation}"
    
    Evaluate this explanation for:
    1. Technical Accuracy (0-10)
    2. Clarity & Communication (0-10)
    3. Missing Key Concepts (Identify what they forgot to mention)
    
    Format JSON:
    {{
        "accuracy_score": integer,
        "clarity_score": integer,
        "missing_concepts": list of strings,
        "mentor_feedback": string (brief, constructive),
        "overall_rating": string (e.g. "Excellent", "Developing", "Needs Review")
    }}
    """
    
    try:
        res = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            response_format={"type": "json_object"}
        )
        res_data = json.loads(res.choices[0].message.content)
        
        # Add a visual aid
        res_data["visual_aid"] = get_image(f"technical {topic}")
        
        return res_data
    except Exception as e:
        return {"accuracy_score": 0, "mentor_feedback": f"Evaluation failed: {str(e)}"}
