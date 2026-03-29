"""
CodeX Intelligence Service - Migrated from Codex/streamlit_app.py
Provides:
  - Problem title loading from CSV datasets
  - Real-time per-line logic alignment checking using Groq
  - GitHub / StackOverflow code reference search
  - AI test case generation
  - Code enhancement via Groq
"""

import os
import re
import csv
import json
import requests
import hashlib
from typing import List, Dict, Optional, Any
from bs4 import BeautifulSoup

# CSV dataset paths (relative to backend/)
CODEX_DIR = os.path.join(os.path.dirname(__file__), '..', 'Codex')

CSV_MAP = {
    'python':     os.path.join(CODEX_DIR, 'data_python.csv'),
    'java':       os.path.join(CODEX_DIR, 'data_java.csv'),
    'javascript': os.path.join(CODEX_DIR, 'data_javascript.csv'),
    'cpp':        os.path.join(CODEX_DIR, 'data_cpp.csv'),
}

# ──────────────────── Problem Titles ────────────────────

def load_problem_titles(language: str) -> List[str]:
    """Load problem titles from the Codex CSV datasets."""
    lang = language.lower()
    csv_path = CSV_MAP.get(lang)
    if not csv_path or not os.path.exists(csv_path):
        return []

    titles = []
    try:
        import pandas as pd
        if lang == 'python':
            df = pd.read_csv(csv_path, usecols=['problem_title'])
            titles = df['problem_title'].dropna().str.strip().str.title().unique().tolist()
        elif lang in ('java', 'javascript'):
            df = pd.read_csv(csv_path, usecols=['title'])
            titles = df['title'].dropna().str.strip().str.title().unique().tolist()
        elif lang == 'cpp':
            df = pd.read_csv(csv_path, usecols=['Answer'])
            extracted = []
            for code in df['Answer'].dropna():
                m = re.search(r'(?:class|struct)\s+(\w+)', code)
                if m:
                    name = m.group(1).replace('Solution', '').strip()
                    if name:
                        extracted.append(name.replace('_', ' ').title())
                        continue
                m = re.search(r'\b(?:int|void|bool|string|double|long)\s+(\w+)\s*\(', code)
                if m and m.group(1) not in ('main', 'Main'):
                    extracted.append(m.group(1).replace('_', ' ').title())
            titles = list(dict.fromkeys(t for t in extracted if t and len(t) > 1))
    except Exception as e:
        print(f"CSV load error: {e}")

    return sorted(titles[:500])  # Cap at 500 for performance


# ──────────────────── Logic Alignment Check ────────────────────

def check_alignment(problem_desc: str, code: str) -> Dict[str, str]:
    """
    Use Groq to check whether code is semantically aligned with the problem.
    Returns: { verdict: MATCH/MISMATCH/EMPTY, reason: str }
    """
    try:
        from groq import Groq
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            return {"verdict": "MATCH", "reason": "Groq key not found; skipping check."}

        client = Groq(api_key=api_key)
        prompt = f"""Task: Check if the provided code is relevant to the problem description.
Problem: {problem_desc}
Code Start:
{code[:800]}

Respond in EXACTLY this format:
VERDICT: [MATCH/MISMATCH/EMPTY]
REASON: [Short 1-sentence explanation]"""

        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=100
        )
        text = resp.choices[0].message.content.strip()
        verdict_match = re.search(r'VERDICT:\s*(MATCH|MISMATCH|EMPTY)', text, re.IGNORECASE)
        reason_match = re.search(r'REASON:\s*(.+)', text, re.IGNORECASE)
        return {
            "verdict": verdict_match.group(1).upper() if verdict_match else "MATCH",
            "reason": reason_match.group(1).strip() if reason_match else "Alignment check passed."
        }
    except Exception as e:
        return {"verdict": "MATCH", "reason": f"Check skipped: {e}"}


# ──────────────────── Per-line Syntax Check ────────────────────

