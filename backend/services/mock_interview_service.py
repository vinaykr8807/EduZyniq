import os
import json
import random
from groq import Groq
from services.career_pathfinder import _search_ddg_jobs
from supabase_client import supabase

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

def build_mock_plan(role: str, domain: str, extracted_skills: list, user_email: str | None = None) -> list:
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

    # Merge and shuffle skill pool
    random.shuffle(all_skills)
    skill_pool = all_skills[:12] if all_skills else [domain, "Problem Solving", "Algorithms"]

    # DSA Topics specifically for coding round
    dsa_topics = ["Arrays", "Strings", "Hashmaps", "Two Pointers", "Sliding Window", "Recursion", "Sorting & Searching"]

    def pick(*from_list):
        pool = [s for s in from_list if s]
        return random.choice(pool) if pool else random.choice(skill_pool)

    plan = [
        # --- Behavioural/Conceptual rounds ---
        {"type": "fundamental",  "skill": pick(*all_skills),           "difficulty": "Easy"},
        {"type": "technical",    "skill": pick(*all_skills),           "difficulty": "Easy"},
        {
            "type": "scenario",
            "skill": pick(*([random.choice(past_weak)] if past_weak else all_skills)),
            "difficulty": "Medium",
            "note": f"Past-mistake focus: {past_weak[0]}" if past_weak else "N/A",
        },
        {
            "type": "technical",
            "skill": pick(*(missing_skills[:3] if missing_skills else all_skills)),
            "difficulty": "Medium",
            "note": "Skill-Gap Audit" if missing_skills else "N/A",
        },
        # --- Coding challenge ---
        {
            "type": "coding",
            "skill": random.choice(dsa_topics),
            "difficulty": random.choice(["Easy", "Medium"]),
            "note": "LeetCode-style — focus on core algorithm or data structure",
        },
        # --- Final hard round ---
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
) -> dict:
    context = _get_user_context(user_email)
    web_ctx = get_most_asked_questions(role, domain)

    resume_skills = ", ".join(context["session"].get("extracted_skills", [])) if context else ""
    missing = ", ".join(context["session"].get("missing_skills", [])) if context else ""
    ats_score = context["session"].get("ats_score", {}).get("total_score", "N/A") if context else "N/A"
    past_weak = _past_weak_areas(context)

    effective_difficulty = plan_item.get("difficulty", difficulty)

    # ── Coding question path ──────────────────────────────────────────────
    if plan_item.get("type") == "coding":
        return generate_coding_challenge(role, domain, plan_item, asked, effective_difficulty, user_email)

    # ── Standard question path ─────────────────────────────────────────────
    prompt = f"""
You are a senior technical interviewer hiring a {role} in the {domain} domain.

CANDIDATE PROFILE:
- Resume Skills   : {resume_skills}
- Skill Gaps      : {missing}
- ATS Score       : {ats_score}
- Past Weak Areas : {', '.join(past_weak) or 'None'}

INTERVIEW STEP:
- Type       : {plan_item['type']}
- Focus Skill: {plan_item['skill']}
- Note       : {plan_item.get('note', 'N/A')}
- Difficulty : {effective_difficulty}

MARKET CONTEXT (use as backdrop):
{web_ctx[:600]}

ALREADY ASKED (DO NOT REPEAT EXACT WORDING):
{json.dumps(asked)}

RULES:
1. Vary difficulty: Easy = basic concepts, Medium = application/design, Hard = trade-offs/impact.
2. If Note = "Skill-Gap Audit" — probe how the candidate would learn or compensate.
3. If Note = "ATS Gap" — ask candidate to quantify a past achievement with metrics.
4. If Note = "Past-mistake focus" — revisit the weak area in a new angle.
5. Keep question concise (1–2 sentences).
6. DO NOT repeat questions from the already-asked list.

Return ONLY valid JSON:
{{
  "question": "...",
  "category": "{plan_item['type']}",
  "difficulty": "{effective_difficulty}",
  "expected_key_points": ["point1", "point2", "point3"]
}}
"""
    res = _llm(prompt, 0.65)
    if res and "question" in res:
        return res
    # Fallback
    return {
        "question": f"Can you walk me through how you would handle a real-world challenge involving {plan_item['skill']}?",
        "category": plan_item["type"],
        "difficulty": effective_difficulty,
        "expected_key_points": ["Clear explanation", "Approach", "Outcome"],
    }


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
  "question": "Problem title and description including constraints.",
  "category": "coding",
  "topic": "{target_topic}",
  "difficulty": "{difficulty}",
  "examples": [
    {{"input": "...", "output": "...", "explanation": "..."}}
  ],
  "test_cases": [
    {{"input": "...", "expected_output": "..."}}
  ],
  "hints": ["...", "..."],
  "expected_key_points": ["Algorithm approach", "Time complexity", "Space complexity", "Edge cases"],
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

    # Fallback problem
    return {
        "question": "Given an array of integers, return the indices of the two numbers that add up to a target sum. Assume exactly one solution exists.",
        "category": "coding",
        "difficulty": difficulty,
        "examples": [
            {"input": "[2,7,11,15], target=9", "output": "[0,1]", "explanation": "nums[0]+nums[1]=9"},
            {"input": "[3,2,4], target=6", "output": "[1,2]", "explanation": "nums[1]+nums[2]=6"},
        ],
        "test_cases": [
            {"input": "[2,7,11,15]\n9", "expected_output": "[0, 1]"},
            {"input": "[3,2,4]\n6", "expected_output": "[1, 2]"},
            {"input": "[3,3]\n6", "expected_output": "[0, 1]"},
        ],
        "hints": ["Use a hashmap for O(n) solution", "Track complement = target - num"],
        "expected_key_points": ["Hash map approach", "O(n) time", "Handles duplicates"],
        "function_signature": {
            "python": "def solve(nums, target):\n    # your code here\n    pass",
            "javascript": "function solve(nums, target) {\n  // your code here\n}",
        },
    }


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
You are an expert technical interviewer evaluating a {role}'s coding answer.

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

