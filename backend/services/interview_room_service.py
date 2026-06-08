import base64
import math
from typing import Any

import cv2
import numpy as np


FACE_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
EYE_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_eye.xml")
SMILE_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_smile.xml")

_HOG = cv2.HOGDescriptor()
_HOG.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, float(value)))


def _decode_base64_image(image_data: str) -> np.ndarray | None:
    if not image_data:
        return None
    try:
        encoded = image_data.split(",", 1)[1] if "," in image_data else image_data
        img_bytes = base64.b64decode(encoded)
        arr = np.frombuffer(img_bytes, dtype=np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        return frame
    except Exception:
        return None


def analyze_webcam_frame(image_data: str) -> dict[str, Any]:
    frame = _decode_base64_image(image_data)
    if frame is None:
        return {
            "presence_status": "Frame decode failed",
            "alerts": ["Frame decode failed"],
            "metrics": {
                "eye_contact": 0,
                "confidence": 0,
                "body_language": 0,
                "posture": 0,
                "expression": 0,
            },
        }

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    brightness = float(np.mean(gray))
    alerts: list[str] = []
    presence_status = "One person detected"

    if brightness < 18:
        alerts.append("Black screen detected")
        presence_status = "Black screen detected"

    faces = FACE_CASCADE.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))
    bodies, _ = _HOG.detectMultiScale(frame, winStride=(8, 8), padding=(8, 8), scale=1.05)

    estimated_people = max(len(faces), len(bodies))
    if estimated_people == 0:
        alerts.append("No person detected")
        presence_status = "No person detected"
    elif estimated_people > 1:
        alerts.append("Multiple people detected")
        presence_status = "Multiple people detected"

    eye_contact = 0.0
    posture = 0.0
    body_language = 0.0
    expression = 0.0
    eyes: list[Any] = []
    smiles: list[Any] = []

    height, width = gray.shape[:2]

    if len(faces) == 1 and brightness >= 18:
        x, y, w, h = max(faces, key=lambda box: box[2] * box[3])
        roi_gray = gray[y:y + h, x:x + w]
        eyes = EYE_CASCADE.detectMultiScale(roi_gray, scaleFactor=1.1, minNeighbors=8, minSize=(14, 14))
        smiles = SMILE_CASCADE.detectMultiScale(roi_gray, scaleFactor=1.7, minNeighbors=20, minSize=(25, 25))

        face_center_x = x + (w / 2)
        face_center_y = y + (h / 2)
        center_offset_x = abs(face_center_x - (width / 2)) / max(width / 2, 1)
        center_offset_y = abs(face_center_y - (height / 2)) / max(height / 2, 1)
        frame_coverage = (w * h) / max(width * height, 1)

        if len(eyes) >= 2:
            eye_contact = _clamp(80 - center_offset_x * 55 - center_offset_y * 25 + 15)

        if len(eyes) >= 2:
            sorted_eyes = sorted(eyes, key=lambda eye: eye[0])[:2]
            left_eye, right_eye = sorted_eyes[0], sorted_eyes[-1]
            eye_y_delta = abs((left_eye[1] + left_eye[3] / 2) - (right_eye[1] + right_eye[3] / 2))
            tilt_ratio = eye_y_delta / max(h, 1)
            posture = _clamp(88 - tilt_ratio * 350 - center_offset_y * 30)
        if len(bodies) == 1:
            body_language = _clamp(frame_coverage * 220 - center_offset_x * 40)

        if len(smiles) > 0:
            expression = _clamp(min(len(smiles), 2) * 35)
    else:
        expression = 0 if estimated_people == 0 else 35
        posture = 0 if estimated_people == 0 else 30
        body_language = 0 if estimated_people == 0 else 30

    confidence = _clamp(
        eye_contact * 0.35
        + posture * 0.25
        + body_language * 0.20
        + expression * 0.20
    )

    return {
        "presence_status": presence_status,
        "alerts": alerts,
        "metrics": {
            "eye_contact": round(eye_contact, 1),
            "confidence": round(confidence, 1),
            "body_language": round(body_language, 1),
            "posture": round(posture, 1),
            "expression": round(expression, 1),
        },
        "diagnostics": {
            "brightness": round(brightness, 1),
            "faces": int(len(faces)),
            "bodies": int(len(bodies)),
            "eye_contact_measured": bool(len(faces) == 1 and len(eyes) >= 2),
            "posture_measured": bool(len(faces) == 1 and len(eyes) >= 2),
            "body_language_measured": bool(len(faces) == 1 and len(bodies) == 1),
            "expression_measured": bool(len(faces) == 1 and len(smiles) > 0),
        },
    }


