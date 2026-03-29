import os
import sys
from datetime import datetime, timezone
from typing import List, Dict

# Add parent directory to path to allow imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from main import supabase, _load_resume_text
from services.career_pathfinder import _search_jobs_multi_source
from services.notification_service import notification_service

def scan_and_notify_subscribers():
    """
    Core function that should run daily. 
    It iterates through all active subscribers and notifies them of new high-suitability jobs.
    """
    print(f"[{datetime.now()}] 🚀 Initializing Daily Job Scan...")
    
    try:
        # 1. Fetch all active subscriptions
        subs_res = supabase.table('job_notifications').select('*, users(email, id)').eq('is_active', True).execute()
        subscriptions = subs_res.data if subs_res.data else []
        
        print(f"📡 Found {len(subscriptions)} active subscriptions.")
        
        for sub in subscriptions:
            user = sub.get('users', {})
            user_email = user.get('email')
            user_id = user.get('id')
            role = sub.get('role')
            city = sub.get('city')
            min_score = sub.get('min_score', 85)
            
            if not user_email or not user_id:
                continue
                
            print(f"🔍 Scanning for {user_email} (Role: {role}, City: {city})")
            
            # 2. Extract skills from resume for comparison (if available)
            from services.career_pathfinder import _extract_skills_from_text
            
            # Fetch the actual resume text from storage (since it's not in the DB)
            resume_text, _, _ = _load_resume_text(None, user_email)
            skills = _extract_skills_from_text(resume_text or "")
            
            # 3. Perform the multi-source search
            # We use 'Junior' if not specified, or could store in sub
            jobs = _search_jobs_multi_source(role, "Junior", city, skills)
            
            # 4. Filter for NEW matches with high score
            new_high_suitability_jobs = []
            for job in jobs:
                score = job.get('suitability_score', 0)
                link = job.get('link')
                
                if score >= min_score and not notification_service.was_notified(supabase, user_id, link):
                    new_high_suitability_jobs.append(job)
                    # Record the match immediately so we don't notify again in this same run or future runs
                    notification_service.record_match(supabase, user_id, link, score)
            
            # 5. Send notification if we have new matches
            if new_high_suitability_jobs:
                print(f"📧 Sending {len(new_high_suitability_jobs)} matches to {user_email}")
                notification_service.send_job_notification(user_email, new_high_suitability_jobs)
                
                # Update last_notified_at
                supabase.table('job_notifications').update({
                    'last_notified_at': datetime.now(timezone.utc).isoformat()
                }).eq('user_id', user_id).execute()
            else:
                print(f"⏳ No new high-suitability matches for {user_email} today.")
                
        print(f"[{datetime.now()}] ✅ Daily Job Scan completed.")
        
    except Exception as e:
        print(f"❌ Error during job scan: {e}")

if __name__ == "__main__":
    # This can be triggered via GH Actions, Heroku Scheduler, or a Linux Crontab
    scan_and_notify_subscribers()