Return ONLY valid JSON:
{{
  "overall_score": <1-10>,
  "correctness_score": <1-10>,
  "approach_score": <1-10>,
  "code_quality_score": <1-10>,
  "strengths": "...",
  "weaknesses": "...",
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

    return {
        "overall_score": 5,
        "correctness_score": exec_summary["score_pct"] // 10 if exec_summary else 5,
        "approach_score": 5,
        "code_quality_score": 5,
        "strengths": "Attempted the problem.",
        "weaknesses": "Needs more practice.",
        "optimal_solution": "Use a hash map for O(n) lookup.",
        "improved_code": "# See editorial",
        "advice": "Focus on edge cases and complexity analysis.",
        "time_complexity": "O(n)",
        "space_complexity": "O(n)",
        "test_execution": exec_summary or {},
    }


# ──────────────────────────────────────────────────────────────────────────
# Standard Answer Evaluator
# ──────────────────────────────────────────────────────────────────────────

def evaluate_mock_answer(question: str, answer: str, role: str, domain: str) -> dict:
    prompt = f"""
Evaluate this candidate's interview answer for a {role} ({domain}) position.

Question: {question}
Answer  : {answer}

Be constructive and fair. Judge depth of understanding, communication, and practical insight.

Return ONLY valid JSON:
{{
  "overall_score": <1-10>,
  "technical_accuracy": <1-10>,
  "communication": <1-10>,
  "strengths": "...",
  "weaknesses": "...",
  "improved_answer": "How a strong {role} would answer this",
  "advice": "Specific actionable advice",
  "weak_areas": ["topic1", "topic2"]
}}
"""
    res = _llm(prompt, 0.25)
    if res:
        return res
    return {
        "overall_score": 5, "technical_accuracy": 5, "communication": 5,
        "strengths": "Provided an answer.",
        "weaknesses": "Answer lacked depth.",
        "improved_answer": "Structure your answer using STAR method.",
        "advice": "Practice articulating technical decisions out loud.",
        "weak_areas": [],
    }


# ──────────────────────────────────────────────────────────────────────────
# Persist mock session for adaptive learning
# ──────────────────────────────────────────────────────────────────────────

def save_mock_session(user_email: str, role: str, domain: str, language: str, evaluations: list) -> None:
    """Save aggregated mock session to Supabase for future adaptation."""
    try:
        u_res = supabase.table("users").select("id").eq("email", user_email).execute()
        if not u_res.data:
            return
        user_id = u_res.data[0]["id"]

        # Aggregate weak areas across all evals
        weak_areas = []
        for ev in evaluations:
            weak_areas.extend(ev.get("weak_areas", []))

        avg_score = round(
            sum(ev.get("overall_score", 5) for ev in evaluations) / max(len(evaluations), 1), 1
        )

        supabase.table("mock_interview_sessions").insert({
            "user_id": user_id,
            "role": role,
            "domain": domain,
            "language": language,
            "avg_score": avg_score,
            "weak_areas": list(set(weak_areas)),
            "num_questions": len(evaluations),
        }).execute()
    except Exception as e:
        print(f"Save mock session error: {e}")
