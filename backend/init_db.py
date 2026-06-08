import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv


load_dotenv(Path(__file__).with_name(".env"))

DATABASE_URL = os.getenv("DATABASE_URL")
MIGRATION_PATH = (
    Path(__file__).resolve().parent.parent
    / "supabase"
    / "migrations"
    / "20260608000100_backend_schema_alignment.sql"
)


def setup_schema() -> bool:
    """Apply the idempotent backend/Supabase schema alignment migration."""
    if not DATABASE_URL:
        print("DATABASE_URL is required in backend/.env. Refusing to use hardcoded credentials.")
        return False

    if not MIGRATION_PATH.exists():
        print(f"Migration file not found: {MIGRATION_PATH}")
        return False

    try:
        sql = MIGRATION_PATH.read_text(encoding="utf-8")
        with psycopg2.connect(DATABASE_URL) as conn:
            conn.autocommit = True
            with conn.cursor() as cursor:
                cursor.execute(sql)
        print("Backend/Supabase schema alignment completed.")
        return True
    except Exception as error:
        print(f"Schema alignment failed: {error}")
        return False


if __name__ == "__main__":
    raise SystemExit(0 if setup_schema() else 1)