def analyze_speech_clarity(
    transcript: str,
    volume_score: float = 0.0,
    duration_seconds: float | None = None,
    speech_detected: bool = False,
) -> dict[str, Any]:
    text = (transcript or "").strip()
    if not speech_detected or not text or volume_score <= 0:
        return {
            "clarity_score": 0,
            "communication_score": 0,
            "pace_score": 0,
            "filler_count": 0,
            "words_per_minute": 0,
            "summary": "Speech was not measured because no microphone speech was detected.",
            "tips": ["Use Speak Answer and provide microphone input to receive speech feedback."],
            "source": "not_measured",
            "speech_detected": False,
            "pyclarity_used": False,
        }

    volume_score = _clamp(volume_score)
    words = [word for word in text.replace("\n", " ").split(" ") if word]
    word_count = len(words)
    filler_matches = []
    lowered = text.lower()
    for filler in ["um", "uh", "like", "you know", "actually", "basically", "literally", "sort of", "kind of"]:
        filler_matches.extend([filler] * lowered.count(filler))

    unique_ratio = len({word.lower().strip(".,!?") for word in words}) / max(word_count, 1)
    sentences = [part.strip() for part in text.replace("!", ".").replace("?", ".").split(".") if part.strip()]
    avg_sentence_length = word_count / max(len(sentences), 1)

    if duration_seconds is None or duration_seconds <= 0:
        duration_seconds = max(word_count / 2.4, 1.0)
    words_per_minute = (word_count / duration_seconds) * 60.0

    pace_score = _clamp(95 - abs(words_per_minute - 135) * 0.55)
    filler_penalty = min(len(filler_matches) * 6.0, 36.0)
    structure_bonus = 10.0 if len(sentences) >= 3 else 4.0
    clarity_score = _clamp(38 + unique_ratio * 32 + pace_score * 0.18 + volume_score * 0.22 + structure_bonus - filler_penalty)
    communication_score = _clamp(36 + unique_ratio * 28 + pace_score * 0.22 + volume_score * 0.16 + structure_bonus - filler_penalty * 0.85)

    tips: list[str] = []
    if word_count < 25:
        tips.append("Give a fuller answer with context, action, and measurable result.")
    if words_per_minute > 165:
        tips.append("Slow down slightly so the interviewer can follow each idea more clearly.")
    if words_per_minute < 95:
        tips.append("Increase your pace a little to sound more confident and fluent.")
    if len(filler_matches) >= 3:
        tips.append("Replace filler words with short pauses between points.")
    if volume_score < 45:
        tips.append("Speak a bit louder and keep your voice steadier.")
    if avg_sentence_length > 24:
        tips.append("Use shorter sentences to make your answer sharper.")
    if not tips:
        tips.append("Your answer flow is clear. Keep the same structure and energy.")

    summary = (
        f"Estimated pace {round(words_per_minute)} WPM, filler words {len(filler_matches)}, "
        f"clarity score {round(clarity_score)}."
    )

    return {
        "clarity_score": round(clarity_score, 1),
        "communication_score": round(communication_score, 1),
        "pace_score": round(pace_score, 1),
        "filler_count": len(filler_matches),
        "words_per_minute": round(words_per_minute, 1),
        "summary": summary,
        "tips": tips[:5],
        "source": "backend_heuristic",
        "speech_detected": True,
        "pyclarity_used": False,
    }
