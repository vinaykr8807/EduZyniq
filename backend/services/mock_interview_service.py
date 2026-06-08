import os
import json
import random
from groq import Groq
from services.career_pathfinder import _search_ddg_jobs
from supabase_client import supabase
from services.interview_memory_service import build_interview_memory_context, store_interview_evaluations

# ──────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────

def _llm(prompt: str, temperature: float = 0.5) -> dict | None:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return None
    client = Groq(api_key=api_key)
    try:
        r = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            temperature=temperature,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )
        return json.loads(r.choices[0].message.content)
    except Exception as e:
        print(f"Mock LLM Error: {e}")
        return None

# backwards-compat alias used by main.py
llm_json_mock = _llm


def _get_user_context(user_email: str) -> dict | None:
    """Fetch the user's resume analysis, past mock sessions & profile for personalisation."""
    if not user_email:
        return None
    try:
        u_res = supabase.table("users").select("id").eq("email", user_email).execute()
        if not u_res.data:
            return None
        user_id = u_res.data[0]["id"]

        # Latest interview analysis session
        session_res = (
            supabase.table("interview_sessions")
            .select("*")
            .eq("user_id", user_id)
            .order("id", desc=True)
            .limit(1)
            .execute()
        )

        # All past mock-interview records (to adapt on mistakes)
        mock_res = (
            supabase.table("mock_interview_sessions")
            .select("*")
            .eq("user_id", user_id)
            .order("id", desc=True)
            .limit(5)
            .execute()
        )

        # Student profile
        profile_res = (
            supabase.table("student_profiles")
            .select("*")
            .eq("user_id", user_id)
            .execute()
        )

        return {
            "user_id": user_id,
            "session": session_res.data[0] if session_res.data else {},
            "past_mocks": mock_res.data or [],
            "profile": profile_res.data[0] if profile_res.data else {},
            "interview_memory": build_interview_memory_context(
                user_email,
                "previous candidate interview answers, weak areas, mistakes, and coaching feedback",
                supabase,
                top_k=5,
            ),
        }
    except Exception as e:
        print(f"Context Fetch Error: {e}")
        return None


def _past_weak_areas(context: dict | None) -> list:
    """Aggregate weaker topics from past mock-session evaluations."""
    if not context or not context.get("past_mocks"):
        return []
    weak = []
    for m in context["past_mocks"]:
        weak.extend(m.get("weak_areas", []))
    # Deduplicate and return top recurring items
    freq = {}
    for w in weak:
        freq[w] = freq.get(w, 0) + 1
    return sorted(freq, key=lambda x: freq[x], reverse=True)[:5]


def get_most_asked_questions(role: str, domain: str) -> str:
    try:
        query = f"top interview questions {role} {domain} 2025"
        results = _search_ddg_jobs(query, max_results=2)
        return " ".join([r.get("snippet", "") for r in results])
    except Exception:
        return ""


# ──────────────────────────────────────────────────────────────────────────
# Plan Builder
# ──────────────────────────────────────────────────────────────────────────

DIFFICULTY_PROGRESSION = ["Easy", "Easy", "Medium", "Medium", "Hard"]

