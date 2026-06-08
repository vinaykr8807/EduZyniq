from __future__ import annotations

import argparse
import os
import secrets
import smtplib
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from jose import jwt


BACKEND_DIR = Path(__file__).resolve().parents[1]
ENV_PATH = BACKEND_DIR / ".env"
JWT_ALGORITHM = "HS256"


def _read_env_lines() -> list[str]:
    if not ENV_PATH.exists():
        return []
    return ENV_PATH.read_text(encoding="utf-8", errors="ignore").splitlines()


def _parse_env(lines: list[str]) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def _write_env_value(key: str, value: str) -> None:
    lines = _read_env_lines()
    replaced = False
    new_lines: list[str] = []

    for line in lines:
        if "=" in line and not line.lstrip().startswith("#"):
            existing_key, _ = line.split("=", 1)
            if existing_key.strip() == key:
                new_lines.append(f"{key}={value}")
                replaced = True
                continue
        new_lines.append(line)

    if not replaced:
        if new_lines and new_lines[-1].strip():
            new_lines.append("")
        new_lines.append("# JWT Secret Key (Required)")
        new_lines.append(f"{key}={value}")

    ENV_PATH.write_text("\n".join(new_lines) + "\n", encoding="utf-8")


def _mask(value: str | None) -> str:
    if not value:
        return "missing"
    if len(value) <= 10:
        return "set"
    return f"{value[:4]}...{value[-4:]}"


def _status(name: str, ok: bool, detail: str = "") -> bool:
    marker = "OK" if ok else "FAIL"
    suffix = f" - {detail}" if detail else ""
    print(f"[{marker}] {name}{suffix}")
    return ok


def ensure_jwt_secret(force: bool = False) -> str:
    values = _parse_env(_read_env_lines())
    current = values.get("JWT_SECRET_KEY", "")
    if current and not force:
        print(f"[OK] JWT_SECRET_KEY already present ({_mask(current)})")
        return current

    secret = secrets.token_urlsafe(64)
    _write_env_value("JWT_SECRET_KEY", secret)
    print("[OK] JWT_SECRET_KEY written to backend/.env")
    return secret


def test_jwt(secret: str) -> bool:
    try:
        payload = {
            "sub": "credential-check@example.com",
            "role": "student",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
        }
        token = jwt.encode(payload, secret, algorithm=JWT_ALGORITHM)
        decoded = jwt.decode(token, secret, algorithms=[JWT_ALGORITHM])
        return _status("JWT encode/decode", decoded.get("sub") == payload["sub"])
    except Exception as exc:
        return _status("JWT encode/decode", False, str(exc))


def test_supabase(values: dict[str, str]) -> bool:
    url = values.get("NEXT_PUBLIC_SUPABASE_URL")
    key = values.get("SUPABASE_SERVICE_ROLE_KEY") or values.get("SUPABASE_ANON_KEY")
    if not url or not key:
        return _status("Supabase credentials", False, "missing URL or key")

    try:
        from supabase import create_client

        client = create_client(url, key)
        result = client.table("users").select("id").limit(1).execute()
        rows = getattr(result, "data", []) or []
        return _status("Supabase connection", True, f"reachable, sample rows={len(rows)}")
    except Exception as exc:
        return _status("Supabase connection", False, str(exc))


def test_groq(values: dict[str, str], live: bool = False) -> bool:
    key = values.get("GROQ_API_KEY")
    if not key:
        return _status("Groq API key", False, "missing")
    if not live:
        return _status("Groq API key", True, f"present ({_mask(key)}), live check skipped")

    try:
        from groq import Groq

        client = Groq(api_key=key)
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": "Reply with OK only."}],
            max_tokens=4,
            temperature=0,
        )
        content = response.choices[0].message.content or ""
        return _status("Groq live request", "OK" in content.upper(), content.strip()[:80])
    except Exception as exc:
        return _status("Groq live request", False, str(exc))


def test_smtp(values: dict[str, str], live: bool = False) -> bool:
    required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "FROM_EMAIL"]
    missing = [key for key in required if not values.get(key)]
    if missing:
        return _status("SMTP credentials", False, f"missing {', '.join(missing)}")
    if not live:
        return _status("SMTP credentials", True, "present, live login skipped")

    try:
        host = values["SMTP_HOST"]
        port = int(values["SMTP_PORT"])
        with smtplib.SMTP(host, port, timeout=15) as server:
            server.starttls()
            server.login(values["SMTP_USER"], values["SMTP_PASS"])
        return _status("SMTP live login", True)
    except Exception as exc:
        return _status("SMTP live login", False, str(exc))


def test_optional_keys(values: dict[str, str]) -> bool:
    checks = {
        "GitHub token": values.get("GITHUB_TOKEN"),
        "StackOverflow API key": values.get("STACKOVERFLOW_API_KEY"),
        "Pexels API key": values.get("PEXELS_API_KEY"),
        "Serper API key": values.get("SERPER_API_KEY"),
        "Neo4j URI": values.get("NEO4J_URI"),
        "Neo4j username": values.get("NEO4J_USERNAME"),
        "Neo4j password": values.get("NEO4J_PASSWORD"),
    }
    ok = True
    for name, value in checks.items():
        ok = _status(name, bool(value), _mask(value)) and ok
    return ok


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate JWT secret and validate backend credentials.")
    parser.add_argument("--force", action="store_true", help="replace JWT_SECRET_KEY even if it already exists")
    parser.add_argument("--live-groq", action="store_true", help="make a tiny live Groq API request")
    parser.add_argument("--live-smtp", action="store_true", help="attempt SMTP login")
    args = parser.parse_args()

    if not ENV_PATH.exists():
        print(f"[FAIL] Missing env file: {ENV_PATH}")
        return 1

    secret = ensure_jwt_secret(force=args.force)
    load_dotenv(ENV_PATH, override=True)
    values = _parse_env(_read_env_lines())
    values["JWT_SECRET_KEY"] = secret

    print("\nCredential checks")
    checks = [
        test_jwt(secret),
        test_supabase(values),
        test_groq(values, live=args.live_groq),
        test_smtp(values, live=args.live_smtp),
        test_optional_keys(values),
    ]

    if all(checks):
        print("\nAll checked credentials passed.")
        return 0

    print("\nSome checks failed. See messages above.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
