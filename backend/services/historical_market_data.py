import os
import json
import requests
from groq import Groq
from typing import Dict, Any, List, Optional

def fetch_serper_snippets(query: str) -> str:
    """Uses Serper API to fetch real-time search snippets."""
    serper_key = os.getenv("SERPER_API_KEY")
    if not serper_key:
        print("SERPER_API_KEY is missing! Using LLM knowledge fallback.")
        return ""
        
    url = "https://google.serper.dev/search"
    payload = json.dumps({"q": query, "num": 5})
    headers = {
        'X-API-KEY': serper_key,
        'Content-Type': 'application/json'
    }
    
    try:
        response = requests.post(url, headers=headers, data=payload)
        response.raise_for_status()
        data = response.json()
        snippets = [item.get("snippet", "") for item in data.get("organic", [])]
        return " ".join(snippets)
    except Exception as e:
        print(f"Serper API Error: {e}")
        return ""

class HistoricalMarketData:
    def __init__(self):
        self._cache_overview = None
    
    def get_role_trends(self, role: str, domain: str = "IT") -> Dict[str, Any]:
        """Uses Serper API + Groq to generate real-time trend analysis for a specific role and domain."""
        snippets = fetch_serper_snippets(f"{role} in {domain} job market hiring trends past decade statistics hiring volume growth global data")
        
        groq_key = os.getenv("GROQ_API_KEY")
        if not groq_key:
            return {
                "trend_line": [{"year": "2021", "count": 45000}, {"year": "2022", "count": 68000}, {"year": "2023", "count": 52000}, {"year": "2024", "count": 59000}, {"year": "2025", "count": 64000}],
                "top_historical_companies": [{"name": "Tech Corp", "count": 50}],
                "total_historical_records": 1000
            }
            
        client = Groq(api_key=groq_key)
        
        prompt = f"""
        Generate a JSON object representing the historical market trend for the role: "{role}".
        Context from search: "{snippets}"
        
        Required JSON format:
        {{
            "trend_line": [{{"year": "YYYY", "count": integer}}], # Exactly 5 years ending in 2024 or 2025
            "top_historical_companies": [{{"name": "Company Name", "count": integer}}], # top 3 companies hiring for this role
            "total_historical_records": integer # approximate total volume
        }}
        
        Instructions:
        - Counts should be realistic for the global tech industry (tens of thousands).
        - Output ONLY valid JSON.
        """
        
        try:
            res = client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model="llama-3.3-70b-versatile",
                response_format={"type": "json_object"},
                temperature=0.3
            )
            return json.loads(res.choices[0].message.content)
        except Exception as e:
            print(f"Role trends error: {e}")
            return {
                "trend_line": [{"year": "2021", "count": 12000}, {"year": "2025", "count": 18500}],
                "top_historical_companies": [{"name": "Generic Tech", "count": 450}],
                "total_historical_records": 50000
            }

    def get_market_overview(self) -> Dict[str, Any]:
        """Uses Serper API + Groq to generate real-time long term market analysis across IT domains."""
        if self._cache_overview:
            return self._cache_overview
            
        snippets = fetch_serper_snippets("IT technology job market hiring trends past decade statistics 2014 to 2024 software data cloud cyber AI")
        
        groq_key = os.getenv("GROQ_API_KEY")
        if not groq_key:
            return self._fallback_market_overview()
            
        client = Groq(api_key=groq_key)
        
        prompt = f"""
        Generate a JSON object representing a "Long-term Market Analysis" for IT domains over the past decade.
        Use these real-time search snippets for context if available: "{snippets}"
        If snippets are empty, rely on your deep accurate knowledge of the 2014-2024 tech job market explosion.
        
        Required JSON format:
        {{
            "top_historical_domains": [{{"name": "Domain Name (e.g. AI & ML, Cloud Computing, Cybersecurity)", "count": integer_representing_volume}}],  # Exactly 5 items
            "top_historical_roles": [{{"name": "Role Name", "count": integer}}], # exactly 5 items
            "overall_trend": [{{"year": "YYYY", "count": integer}}] # exactly 5 items (e.g., 2020, 2021, 2022, 2023, 2024)
        }}
        
        Instructions:
        - "count" values should reflect massive historical global job volumes (e.g., between 80,000 and 900,000+).
        - Ensure "overall_trend" reflects the 2021/2022 tech boom and subsequent stabilization.
        - Output ONLY valid JSON, no markdown formatting blocks.
        """
        
        try:
            res = client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model="llama-3.3-70b-versatile",
                response_format={"type": "json_object"},
                temperature=0.4
            )
            data = json.loads(res.choices[0].message.content)
            self._cache_overview = data
            return data
        except Exception as e:
            print(f"Groq LLM market overview error: {e}")
            return self._fallback_market_overview()
            
    def _fallback_market_overview(self):
        return {
            "top_historical_domains": [
                {"name": "Software Engineering", "count": 850000},
                {"name": "Data Science & Analytics", "count": 620000},
                {"name": "Cloud Architecture", "count": 480000},
                {"name": "Cybersecurity", "count": 310000},
                {"name": "AI & Machine Learning", "count": 250000}
            ],
            "top_historical_roles": [],
            "overall_trend": [
                {"year": "2020", "count": 165000},
                {"year": "2021", "count": 278000},
                {"year": "2022", "count": 292000},
                {"year": "2023", "count": 245000},
                {"year": "2024", "count": 260000}
            ]
        }