def build_mock_plan(role: str, domain: str, extracted_skills: list, user_email: str | None = None, resume_context: str | None = None) -> list:
    """
    Build a 6-step plan:
      1. Easy fundamental
      2. Easy technical
      3. Medium behavioral / scenario
      4. Medium scenario / skill-gap
      5. Coding challenge (LeetCode-style) — Easy or Medium
      6. Hard or ATS-driven behavioral
    """
    context = _get_user_context(user_email)

    all_skills = list(set(
        extracted_skills
        + (context["session"].get("matched_skills", []) if context else [])
    ))
    missing_skills = context["session"].get("missing_skills", []) if context else []
    past_weak = _past_weak_areas(context)
    interview_memory = context.get("interview_memory", "") if context else ""

    # Merge and shuffle skill pool
    random.shuffle(all_skills)
    skill_pool = all_skills[:12] if all_skills else [domain, "Problem Solving", "Algorithms"]

    # DSA Topics specifically for coding round
    dsa_topics = ["Arrays", "Strings", "Hashmaps", "Two Pointers", "Sliding Window", "Recursion", "Sorting & Searching"]

    def pick(*from_list):
        pool = [s for s in from_list if s]
        return random.choice(pool) if pool else random.choice(skill_pool)

    # Extract project names from resume_context if available
    project_names = []
    if resume_context:
        try:
            rc = json.loads(resume_context)
            raw_projects = rc.get("resume_projects") or []
            for p in raw_projects:
                if isinstance(p, dict) and p.get("name"):
                    project_names.append(p["name"])
                elif isinstance(p, str):
                    project_names.append(p)
        except Exception:
            pass

    plan = [
        # --- Round 1: Fundamental concept ---
        {"type": "fundamental",  "skill": pick(*all_skills), "difficulty": "Easy"},
        # --- Round 2: Technical depth ---
        {"type": "technical",    "skill": pick(*all_skills), "difficulty": "Easy"},
        # --- Round 3: Resume Project Discussion ---
        {
            "type": "project",
            "skill": random.choice(project_names) if project_names else pick(*all_skills),
            "difficulty": "Medium",
            "note": f"Resume project deep-dive: {random.choice(project_names) if project_names else 'your most complex project'}",
        },
        # --- Round 4: Skill-Gap or Past weakness ---
        {
            "type": "scenario",
            "skill": pick(*(missing_skills[:3] if missing_skills else ([random.choice(past_weak)] if past_weak else all_skills))),
            "difficulty": "Medium",
            "note": "Skill-Gap Audit" if missing_skills else (f"Past-mistake focus: {past_weak[0]}" if past_weak else "N/A"),
        },
        # --- Round 5: Coding challenge ---
        {
            "type": "coding",
            "skill": random.choice(dsa_topics),
            "difficulty": random.choice(["Easy", "Medium"]),
            "note": "LeetCode-style — focus on core algorithm or data structure",
        },
        # --- Round 6: Behavioral / Leadership ---
        {
            "type": "behavioral",
            "skill": "Project Impact & Metrics" if (context and context["session"].get("ats_score", {}).get("total_score", 100) < 70) else "Leadership & Adaptability",
            "difficulty": "Hard",
            "note": "ATS Gap: Low Impact Metrics" if (context and context["session"].get("ats_score", {}).get("total_score", 100) < 70) else "N/A",
        },
    ]
    return plan


# ──────────────────────────────────────────────────────────────────────────
# Question Generator
# ──────────────────────────────────────────────────────────────────────────