def analyze_lines(code: str, language: str) -> List[Dict[str, Any]]:
    """
    Check each line for common syntax/logic issues per language.
    Returns list of: { line_num, code, status, message }
    """
    lines = code.split('\n')
    results = []
    lang = language.lower()

    # Python: full AST parse
    if lang == 'python':
        import ast
        overall_error_line = None
        overall_error_msg = None
        try:
            ast.parse(code)
        except SyntaxError as e:
            overall_error_line = e.lineno
            overall_error_msg = str(e.msg)

        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            if not stripped or stripped.startswith('#'):
                results.append({"line_num": i, "code": line, "status": "skip", "message": ""})
                continue
            if overall_error_line and i == overall_error_line:
                results.append({"line_num": i, "code": line, "status": "error", "message": f"SyntaxError: {overall_error_msg}"})
            elif overall_error_line and i > overall_error_line:
                results.append({"line_num": i, "code": line, "status": "warn", "message": "Code after syntax error"})
            else:
                warn = ''
                if stripped.endswith('(') or stripped.endswith(','):
                    warn = 'Incomplete expression'
                elif stripped.count('(') != stripped.count(')'):
                    warn = 'Unmatched parentheses'
                elif stripped.count('[') != stripped.count(']'):
                    warn = 'Unmatched brackets'
                elif stripped.count('{') != stripped.count('}') and not stripped.endswith(':'):
                    warn = 'Unmatched braces'
                results.append({"line_num": i, "code": line, "status": "warn" if warn else "ok", "message": warn})

    # Java / C++ / JavaScript: heuristic checks
    elif lang in ('java', 'cpp', 'javascript'):
        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            if not stripped or stripped.startswith('//') or stripped.startswith('*') or stripped.startswith('/*'):
                results.append({"line_num": i, "code": line, "status": "skip", "message": ""})
                continue
            warn = ''
            # Unmatched parens
            if stripped.count('(') != stripped.count(')'):
                warn = 'Unmatched parentheses'
            elif stripped.count('[') != stripped.count(']'):
                warn = 'Unmatched brackets'
            elif stripped.count('{') != stripped.count('}') and not stripped.endswith('{') and not stripped.endswith('}'):
                warn = 'Unmatched braces'
            elif (lang in ('java', 'cpp')
                  and not stripped.endswith('{') and not stripped.endswith('}')
                  and not stripped.endswith(';') and not stripped.endswith(',')
                  and not stripped.startswith('#') and not stripped.startswith('@')
                  and not stripped.endswith(')')
                  and re.match(r'^(int|long|double|float|String|boolean|char|auto|return|System|std::|cout|cin|\w+\s*=)', stripped)):
                warn = 'Possible missing semicolon'
            results.append({"line_num": i, "code": line, "status": "warn" if warn else "ok", "message": warn})
    else:
        for i, line in enumerate(lines, 1):
            results.append({"line_num": i, "code": line, "status": "ok", "message": ""})

    return results


# ──────────────────── GitHub & StackOverflow Search ────────────────────

def get_search_query_from_code(code: str, language: str) -> str:
    """Use Groq to extract keyword query for searches."""
    try:
        from groq import Groq
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("No key")
        client = Groq(api_key=api_key)
        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a technical search expert. Provide specific, technical keywords only."},
                {"role": "user", "content": f"Extract 3-5 key technical keywords from this {language} code to use as a GitHub search query.\nRespond ONLY with the keywords separated by spaces.\n\nCode:\n{code[:500]}"}
            ],
            temperature=0.1, max_tokens=60
        )
        query = resp.choices[0].message.content.strip()
        query = re.sub(r'```.*?```', '', query, flags=re.DOTALL)
        query = re.sub(r'^(Keywords:|Query:|Search Query:)', '', query, flags=re.IGNORECASE)
        query = re.sub(r'[^a-zA-Z0-9\s\#\+\.]', ' ', query)
        return " ".join(query.split()).strip()
    except Exception:
        words = re.findall(r'\b[a-zA-Z_]{5,}\b', code[:300])
        return " ".join(words[:4])


def fetch_github_snippets(query: str, language: str, max_files: int = 3) -> List[Dict]:
    """Fetch relevant code snippets from GitHub search."""
    results = []
    if not query:
        return results
    try:
        import urllib.parse as up
        headers = {'Accept': 'application/vnd.github.v3+json'}
        token = os.getenv('GITHUB_TOKEN')
        if token:
            headers['Authorization'] = f'token {token}'
        q = f"{query} language:{language}"
        url = f'https://api.github.com/search/code?q={up.quote(q)}&per_page={max_files}'
        r = requests.get(url, headers=headers, timeout=8)
        if r.status_code != 200:
            return results
        for item in r.json().get('items', [])[:max_files]:
            try:
                html_url = item.get('html_url', '')
                raw_url = html_url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/')
                cr = requests.get(raw_url, timeout=5)
                if cr.status_code == 200:
                    results.append({
                        'source': 'github',
                        'repo': item.get('repository', {}).get('full_name', ''),
                        'url': html_url,
                        'content': cr.text[:1500]
                    })
            except:
                continue
    except Exception:
        pass
    return results


