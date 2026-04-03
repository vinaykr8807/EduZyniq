import psycopg2
import urllib.parse
password = "mydobis059@123"
safe_password = urllib.parse.quote_plus(password)
URL = f"postgresql://postgres:{safe_password}@db.wlnybmztpkocfbnoacgs.supabase.co:5432/postgres"

def run():
    print("Connecting...")
    conn = psycopg2.connect(URL)
    conn.autocommit = True
    cursor = conn.cursor()
    print("Altering user_progress...")
    try:
        cursor.execute("ALTER TABLE user_progress ADD COLUMN quizzes_completed INTEGER DEFAULT 0;")
    except Exception as e:
        print(e)
    try:
        cursor.execute("ALTER TABLE user_progress ADD COLUMN interviews_completed INTEGER DEFAULT 0;")
    except Exception as e:
        print(e)
    try:
        cursor.execute("ALTER TABLE user_progress ADD COLUMN coding_completed INTEGER DEFAULT 0;")
    except Exception as e:
        print(e)
    try:
        cursor.execute("ALTER TABLE user_progress ADD COLUMN topics_completed INTEGER DEFAULT 0;")
    except Exception as e:
        print(e)
    print("Done")

if __name__ == "__main__":
    run()