def generate_mock_question(
    role: str,
    domain: str,
    plan_item: dict,
    asked: list,
    difficulty: str,
    user_email: str | None = None,
    resume_context: str | None = None,
) -> dict:
    context = _get_user_context(user_email)

    # Parse resume context from frontend (more up-to-date than DB session)
    resume_data = {}
    if resume_context:
        try:
            resume_data = json.loads(resume_context)
        except Exception:
            pass

    # Merge skills: prefer frontend resume_context, fallback to DB session
    resume_skills_list = (resume_data.get("extracted_skills") or
                          (context["session"].get("extracted_skills", []) if context else []))
    missing_list = (resume_data.get("missing_skills") or
                    (context["session"].get("missing_skills", []) if context else []))

    # Extract structured resume projects (new field: name, tech, description)
    resume_projects_raw = resume_data.get("resume_projects") or []
    projects_str = "not specified"
    project_names = []
    if resume_projects_raw:
        parts = []
        for p in resume_projects_raw:
            if isinstance(p, dict):
                name = p.get("name", "")
                tech = p.get("tech", "")
                desc = p.get("description", "")
                project_names.append(name)
                parts.append(f"  - {name} (Tech: {tech}): {desc}")
            elif isinstance(p, str):
                project_names.append(p)
                parts.append(f"  - {p}")
        projects_str = "\n".join(parts)

    resume_skills = ", ".join(resume_skills_list)
    missing = ", ".join(missing_list)
    ats_score = (resume_data.get("ats_score", {}).get("total_score") or
                 (context["session"].get("ats_score", {}).get("total_score", "N/A") if context else "N/A"))
    past_weak = _past_weak_areas(context)
    interview_memory = context.get("interview_memory", "") if context else ""

    effective_difficulty = plan_item.get("difficulty", difficulty)

    # ── Coding question path ──────────────────────────────────────────────
    if plan_item.get("type") == "coding":
        return generate_coding_challenge(role, domain, plan_item, asked, effective_difficulty, user_email, resume_context)

    # ── Project deep-dive path ────────────────────────────────────────────
    is_project_round = plan_item.get("type") == "project"
    project_note = plan_item.get("note", "")

    if is_project_round:
        prompt = f"""
You are a senior technical interviewer assessing a candidate for a {role} role.
The candidate listed the following projects on their resume: {projects_str}

Your job is to ask a SPECIFIC, DEEP question about one of these real projects that relates to their target role as a {role}.
Do NOT ask generic questions. Reference the actual project or technology they used, but frame it around the expectations for a {role}.

Focus project/skill: {plan_item.get('skill', 'their main project')}
Difficulty: {effective_difficulty}

Already asked (DO NOT REPEAT):
{json.dumps(asked)}

Return ONLY valid JSON:
{{
  "question": "A direct, specific question referencing the candidate's actual project, contextualized for a {role} position.",
  "category": "project",
  "difficulty": "{effective_difficulty}",
  "question_family": "Project deep dive",
  "interviewer_focus": ["Technical depth", "Design decisions", "Challenges overcome", "Relevance to role"],
  "expected_key_points": ["Technical depth", "Design decisions", "Challenges overcome", "Relevance to role"]
}}
"""
        res = _llm(prompt, 0.6)
        if res and "question" in res:
            return res

    # ── Standard/Technical/Behavioral question path ───────────────────────
    question_family = (
        "Scenario based" if plan_item["type"] == "scenario"
        else "Behavioral" if plan_item["type"] == "behavioral"
        else "Fundamental" if plan_item["type"] == "fundamental"
        else "Technical"
    )

    prompt = f"""
You are a senior technical interviewer assessing a candidate for a {role} role in the {domain} domain.

IMPORTANT CONTEXT (STRICTLY FROM RESUME):
- Candidate Skills   : {resume_skills}
- Projects Built     : {projects_str}
- Resume ATS Score   : {ats_score}
- Past Mistakes      : {', '.join(past_weak) or 'None'}
- Vector Memory      : {interview_memory or 'No FAISS interview memory yet.'}

INTERVIEW STEP:
- Current Round : {plan_item['type']}
- Skill/Topic   : {plan_item.get('skill', 'General')}
- Logic Note    : {plan_item.get('note', 'N/A')}
- Difficulty    : {effective_difficulty}

STRICT INSTRUCTIONS:
1. ASSESS FOR TARGET ROLE: The question MUST be highly relevant to the core responsibilities of a {role}.
2. PERSONALIZE USING RESUME: Contextualize the question by explicitly referencing their listed skills or projects. For example, ask how they would apply a concept they used in [Project] to a complex {role} scenario.
3. NO GENERIC JOB DRIFT: Do not reference "our company needs" or "job descriptions". Maintain the persona of a practical technical evaluator.
4. If the note is "Skill-Gap Audit", challenge them on a technology they are missing but that a {role} needs.
5. Keep questions concise and professional (2 sentences max).
6. Avoid repetition: {json.dumps(asked)}

Return ONLY valid JSON:
{{
  "question": "A direct, technically deep question evaluating them for a {role} while referencing one of their actual projects or listed skills.",
  "category": "{plan_item['type']}",
  "difficulty": "{effective_difficulty}",
  "question_family": "{question_family}",
  "interviewer_focus": ["Specific technical detail", "Reasoning", "Impact"],
  "expected_key_points": ["Specific technical detail", "Reasoning", "Impact"]
}}
"""
    res = _llm(prompt, 0.6)
    if res and "question" in res:
        return res
    raise RuntimeError("Mock interview question generation failed. No fallback question was used.")


# ──────────────────────────────────────────────────────────────────────────
# Coding Challenge Generator
# ──────────────────────────────────────────────────────────────────────────

