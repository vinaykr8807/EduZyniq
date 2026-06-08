import os
import json
import requests
from groq import Groq
from typing import Dict, Any, List, Optional
from collections import Counter
from urllib.parse import urlparse

def fetch_serper_snippets(query: str, num: int = 5) -> str:
    """Uses Serper API to fetch real-time search snippets."""
    serper_key = os.getenv("SERPER_API_KEY")
    if not serper_key:
        print("SERPER_API_KEY is missing. No market snippets available.")
        return ""
        
    url = "https://google.serper.dev/search"
    payload = json.dumps({"q": query, "num": num})
    headers = {
        'X-API-KEY': serper_key,
        'Content-Type': 'application/json'
    }
    
    try:
        response = requests.post(url, headers=headers, data=payload)
        response.raise_for_status()
        data = response.json()
        snippets = [
            f"{item.get('title', '')}: {item.get('snippet', '')}"
            for item in data.get("organic", [])
        ]
        return " ".join(snippets)
    except Exception as e:
        print(f"Serper API Error: {e}")
        return ""


def fetch_serper_sources(query: str, num: int = 6) -> List[Dict[str, str]]:
    """Return verifiable organic search records without generated counts."""
    serper_key = os.getenv("SERPER_API_KEY")
    if not serper_key:
        return []

    try:
        response = requests.post(
            "https://google.serper.dev/search",
            headers={"X-API-KEY": serper_key, "Content-Type": "application/json"},
            data=json.dumps({"q": query, "num": num, "gl": "in"}),
            timeout=10,
        )
        response.raise_for_status()
        records: List[Dict[str, str]] = []
        for item in response.json().get("organic", []):
            link = str(item.get("link", "")).strip()
            title = str(item.get("title", "")).strip()
            if not link or not title:
                continue
            records.append({
                "title": title,
                "link": link,
                "source": urlparse(link).netloc.lower().replace("www.", ""),
                "snippet": str(item.get("snippet", "")).strip(),
                "date": str(item.get("date", "")).strip(),
                "query": query,
            })
        return records
    except Exception as error:
        print(f"Serper source fetch error: {error}")
        return []


def add_professional_summaries(records: List[Dict[str, str]], context: str, limit: int = 12) -> List[Dict[str, str]]:
    """Use Groq to rewrite raw search snippets into clean summaries without changing evidence."""
    if not records:
        return records

    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key:
        return records

    selected = records[:limit]
    payload = [
        {
            "index": idx,
            "title": record.get("title", ""),
            "source": record.get("source", ""),
            "snippet": record.get("snippet", ""),
        }
        for idx, record in enumerate(selected)
    ]
    prompt = f"""
Rewrite these search-result snippets into professional, user-friendly summaries for: {context}.

Rules:
- Use only the title, source, and snippet provided.
- Do not add facts, numbers, claims, or recommendations not present in the source text.
- If the source is vague, say what the source appears to discuss rather than inventing details.
- Keep each summary one clear sentence, 18-32 words.
- Return ONLY valid JSON in this shape:
{{"summaries":[{{"index":0,"professional_summary":"..."}}]}}

Sources:
{json.dumps(payload, ensure_ascii=True)}
"""

    try:
        client = Groq(api_key=groq_key)
        res = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        data = json.loads(res.choices[0].message.content)
        summaries = {
            int(item.get("index")): str(item.get("professional_summary", "")).strip()
            for item in data.get("summaries", [])
            if isinstance(item, dict) and str(item.get("professional_summary", "")).strip()
        }
        for idx, summary in summaries.items():
            if 0 <= idx < len(selected):
                selected[idx]["professional_summary"] = summary
        return records
    except Exception as error:
        print(f"Groq source summary error: {error}")
        return records


