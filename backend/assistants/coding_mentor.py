import os
import json
import subprocess
import tempfile
import time
import tracemalloc
import re
import shutil
import sys
import uuid
from typing import Dict, Any
from services.langgraph_pipelines import run_coding_mentor_graph

# For compiled langs we need a REAL dir that Docker Desktop allows.
# Use the project's own .sandbox folder (inside the workspace) which is on /home — always shared.
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SANDBOX_DIR = os.path.join(_SCRIPT_DIR, '..', '.sandbox')
os.makedirs(SANDBOX_DIR, exist_ok=True)


def _docker_available() -> bool:
    try:
        r = subprocess.run(['docker', 'info'], capture_output=True, timeout=5)
        return r.returncode == 0
    except Exception:
        return False


def execute_code_safely(code: str, language: str) -> Dict[str, Any]:
    """
    Execute code in a safe sandbox.
    - Interpreted languages (Python, JS, PHP, Ruby): piped via stdin — NO volume mount required.
    - Compiled languages (Java, C++, Go, Rust): use a fixed workspace sandbox dir that Docker Desktop allows.
    """
    results: Dict[str, Any] = {
        'success': False,
        'output': '',
        'error': '',
        'execution_time': 0.0,
        'memory_used': 0.0,
        'complexity': 'O(1)',
        'sandbox_type': 'local'
    }

    use_docker = _docker_available()
    if not use_docker:
        results['error'] = "Secure Docker sandbox is unavailable. Code execution is disabled."
        return results
    results['sandbox_type'] = 'docker'

    lang_lower = language.lower()

    # Language definitions
    # 'stdin': True  → pipe code through stdin, no volume mount needed
    # 'stdin': False → write file, mount volume
    lang_config: Dict[str, Any] = {
        'python': {
            'ext': '.py', 'image': 'python:3.11-slim', 'stdin': True,
            'docker_cmd': ['python', '-'],
            'local_cmd': ['python3', '-c', '{code}'],
        },
        'javascript': {
            'ext': '.js', 'image': 'node:20-slim', 'stdin': True,
            'docker_cmd': ['node', '--input-type=module'],
            'local_cmd': ['node', '-e', '{code}'],
        },
        'php': {
            'ext': '.php', 'image': 'php:8.2-cli-alpine', 'stdin': True,
            'docker_cmd': ['php'],
            'local_cmd': ['php', '-r', '{code_no_tag}'],
        },
        'ruby': {
            'ext': '.rb', 'image': 'ruby:3.2-alpine', 'stdin': True,
            'docker_cmd': ['ruby', '-'],
            'local_cmd': ['ruby', '-e', '{code}'],
        },
        # Compiled — need file + volume mount
        'java': {
            'ext': '.java', 'image': 'eclipse-temurin:17-jdk', 'stdin': False,
        },
        'cpp': {
            'ext': '.cpp', 'image': 'gcc:latest', 'stdin': False,
        },
        'go': {
            'ext': '.go', 'image': 'golang:1.21-alpine', 'stdin': False,
        },
        'rust': {
            'ext': '.rs', 'image': 'rust:1.72-slim', 'stdin': False,
        },
    }

    cfg = lang_config.get(lang_lower)
    if not cfg:
        results['error'] = f"Language '{language}' is not supported."
        return results

    # ── Track time + memory ──────────────────────────────
    tracemalloc.start()
    start_time = time.time()
    run_dir = None

    try:
        # ══════════════════════════════════════════════
        # STDIN-based execution (no volume mount)
        # ══════════════════════════════════════════════
        if cfg.get('stdin'):
            stdin_code = code

            if use_docker:
                docker_cmd = [
                    'docker', 'run', '--rm', '-i',
                    '--network=none',
                    '--memory=256m',
                    '--cpus=0.5',
                    '--pids-limit=128',
                    '--cap-drop=ALL',
                    '--security-opt=no-new-privileges',
                    cfg['image']
                ] + cfg['docker_cmd']
                proc = subprocess.Popen(
                    docker_cmd,
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True
                )
            else:
                # Local fallback
                if lang_lower == 'python':
                    proc = subprocess.Popen(
                        [sys.executable, '-c', stdin_code],
                        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
                    )
                elif lang_lower == 'javascript':
                    proc = subprocess.Popen(
                        ['node', '-e', stdin_code],
                        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
                    )
                elif lang_lower == 'php':
                    # Strip <?php tag for -r flag
                    php_code = re.sub(r'<\?php?\s*', '', stdin_code, count=1).strip()
                    proc = subprocess.Popen(
                        ['php', '-r', php_code],
                        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
                    )
                elif lang_lower == 'ruby':
                    proc = subprocess.Popen(
                        ['ruby', '-e', stdin_code],
                        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
                    )
                else:
                    proc = subprocess.Popen(
                        ['python3', '-c', stdin_code],
                        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
                    )

            try:
                code_input = stdin_code if use_docker else None
                stdout, stderr = proc.communicate(input=code_input, timeout=10)
                results['success'] = proc.returncode == 0
                results['output'] = stdout
                results['error'] = stderr
            except subprocess.TimeoutExpired:
                proc.kill()
                results['error'] = "Execution timeout (10s limit reached)"

        # ══════════════════════════════════════════════
        # File-based execution (compiled languages)
        # Uses a fixed sandbox dir under workspace — Docker Desktop always allows this
        # ══════════════════════════════════════════════
        else:
            run_id = str(uuid.uuid4())[:8]
            run_dir = os.path.join(os.path.abspath(SANDBOX_DIR), run_id)
            os.makedirs(run_dir, exist_ok=True)

            if lang_lower == 'java':
                class_match = re.search(r'public\s+class\s+(\w+)', code)
                classname = class_match.group(1) if class_match else 'Main'
                filename = f"{classname}.java"
                docker_run_cmd = ['sh', '-c', f'javac /code/{filename} && java -cp /code {classname}']
                local_run_cmd = f'javac {run_dir}/{filename} && java -cp {run_dir} {classname}'
            elif lang_lower == 'cpp':
                filename = 'code.cpp'
                docker_run_cmd = ['sh', '-c', 'g++ /code/code.cpp -o /code/app && /code/app']
                local_run_cmd = f'g++ {run_dir}/code.cpp -o {run_dir}/app && {run_dir}/app'
            elif lang_lower == 'go':
                filename = 'code.go'
                docker_run_cmd = ['go', 'run', '/code/code.go']
                local_run_cmd = f'go run {run_dir}/code.go'
            elif lang_lower == 'rust':
                filename = 'code.rs'
                docker_run_cmd = ['sh', '-c', 'rustc /code/code.rs -o /code/app && /code/app']
                local_run_cmd = f'rustc {run_dir}/code.rs -o {run_dir}/app && {run_dir}/app'
            else:
                filename = 'code.txt'
                docker_run_cmd = ['cat', f'/code/{filename}']
                local_run_cmd = f'cat {run_dir}/{filename}'

            # Write the file
            filepath = os.path.join(run_dir, filename)
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(code)

            if use_docker:
                docker_cmd = [
                    'docker', 'run', '--rm',
                    '--network=none',
                    '--memory=256m',
                    '--cpus=0.5',
                    '--pids-limit=128',
                    '--cap-drop=ALL',
                    '--security-opt=no-new-privileges',
                    '-v', f'{run_dir}:/code',
                    cfg['image']
                ] + docker_run_cmd

                proc = subprocess.Popen(
                    docker_cmd,
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
                )
            else:
                proc = subprocess.Popen(
                    local_run_cmd, shell=True,
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
                )

            timeout_seconds = 45 if lang_lower == 'go' else 15

            try:
                stdout, stderr = proc.communicate(timeout=timeout_seconds)
                results['success'] = proc.returncode == 0
                results['output'] = stdout
                results['error'] = stderr
            except subprocess.TimeoutExpired:
                proc.kill()
                results['error'] = f"Execution timeout ({timeout_seconds}s limit)"

    except Exception as e:
        results['error'] = str(e)
    finally:
        elapsed = float(time.time() - start_time)
        _, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        results['execution_time'] = round(elapsed, 3)
        results['memory_used'] = round(float(peak) / 1024 / 1024, 2)

        # Complexity heuristic
        if elapsed < 0.05:
            results['complexity'] = 'O(1)'
        elif elapsed < 0.3:
            results['complexity'] = 'O(log n)'
        elif elapsed < 1.5:
            results['complexity'] = 'O(n)'
        else:
            results['complexity'] = 'O(n²) or higher'

        # Cleanup compiled run dirs
        if run_dir and os.path.exists(run_dir):
            shutil.rmtree(run_dir, ignore_errors=True)

    return results