def generate_coding_challenge(
    role: str,
    domain: str,
    plan_item: dict,
    asked: list,
    difficulty: str,
    user_email: str | None = None,
    resume_context: str | None = None,
) -> dict:
    context = _get_user_context(user_email)
    resume_skills = ", ".join(context["session"].get("extracted_skills", [])) if context else ""

    # DSA Topics to prioritize
    dsa_topics = ["Arrays", "Strings", "Hashmaps", "Two Pointers", "Sliding Window", "Linked Lists", "Stacks & Queues", "Trees", "Heaps", "Recursion", "Sorting & Searching"]
    target_topic = plan_item.get('skill') if plan_item.get('skill') in dsa_topics else random.choice(dsa_topics)

    prompt = f"""
You are an expert technical interviewer at a top-tier tech company (like Google or Amazon).
Create a HIGH-QUALITY, DSA-focused coding problem for a {role} candidate.

TOPIC CATEGORY: {target_topic}
DIFFICULTY: {difficulty}
CANDIDATE'S EXPERTISE: {resume_skills}
PREVIOUSLY ASKED: {json.dumps(asked)}

PROBLEM REQUIREMENTS:
1. It MUST be a traditional LeetCode / Competitive Programming style problem.
2. Focus strictly on the topic: {target_topic}.
3. The problem should be {difficulty} level.
4. Problem should NOT be a domain task (like 'detect faces'). It must be an algorithmic/data structure challenge.
5. Provide a clear problem statement, constraints, and valid test cases.

Return ONLY valid JSON:
{{
  "problem_title": "Short problem title",
  "question": "Problem title and description including constraints.",
  "problem_statement": "Main coding problem statement only",
  "category": "coding",
  "topic": "{target_topic}",
  "difficulty": "{difficulty}",
  "question_family": "Coding",
  "interviewer_focus": ["Problem understanding", "Correct algorithm", "Time and space complexity", "Edge case handling"],
  "constraints": ["..."],
  "examples": [
    {{"input": "...", "output": "...", "explanation": "..."}}
  ],
  "test_cases": [
    {{"input": "...", "expected_output": "..."}}
  ],
  "hints": ["...", "..."],
  "expected_key_points": ["Algorithm approach", "Time complexity", "Space complexity", "Edge cases"],
  "starter_template_note": "Starter function signature shown below should be used as the base.",
  "function_signature": {{
    "python": "def solve(input_data):\\n    pass",
    "javascript": "function solve(inputData) {{\\n\\n}}",
    "java": "public class Solution {{\\n    public Object solve(Object input) {{\\n        return null;\\n    }}\\n}}",
    "cpp": "class Solution {{\\npublic:\\n    Object solve(Object input) {{\\n        return null;\\n    }}\\n}};"
  }}
}}
"""
    res = _llm(prompt, 0.5)
    if res and "question" in res:
        res["type"] = "coding"
        return res

    raise RuntimeError("Coding challenge generation failed. No fallback coding problem was used.")


# ──────────────────────────────────────────────────────────────────────────
# Code Execution with Test Cases
# ──────────────────────────────────────────────────────────────────────────

def run_code_against_tests(code: str, language: str, test_cases: list) -> dict:
    """
    Execute user code against each test case using the existing Docker sandbox.
    Each test case: {"input": "...", "expected_output": "..."}
    Strategy: Wrap the user's code with a small harness that reads from stdin and
    prints the result, so the existing execute_code_safely() function works unchanged.
    """
    from assistants.coding_mentor import execute_code_safely

    results = []
    passed = 0

    for tc in test_cases:
        raw_input = str(tc.get("input", ""))
        expected = str(tc.get("expected_output", "")).strip()

        # Build a harness that wraps the user's code
        harness = _build_harness(code, language, raw_input)

        exec_res = execute_code_safely(harness, language)
        actual_output = exec_res.get("output", "").strip()
        success = exec_res.get("success", False)

        # Normalise comparison: strip spaces & lowercase
        passed_case = (
            actual_output.replace(" ", "").lower() == expected.replace(" ", "").lower()
        )
        if passed_case:
            passed += 1

        results.append({
            "input": raw_input,
            "expected": expected,
            "actual": actual_output,
            "passed": passed_case,
            "error": exec_res.get("error", "") if not success else "",
            "execution_time": exec_res.get("execution_time", 0),
        })

    return {
        "test_results": results,
        "passed": passed,
        "total": len(test_cases),
        "all_passed": passed == len(test_cases),
        "score_pct": round((passed / max(len(test_cases), 1)) * 100),
    }