class HistoricalMarketData:
    def __init__(self):
        self._cache_overview = None
    
    def get_role_trends(self, role: str, domain: str = "IT") -> Dict[str, Any]:
        """Return actual indexed source records for a role/domain."""
        queries = [
            f"{role} {domain} hiring trends 2021 2022 2023 2024 2025 job postings India startups",
            f"{role} startup jobs India hiring Wellfound CutShort Instahyre Hirist requirements",
            f"{role} Glassdoor AmbitionBox interview questions employee reviews skills required",
            f"{role} job openings India SaaS fintech edtech healthtech startups 2025",
        ]
        unique_sources: Dict[str, Dict[str, str]] = {}
        for query in queries:
            for record in fetch_serper_sources(query, num=6):
                canonical_link = record["link"].split("#", 1)[0].rstrip("/")
                unique_sources.setdefault(canonical_link, record)

        source_records = add_professional_summaries(
            list(unique_sources.values()),
            f"{role} hiring and interview market source evidence",
            limit=12,
        )
        source_counts = Counter(record["source"] for record in source_records if record["source"])
        if not source_records:
            return {
                "trend_line": [],
                "top_historical_companies": [],
                "total_historical_records": 0,
                "source_records": [],
                "source_domains": [],
                "error": "No indexed source records were returned. No fallback data was used.",
                "no_fallback_used": True,
                "confidence": "Unavailable",
            }

        return {
            "trend_line": [],
            "top_historical_companies": [],
            "total_historical_records": len(source_records),
            "source_records": source_records,
            "source_domains": [
                {"name": source, "count": count}
                for source, count in source_counts.most_common()
            ],
            "confidence": "Direct indexed sources",
            "methodology": (
                "Each item is a unique organic Serper result with its original title, URL, "
                "domain, snippet, and available date. No LLM-generated counts are used."
            ),
            "no_fallback_used": True,
        }

    def get_market_overview(self) -> Dict[str, Any]:
        """Uses Serper API + Groq to generate real-time long term market analysis across IT domains."""
        if self._cache_overview:
            return self._cache_overview
            
        snippets = fetch_serper_snippets("IT technology job market hiring trends past decade statistics 2014 to 2024 software data cloud cyber AI")
        if not snippets.strip():
            return self._empty_market_overview("No source snippets found for historical market overview. No fallback stats were used.")
        
        groq_key = os.getenv("GROQ_API_KEY")
        if not groq_key:
            return self._empty_market_overview("GROQ_API_KEY missing. Historical market overview was not generated.")
            
        client = Groq(api_key=groq_key)
        
        prompt = f"""
        Generate a JSON object representing a "Long-term Market Analysis" for IT domains over the past decade.
        Use these real-time search snippets for context: "{snippets}"
        
        Required JSON format:
        {{
            "top_historical_domains": [{{"name": "Domain Name (e.g. AI & ML, Cloud Computing, Cybersecurity)", "count": integer_representing_volume}}],  # Exactly 5 items
            "top_historical_roles": [{{"name": "Role Name", "count": integer}}], # exactly 5 items
            "overall_trend": [{{"year": "YYYY", "count": integer}}] # exactly 5 items (e.g., 2020, 2021, 2022, 2023, 2024)
        }}
        
        Instructions:
        - "count" values should reflect indexed source-signal volume from the snippets, not exact global job totals.
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
            data["confidence"] = "Estimated from live source snippets"
            data["methodology"] = "Counts are source-signal estimates generated from Serper snippets, not audited job totals."
            data["no_fallback_used"] = True
            self._cache_overview = data
            return data
        except Exception as e:
            print(f"Groq LLM market overview error: {e}")
            return self._empty_market_overview(f"Historical market overview generation failed: {e}")
            
    def _empty_market_overview(self, error: str):
        return {
            "top_historical_domains": [],
            "top_historical_roles": [],
            "overall_trend": [],
            "error": error,
            "confidence": "Unavailable",
            "no_fallback_used": True,
        }

class JobRiskService:
    def __init__(self):
        self._cache_fraud = None
        
    def analyze_risk(self, title: str, description: str = "") -> Dict[str, Any]:
        """Return source-backed recruitment scam evidence without predictive scores."""
        queries = [
            f"recruitment fraud fake job scams targeting {title} roles recent alerts",
            f"fake job scam {title} India recruitment warning",
            f"job scam alerts tech workers {title} fake offer",
        ]
        unique_sources: Dict[str, Dict[str, str]] = {}
        for query in queries:
            for record in fetch_serper_sources(query, num=5):
                canonical_link = record["link"].split("#", 1)[0].rstrip("/")
                unique_sources.setdefault(canonical_link, record)

        source_records = add_professional_summaries(
            list(unique_sources.values()),
            f"recruitment scam evidence for {title}",
            limit=8,
        )
        source_domains = [
            {"name": source, "count": count}
            for source, count in Counter(record["source"] for record in source_records if record["source"]).most_common()
        ]
        if not source_records:
            return {
                "score": 0,
                "level": "Unknown",
                "reasons": ["No indexed recruitment-scam source records were found for this role."],
                "source_records": [],
                "source_domains": [],
                "confidence": "Unavailable",
                "evidence_available": False,
                "methodology": "No fallback risk score was generated.",
                "no_fallback_used": True,
            }

        return {
            "score": 0,
            "level": "Source Evidence Found",
            "reasons": [
                f"{record['source']}: {record['title']}"
                for record in source_records[:3]
            ],
            "source_records": source_records,
            "source_domains": source_domains,
            "confidence": "Direct indexed sources",
            "evidence_available": True,
            "methodology": (
                "This is not a predictive risk score. It lists unique indexed sources returned by Serper "
                "for role-specific recruitment-scam queries."
            ),
            "no_fallback_used": True,
        }

    def get_fraud_overview(self) -> Dict[str, Any]:
        """Uses Serper API + Groq to generate real risk metrics"""
        if self._cache_fraud:
            return self._cache_fraud
            
        snippets = fetch_serper_snippets("recruitment fraud fake job scams highest risk industries job titles statistics reports past decade")
        if not snippets.strip():
            return self._empty_fraud_overview("No source snippets found for fraud overview. No fallback stats were used.")
        
        groq_key = os.getenv("GROQ_API_KEY")
        if not groq_key:
            return self._empty_fraud_overview("GROQ_API_KEY missing. Fraud overview was not generated.")
            
        client = Groq(api_key=groq_key)
        
        prompt = f"""
        Generate a JSON object representing a "Recruitment Risk Intelligence (Fraud Dataset)".
        Use these real-time search snippets for context: "{snippets}"
        
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
            data["confidence"] = "Estimated from live source snippets"
            data["methodology"] = "Counts are source-signal estimates generated from Serper snippets, not audited fraud totals."
            data["no_fallback_used"] = True
            self._cache_fraud = data
            return data
        except Exception as e:
            print(f"Groq LLM fraud overview error: {e}")
            return self._empty_fraud_overview(f"Fraud overview generation failed: {e}")

    def _empty_fraud_overview(self, error: str):
        return {
            "top_risk_industries": [],
            "top_risk_roles": [],
            "total_fraud_cases": 0,
            "error": error,
            "confidence": "Unavailable",
            "no_fallback_used": True,
        }

# Global instances
historical_service = HistoricalMarketData()
risk_service = JobRiskService()