def analyze_code_deep(code: str, language: str = "python"):
    from groq import Groq
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return {"bugs": [], "explanation": "API Key missing", "fix": "", "optimized": "", "mistakes": [], "optimization_score": 0}

    client = Groq(api_key=api_key)

    def analyze_with_groq(code_text: str, lang: str, exec_results: dict[str, Any]) -> dict[str, Any]:
        prompt = f"""
    You are Coding Mentor AI. Analyze this {language} code.
    
    Code:
    {code_text}
    
    Execution Context (Actual output from {exec_results['sandbox_type']} sandbox):
    Success: {exec_results['success']}
    StdOut: {exec_results['output'][:500]}
    StdErr: {exec_results['error'][:500]}
    Complexity Detected: {exec_results['complexity']}
    Memory: {exec_results['memory_used']} MB
    Time: {exec_results['execution_time']}s
    
    TASK:
    1. Detect logic bugs, syntax errors, or runtime issues shown in output.
    2. Deeply analyze code quality and architecture.
    3. Suggest a specific fix for the detected issues.
    4. Provide an optimized, scalable, and clean version.
    5. List patterns or smells (e.g., complexity issues, naming, nesting).
    6. Assign an optimization score (0-100).

    Return ONLY a JSON object:
    {{
        "bugs": ["list of issues"],
        "explanation": "concise technical breakdown",
        "fix": "corrected copy",
        "optimized": "highly optimized version",
        "mistakes": ["smells detected"],
        "optimization_score": 85,
        "metrics": {{
             "complexity": "{exec_results['complexity']}",
             "time": "{exec_results['execution_time']}s",
             "memory": "{exec_results['memory_used']} MB",
             "sandbox": "{exec_results['sandbox_type']}"
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
            return json.loads(chat_completion.choices[0].message.content)
        except Exception as e:
            print(f"Code Analysis Error: {e}")
            return {
                "bugs": [],
                "explanation": f"Mentoring failed: {str(e)}",
                "fix": "", "optimized": "", "mistakes": [], "optimization_score": 0,
                "metrics": {
                     "complexity": exec_results['complexity'],
                     "time": f"{exec_results['execution_time']}s",
                     "memory": f"{exec_results['memory_used']} MB",
                     "sandbox": exec_results['sandbox_type']
                }
            }

    return run_coding_mentor_graph(code, language, execute_code_safely, analyze_with_groq)