def _build_harness(user_code: str, language: str, raw_input: str) -> str:
    """
    Build a harness script that:
      1. Defines the user's function
      2. Reads test input from the raw_input embedded string
      3. Calls the function and prints the result
    """
    lang = language.lower()
    lines = raw_input.strip().split("\n")

    if lang == "python":
        # Embed input as a list of lines provided via `input()` mock
        escaped = json.dumps(raw_input)
        harness = f"""
import sys, json, ast
_INPUT_LINES = {json.dumps(lines)}
_idx = 0
def input(prompt=''):
    global _idx
    line = _INPUT_LINES[_idx] if _idx < len(_INPUT_LINES) else ''
    _idx += 1
    return line

{user_code}

# Auto-call: try common entry points
try:
    # Try to call solve() with the first line parsed as the arg
    import ast as _ast
    _arg = _INPUT_LINES[0] if _INPUT_LINES else ''
    try:
        _parsed = _ast.literal_eval(_arg)
    except Exception:
        _parsed = _arg
    if len(_INPUT_LINES) > 1:
        try:
            _parsed2 = _ast.literal_eval(_INPUT_LINES[1])
        except Exception:
            _parsed2 = _INPUT_LINES[1]
        _result = solve(_parsed, _parsed2)
    else:
        _result = solve(_parsed)
    print(_result)
except Exception as _e:
    print(f"HARNESS_ERROR: {{_e}}")
"""
    elif lang == "javascript":
        escaped_lines = json.dumps(lines)
        harness = f"""
const _lines = {escaped_lines};
let _idx = 0;
const readline = () => _lines[_idx++] || '';

{user_code}

try {{
  const _arg = _lines[0];
  let _parsed;
  try {{ _parsed = JSON.parse(_arg); }} catch(e) {{ _parsed = _arg; }}
  let _result;
  if (_lines.length > 1) {{
    let _p2;
    try {{ _p2 = JSON.parse(_lines[1]); }} catch(e) {{ _p2 = _lines[1]; }}
    _result = solve(_parsed, _p2);
  }} else {{
    _result = solve(_parsed);
  }}
  console.log(JSON.stringify(_result));
}} catch(e) {{
  console.log('HARNESS_ERROR: ' + e.message);
}}
"""
    else:
        # For unsupported languages just execute as-is (user handles I/O themselves)
        harness = user_code

    return harness


# ──────────────────────────────────────────────────────────────────────────
# Coding Answer Evaluator
# ──────────────────────────────────────────────────────────────────────────

