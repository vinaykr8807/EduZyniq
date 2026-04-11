import pandas as pd
import os
from collections import Counter

class JobRiskService:
    def __init__(self, csv_path=None):
        if csv_path is None:
            # Get the path to the dataset relative to this file
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            csv_path = os.path.join(base_dir, "JOBS DATASET", "fake_job_postings.csv")
        self.csv_path = csv_path
        self._df = None
        self._load_data()

    def _load_data(self):
        if not os.path.exists(self.csv_path):
            print(f"Risk Dataset not found at: {self.csv_path}")
            return
        
        try:
            # Load only necessary columns for efficiency
            self._df = pd.read_csv(self.csv_path)
            print(f"Risk Assessment Loaded: {len(self._df)} records")
        except Exception as e:
            print(f"Error loading risk dataset: {e}")

    def analyze_risk(self, title, description=""):
        if self._df is None: return {"score": 0, "reason": "Risk dataset unavailable"}
        
        # Simple rule-based risk score from dataset
        # In real scenario, we'd train a model. For now, we'll check common patterns in fraudulent postings
        
        title_lower = title.lower()
        # Find similar titles in fraudulent records
        fraudulent_records = self._df[self._df['fraudulent'] == 1]
        
        matches = fraudulent_records[fraudulent_records['title'].str.contains(title_lower, case=False, na=False)]
        
        score = 0
        reasons = []
        
        if len(matches) > 5:
            score += 40
            reasons.append(f"Historical fraud pattern: '{title}' has been associated with {len(matches)} suspicious postings.")
        
        # Check description for common fraud flags (e.g., payment, money, transfer, easy work)
        flags = ["payment", "transfer", "bank account", "shipment", "processing fee", "working from home", "easy money"]
        detected_flags = [f for f in flags if f in description.lower()]
        
        if detected_flags:
            score += len(detected_flags) * 15
            reasons.append(f"Suspicious terminology detected: {', '.join(detected_flags)}")
            
        # Normalize score to 0-100
        score = min(score, 100)
        
        risk_level = "Low"
        if score > 70: risk_level = "High"
        elif score > 30: risk_level = "Moderate"
        
        return {
            "score": score,
            "level": risk_level,
            "reasons": reasons if reasons else ["No suspicious historical patterns detected for this role."]
        }

    def get_fraud_overview(self):
        if self._df is None: return {}
        
        # Top industries with fraudulent postings
        fraudulent = self._df[self._df['fraudulent'] == 1]
        top_fraud_industries = fraudulent['industry'].value_counts().head(5).to_dict()
        top_fraud_titles = fraudulent['title'].value_counts().head(5).to_dict()
        
        return {
            "top_risk_industries": [{"name": k, "count": int(v)} for k, v in top_fraud_industries.items()],
            "top_risk_roles": [{"name": k, "count": int(v)} for k, v in top_fraud_titles.items()],
            "total_fraud_cases": len(fraudulent)
        }

risk_service = JobRiskService()