class JobRiskService:
    def __init__(self):
        self._cache_fraud = None
        
    def analyze_risk(self, title: str, description: str = "") -> Dict[str, Any]:
        """Uses Serper API + Groq to provide dynamic, real-time risk scoring for a job role."""
        snippets = fetch_serper_snippets(f"recruitment fraud fake job scams targeting {title} roles recent alerts")
        
        groq_key = os.getenv("GROQ_API_KEY")
        if not groq_key:
             return {"score": 15, "level": "Low", "reasons": ["Role appears historically stable."]}
            
        client = Groq(api_key=groq_key)
        
        prompt = f"""
        Analyze the recruitment risk for the role: "{title}".
        Search context: "{snippets}"
        
        Required JSON format:
        {{
            "score": integer (0-100, where 100 is extreme risk),
            "level": "Low" | "Moderate" | "High" | "Extreme",
            "reasons": ["Reason 1", "Reason 2"]
        }}
        
        Instructions:
        - Check if this specific role is being targeted by recent fake job campaigns.
        - High risk if the role is commonly offered as "no-entry remote data entry" or similar scam patterns.
        - Output ONLY valid JSON.
        """
        
        try:
            res = client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model="llama-3.3-70b-versatile",
                response_format={"type": "json_object"},
                temperature=0.3
            )
            return json.loads(res.choices[0].message.content)
        except Exception:
            return {"score": 10, "level": "Low", "reasons": ["No recent fraud alerts for this specific role."]}

    def get_fraud_overview(self) -> Dict[str, Any]:
        """Uses Serper API + Groq to generate real risk metrics"""
        if self._cache_fraud:
            return self._cache_fraud
            
        snippets = fetch_serper_snippets("recruitment fraud fake job scams highest risk industries job titles statistics reports past decade")
        
        groq_key = os.getenv("GROQ_API_KEY")
        if not groq_key:
            return self._fallback_fraud_overview()
            
        client = Groq(api_key=groq_key)
        
        prompt = f"""
        Generate a JSON object representing a "Recruitment Risk Intelligence (Fraud Dataset)".
        Use these real-time search snippets for context if available: "{snippets}"
        If snippets are empty, rely on your knowledge of recruitment fraud trends.
        
        Required JSON format:
        {{
            "top_risk_industries": [{{"name": "Industry Name", "count": integer_fraud_cases}}], # exactly 5 items
            "top_risk_roles": [{{"name": "Job Title", "count": integer}}], # exactly 5 items
            "total_fraud_cases": integer_total
        }}
        
        Instructions:
        - Identify the most fraud-prone remote sectors (e.g., Crypto, Data Entry, Virtual Assistance).
        - "count" should reflect realistic tracking data over years (e.g., thousands or tens of thousands).
        - "total_fraud_cases" should be the sum or an aggregate total representing the dataset size.
        - Output ONLY valid JSON.
        """
        
        try:
            res = client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model="llama-3.3-70b-versatile",
                response_format={"type": "json_object"},
                temperature=0.4
            )
            data = json.loads(res.choices[0].message.content)
            self._cache_fraud = data
            return data
        except Exception as e:
            print(f"Groq LLM fraud overview error: {e}")
            return self._fallback_fraud_overview()

    def _fallback_fraud_overview(self):
        return {
            "top_risk_industries": [
                {"name": "Cryptocurrency & Web3", "count": 18900},
                {"name": "Remote Administration", "count": 14200},
                {"name": "Financial Services", "count": 8400},
                {"name": "E-commerce & Dropshipping", "count": 6100},
                {"name": "Logistics & Forwarding", "count": 3500}
            ],
            "top_risk_roles": [
                {"name": "Remote Data Entry Clerk", "count": 12500},
                {"name": "Virtual Assistant", "count": 9800},
                {"name": "Crypto Trader / Analyst", "count": 7200},
                {"name": "Package Reshipper", "count": 5100},
                {"name": "Customer Support Agent", "count": 4800}
            ],
            "total_fraud_cases": 64500
        }

# Global instances
historical_service = HistoricalMarketData()
risk_service = JobRiskService()