def evaluate_coding_answer(
    question: str,
    approach_text: str,
    code: str,
    language: str,
    test_cases: list,
    role: str,
    domain: str,
) -> dict:
    """
    1. Run code against test cases.
    2. Ask the LLM to evaluate approach + code quality + test results.
    """
    exec_summary = run_code_against_tests(code, language, test_cases) if test_cases else None

    exec_block = ""
    if exec_summary:
        exec_block = f"""
TEST EXECUTION RESULTS:
- Passed: {exec_summary['passed']} / {exec_summary['total']}
- Score  : {exec_summary['score_pct']}%
- Details: {json.dumps(exec_summary['test_results'], indent=2)[:1200]}
"""

    prompt = f"""
You are a senior software engineer and technical interviewer evaluating a {role}'s coding round.
Give feedback like a professional code review plus interview debrief: specific, practical, and comprehensive.

PROBLEM:
{question}

CANDIDATE'S APPROACH EXPLANATION:
{approach_text}

CANDIDATE'S CODE ({language}):
{code}

{exec_block}

Evaluate the candidate holistically. Consider:
- Correctness (did test cases pass?)
- Algorithm choice & time/space complexity
- Code readability & style
- Quality of their verbal approach explanation
- Whether the candidate explained tradeoffs, edge cases, and why the approach is appropriate

Return ONLY valid JSON:
{{
  "overall_score": <1-10>,
  "correctness_score": <1-10>,
  "approach_score": <1-10>,
  "code_quality_score": <1-10>,
  "senior_feedback": "2-4 paragraph senior-engineer debrief covering approach, code quality, missed reasoning, and interview readiness.",
  "strengths": "Specific strengths with evidence from approach/code/tests.",
  "weaknesses": "Specific weaknesses with evidence from approach/code/tests.",
  "mistakes_made": ["Specific mistake 1", "Specific mistake 2"],
  "skill_gaps": ["Skill gap 1", "Skill gap 2"],
  "improvement_areas": ["Area to improve 1", "Area to improve 2"],
  "interviewer_expectation_missed": ["Expectation missed 1", "Expectation missed 2"],
  "interviewer_expected_to_hear": ["Expected explanation point 1", "Expected explanation point 2"],
  "answer_coverage": {{
    "covered": ["What the candidate handled well"],
    "partially_covered": ["What was present but under-explained"],
    "missed": ["What should have been discussed or implemented"]
  }},
  "optimal_solution": "Brief description of the best approach",
  "improved_code": "A clean, optimal {language} solution",
  "advice": "Specific, actionable advice",
  "time_complexity": "O(?)",
  "space_complexity": "O(?)",
  "test_summary": {json.dumps(exec_summary) if exec_summary else {{}}}
}}
"""
    res = _llm(prompt, 0.3)
    if res:
        if exec_summary:
            res["test_execution"] = exec_summary
        return res

    raise RuntimeError("Coding answer evaluation failed. No fallback score or feedback was used.")


# ──────────────────────────────────────────────────────────────────────────
# Standard Answer Evaluator
# ──────────────────────────────────────────────────────────────────────────

def evaluate_mock_answer(
    question: str,
    answer: str,
    role: str,
    domain: str,
    expected_key_points: list[str] | None = None,
    interviewer_focus: list[str] | None = None,
    live_metrics: dict | None = None,
    speech_feedback: dict | None = None,
) -> dict:
    expected_key_points = expected_key_points or []
    interviewer_focus = interviewer_focus or []
    live_metrics = live_metrics or {}
    speech_feedback = speech_feedback or {}
    prompt = f"""
You are a senior developer and hiring-panel interviewer. Evaluate this candidate's interview answer for a {role} ({domain}) position.

Your feedback must feel like a professional debrief from a senior engineer: analytical, specific, comprehensive, and helpful. Do not sound robotic.

Question: {question}
Answer  : {answer}

Interviewer expected the answer to cover these points/hints:
{json.dumps(expected_key_points, indent=2)}

Interviewer focus areas:
{json.dumps(interviewer_focus, indent=2)}

Live delivery metrics, if available:
{json.dumps(live_metrics, indent=2)}

Speech feedback, if available:
{json.dumps(speech_feedback, indent=2)}

Evaluate in four stages:
1. Analyst: compare what the candidate said against the expected coverage.
2. Explainer: explain why gaps matter in a real interview.
3. Writer: rewrite the answer in a polished, interview-ready form.
4. Coach: give concrete next actions for content and spoken delivery.

Scoring guidance:
- Technical accuracy should reflect correctness and depth, not confidence.
- Communication should reflect structure, clarity, specificity, and whether the spoken answer covered the expected hints.
- Penalize vague answers that do not mention tradeoffs, examples, metrics, implementation details, or role-relevant reasoning.
- If the answer is short, say exactly what should have been added.

Return ONLY valid JSON:
{{
  "overall_score": <1-10>,
  "technical_accuracy": <1-10>,
  "communication": <1-10>,
  "senior_feedback": "A detailed senior-interviewer debrief in 2-4 paragraphs. Mention whether the spoken answer covered the expected hints.",
  "answer_coverage": {{
    "covered": ["Expected point that was covered"],
    "partially_covered": ["Expected point that was touched but not developed"],
    "missed": ["Expected point that was missing"]
  }},
  "strengths": "Specific strengths with evidence from the candidate answer.",
  "weaknesses": "Specific weaknesses with evidence from the candidate answer.",
  "improved_answer": "A polished answer the candidate could speak in an interview. Make it concrete and role-relevant.",
  "advice": "Specific actionable advice for the next attempt.",
  "delivery_feedback": {{
    "speaking_summary": "How the candidate sounded while speaking, based on metrics if provided.",
    "pace": "specific pacing feedback",
    "clarity": "specific clarity feedback",
    "confidence": "specific confidence/body language feedback"
  }},
  "interviewer_expected_to_hear": ["Concrete item interviewer expected"],
  "weak_areas": ["topic1", "topic2"],
  "mistakes_made": ["Specific mistake 1", "Specific mistake 2"],
  "skill_gaps": ["Skill gap 1", "Skill gap 2"],
  "improvement_areas": ["Area to improve 1", "Area to improve 2"],
  "interviewer_expectation_missed": ["Expectation missed 1", "Expectation missed 2"]
}}
"""
    res = _llm(prompt, 0.25)
    if res:
        return res
    raise RuntimeError("Mock answer evaluation failed. No fallback score or feedback was used.")


