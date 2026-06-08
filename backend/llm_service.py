import os
import requests
import json
from prompts import *
from dotenv import load_dotenv

load_dotenv()

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma3:latest")

GROQ_API_KEY = os.getenv("GROQ_API_KEY")


def _configure_tesseract(pytesseract_module):
    configured = os.getenv("TESSERACT_CMD")
    candidates = [
        configured,
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    ]
    for candidate in candidates:
        if candidate and os.path.isfile(candidate):
            pytesseract_module.pytesseract.tesseract_cmd = candidate
            return


def get_system_prompt(mode, profile=None):
    from prompts import get_assistant_prompt, get_student_context
    base_prompt = get_assistant_prompt(mode)
    if profile:
        base_prompt += get_student_context(profile)
    return base_prompt

from services.rag import inject_rag_context

def generate_response(user_message, mode="default", profile=None):
    from groq import Groq
    if not GROQ_API_KEY:
        return "⚠️ Groq API key is missing. Please check your .env file."
        
    client = Groq(api_key=GROQ_API_KEY)
    system_prompt = get_system_prompt(mode, profile)
    
    # Inject RAG Context
    enriched_prompt = inject_rag_context(system_prompt, user_message)
    
    try:
        chat_completion = client.chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": enriched_prompt,
                }
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.7,
            max_tokens=4096,
            stream=False
        )
        return chat_completion.choices[0].message.content
    except Exception as e:
        print(f"Groq Error: {e}")
        return f"⚠️ Error connecting to Groq AI. Technical details: {str(e)}"

def extract_text_from_image(image_bytes):
    """OCR using Tesseract"""
    try:
        from PIL import Image
        from io import BytesIO
        import pytesseract

        _configure_tesseract(pytesseract)
        img = Image.open(BytesIO(image_bytes))
        text = pytesseract.image_to_string(img)
        return text
    except Exception as e:
        print(f"OCR Error: {e}")
        return None

def extract_text_from_file(file_bytes, filename: str):
    """Generic extractor for PDF, DOCX, and Images with OCR Fallback"""
    from io import BytesIO
    ext = filename.split('.')[-1].lower()
    
    try:
        if ext == 'pdf':
            # 1. Try pypdf for standard digital PDFs.
            try:
                from pypdf import PdfReader
                reader = PdfReader(BytesIO(file_bytes))
                text = "\n".join((page.extract_text() or "") for page in reader.pages)

                if text.strip():
                    return text
            except Exception as e:
                print(f"pypdf extraction failed: {e}")

            # 2. Try pdfplumber (often better for resume layouts).
            try:
                import pdfplumber
                with pdfplumber.open(BytesIO(file_bytes)) as pdf:
                    text = ""
                    for page in pdf.pages:
                        page_text = page.extract_text()
                        if page_text:
                            text += page_text + "\n"
                
                if text.strip():
                    return text
            except Exception as e:
                print(f"pdfplumber extraction failed: {e}")

            # 3. Try PyMuPDF (fitz) as another digital fallback.
            try:
                import fitz
                doc = fitz.open(stream=file_bytes, filetype="pdf")
                text = ""
                for page in doc:
                    text += page.get_text() + "\n"
                
                if text.strip():
                    return text
            except Exception as e:
                print(f"PyMuPDF extraction failed: {e}")
            
            # 4. Fallback to Tesseract OCR for scanned PDFs.
            try:
                from pdf2image import convert_from_bytes
                import pytesseract
                _configure_tesseract(pytesseract)
                images = convert_from_bytes(file_bytes, last_page=2)
                ocr_text = ""
                for img in images:
                    ocr_text += pytesseract.image_to_string(img) + "\n"
                return ocr_text if ocr_text.strip() else None
            except Exception as e:
                print(f"PDF OCR Fallback failed: {e}")
                return None
            
        elif ext in ['docx', 'doc']:
            import docx
            doc = docx.Document(BytesIO(file_bytes))
            text = "\n".join([para.text for para in doc.paragraphs])
            
            # DOCX usually has digital text, but if it's mostly images, OCR is harder.
            # We'll assume digital for now as DOCX scans are rare.
            return text
            
        elif ext in ['png', 'jpg', 'jpeg', 'webp']:
            return extract_text_from_image(file_bytes)
            
        return None
    except Exception as e:
        print(f"Extraction Error ({ext}): {e}")
        return None

def analyze_resume_domain(resume_text):
    """Uses LLM to identify domain and skills from resume text"""
    prompt = f"""
    Analyze the following resume text. 
    1. Identify the primary domain (e.g., Web Development, AIML, Finance, etc.)
    2. Extract a list of key technical skills.
    
    Resume Text:
    {resume_text[:2000]}  # Truncate for efficiency
    
    Return the result in JSON format only:
    {{
        "domain": "string",
        "skills": ["skill1", "skill2"]
    }}
    """
    
    from groq import Groq
    if not GROQ_API_KEY:
        return {"domain": "General", "skills": []}

    client = Groq(api_key=GROQ_API_KEY)
    
    try:
        chat_completion = client.chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            model="llama-3.3-70b-versatile",
            response_format={"type": "json_object"},
            stream=False
        )
        return json.loads(chat_completion.choices[0].message.content)
    except Exception as e:
        print(f"Groq Analyze Error: {e}")
        return {"domain": "General", "skills": []}