def fetch_stackoverflow_snippets(query: str, language: str, pagesize: int = 5) -> List[Dict]:
    """Fetch relevant code snippets from StackOverflow."""
    results = []
    try:
        params = {
            'order': 'desc', 'sort': 'relevance',
            'site': 'stackoverflow', 'pagesize': min(pagesize * 2, 20),
            'filter': 'withbody', 'q': query, 'tagged': language.lower()
        }
        r = requests.get('https://api.stackexchange.com/2.3/search/advanced', params=params, timeout=8)
        if r.status_code != 200:
            return results
        import html as _html
        for q_item in r.json().get('items', []):
            if len(results) >= pagesize:
                break
            ar = requests.get(
                f"https://api.stackexchange.com/2.3/questions/{q_item['question_id']}/answers",
                params={'order': 'desc', 'sort': 'votes', 'site': 'stackoverflow', 'filter': 'withbody'},
                timeout=5
            )
            if ar.status_code != 200:
                continue
            for ans in ar.json().get('items', [])[:2]:
                soup = BeautifulSoup(ans.get('body', ''), 'html.parser')
                for pre in soup.find_all('pre'):
                    block = pre.find('code')
                    if block:
                        code_text = _html.unescape(block.get_text()).strip()
                        if len(code_text) > 40:
                            results.append({
                                'source': 'stackoverflow',
                                'title': q_item.get('title', ''),
                                'url': q_item.get('link', ''),
                                'content': code_text[:1500]
                            })
                        if len(results) >= pagesize:
                            break
                if len(results) >= pagesize:
                    break
    except Exception:
        pass
    return results


def fetch_references(code: str, language: str) -> Dict[str, Any]:
    """Fetch GitHub + StackOverflow references for the given code snippet."""
    query = get_search_query_from_code(code, language)
    github = fetch_github_snippets(query, language)
    stackoverflow = fetch_stackoverflow_snippets(query, language)
    return {
        "query_used": query,
        "github": github,
        "stackoverflow": stackoverflow,
        "total": len(github) + len(stackoverflow)
    }


# ──────────────────── Test Case Generation ────────────────────

def generate_test_cases(code: str, problem_desc: str, language: str) -> List[Dict[str, str]]:
    """Use Groq to generate 5 test cases for the given code."""
    try:
        from groq import Groq
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            return []
        client = Groq(api_key=api_key)

        lang_note = ""
        if language.lower() in ('python', 'javascript'):
            lang_note = f"CRITICAL: For {language}, the 'Input' must be a full function call that exists in the code (e.g., 'sum(5, 10)'), not just values."
        elif language.lower() == 'java':
            lang_note = "For Java, provide inputs as they would be passed to the method or main args."
        elif language.lower() == 'cpp':
            lang_note = "For C++, provide inputs suitable for stdin reading or function arguments."

        prompt = f"""Generate 5 test cases for this {language} code:

Problem: {problem_desc}

Code:
{code}

{lang_note}
Provide ONLY test cases in this EXACT format:
Input: <full function call or input values>
Expected: <output>

Include edge cases (empty, large, negative)."""

        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a test case generator. Output only test cases."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3, max_tokens=600
        )
        content = resp.choices[0].message.content
        patterns = re.findall(r'Input:\s*(.*?)\s*Expected:\s*(.*?)(?=\s*Input:|\s*\n\n|\Z)', content, re.DOTALL | re.IGNORECASE)
        test_cases = []
        for inp, exp in patterns:
            in_clean = re.sub(r'[*_`]', '', inp).strip()
            ex_clean = re.sub(r'[*_`]', '', exp).strip()
            if in_clean and ex_clean:
                test_cases.append({"input": in_clean, "expected": ex_clean})
        return test_cases[:5]
    except Exception as e:
        print(f"Test case gen error: {e}")
        return []


# ──────────────────── Code Enhancement ────────────────────

def enhance_code_with_ai(code: str, problem_desc: str, language: str, references: List[Dict] = None) -> Dict[str, Any]:
    """Enhance code using Groq with optional external reference context."""
    try:
        from groq import Groq
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            return {"enhanced_code": code, "explanation": "API key missing."}
        client = Groq(api_key=api_key)

        ref_context = ""
        if references:
            snippets = [r.get('content', '')[:500] for r in references[:3]]
            ref_context = "\n\nReal-world Reference Patterns:\n" + "\n---\n".join(snippets)

        prompt = f"""You are an expert {language} developer. Enhance this code to be production-quality.

Problem: {problem_desc}

Code:
{code}
{ref_context}

TASK:
1. Fix all bugs and fundamental edge cases
2. Optimize for performance: Ensure lower or equal time/memory complexity. Avoid over-engineering that increases constant-time overhead.
3. Apply clean code principles (naming, structure) without sacrificing execution speed.
4. Add concise docstrings/comments

Return ONLY a JSON object:
{{
    "enhanced_code": "complete enhanced version",
    "key_changes": ["change 1", "change 2"],
    "performance_note": "brief performance summary",
    "complexity": "estimated Big-O"
}}"""

        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.2
        )
        return json.loads(resp.choices[0].message.content)
    except Exception as e:
        return {"enhanced_code": code, "explanation": f"Enhancement failed: {e}", "key_changes": [], "performance_note": "", "complexity": ""}