# ──────────────────────────────────────────────────────────────────────────
# Persist mock session for adaptive learning
# ──────────────────────────────────────────────────────────────────────────

def save_mock_session(
    user_email: str,
    role: str,
    domain: str,
    language: str,
    evaluations: list,
    room_summary: dict | None = None,
    report: dict | None = None,
    expected_question_count: int | None = None,
) -> bool:
    """Save aggregated mock session to Supabase for future adaptation."""
    try:
        completed_count = len(evaluations)
        required_count = expected_question_count or completed_count
        is_completed = required_count > 0 and completed_count >= required_count
        if not is_completed:
            print(
                f"Mock session save skipped: incomplete session "
                f"({completed_count}/{required_count} answered)."
            )
            return False

        u_res = supabase.table("users").select("id").eq("email", user_email).execute()
        if not u_res.data:
            return False
        user_id = u_res.data[0]["id"]

        # Aggregate weak areas across all evals
        weak_areas = []
        for ev in evaluations:
            weak_areas.extend(ev.get("weak_areas", []))

        avg_score = round(
            sum(ev.get("overall_score", 5) for ev in evaluations) / max(len(evaluations), 1), 1
        )
        summary = dict(room_summary or {})
        session_report = dict(report or {})
        summary["is_completed"] = True
        summary["completed_questions"] = completed_count
        summary["expected_questions"] = required_count
        session_report["is_completed"] = True
        session_report["completed_questions"] = completed_count
        session_report["expected_questions"] = required_count
        metrics = summary.get("metrics", {})
        readiness_score = float(
            summary.get("readiness_score")
            or session_report.get("readiness_score")
            or round(avg_score * 10, 1)
        )

        supabase.table("mock_interview_sessions").insert({
            "user_id": user_id,
            "role": role,
            "domain": domain,
            "language": language,
            "session_kind": summary.get("session_kind", "live_room" if summary else "classic"),
            "avg_score": avg_score,
            "readiness_score": readiness_score,
            "eye_contact_score": float(metrics.get("eye_contact", 0) or 0),
            "confidence_score": float(metrics.get("confidence", 0) or 0),
            "speech_clarity_score": float(metrics.get("speech_clarity", 0) or 0),
            "body_language_score": float(metrics.get("body_language", 0) or 0),
            "posture_score": float(metrics.get("posture", 0) or 0),
            "expression_score": float(metrics.get("expression", 0) or 0),
            "communication_score": float(metrics.get("communication", 0) or 0),
            "weak_areas": list(set(weak_areas)),
            "num_questions": len(evaluations),
            "presence_alerts": summary.get("presence_alerts", []),
            "room_summary": summary,
            "report": session_report,
        }).execute()

        try:
            memory_result = store_interview_evaluations(
                user_email,
                role,
                domain,
                language,
                evaluations,
                supabase,
            )
            print(f"Interview FAISS memory updated: {memory_result}")
        except Exception as vector_error:
            print(f"Interview FAISS memory save error: {vector_error}")
        return True
    except Exception as e:
        print(f"Save mock session error: {e}")
        return False
