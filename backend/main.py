import base64
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google import genai
from google.genai import types

# Load GEMINI_API_KEY from backend/.env if it is not already present in the environment.
def load_local_env():
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if not os.path.exists(env_path):
        return
    try:
        with open(env_path, "r", encoding="utf-8") as f:
            for raw in f:
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                name, value = line.split("=", 1)
                name = name.strip()
                value = value.strip().strip('\"').strip("'")
                if name and value and name not in os.environ:
                    os.environ[name] = value
    except OSError:
        pass

load_local_env()

app = FastAPI(title="AgriN API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5174", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AskRequest(BaseModel):
    question: str
    language: str = "ta-IN"

class ImageRequest(BaseModel):
    image: str
    question: str = "Explain this crop image and identify visible crop health or disease signs."
    language: str = "ta-IN"

LANGUAGE_NAMES = {
    "ta-IN": "Tamil",
    "en-IN": "English",
    "hi-IN": "Hindi",
    "te-IN": "Telugu",
    "kn-IN": "Kannada",
    "ml-IN": "Malayalam",
    "mr-IN": "Marathi",
    "bn-IN": "Bengali",
    "gu-IN": "Gujarati",
    "pa-IN": "Punjabi",
}

MODELS = [
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite"
]


def get_client():
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured")
    return genai.Client(api_key=key)


def system_prompt(language_name: str) -> str:
    return f"""
You are AgriN, a reliable agriculture assistant for farmers.
Reply in {language_name}.
Understand Tamil, English, Tanglish, mixed-language speech, short phrases, spelling mistakes, and incomplete voice transcripts.
Infer the user's likely agriculture intent from context instead of rejecting a short or imperfect question.
If the meaning is still genuinely unclear, ask one short clarification question.
Use simple farmer-friendly language.
Keep answers practical and concise, normally 3 to 7 sentences.
Do not use markdown bullets, stars, headings, or unnecessary formatting.
Do not invent pesticide or fertilizer doses. If chemical treatment is discussed, tell the farmer to follow the product label and local agricultural guidance.
If the question is missing important crop/location information, ask one short follow-up question.
Do not claim certainty when an image or information is insufficient.
"""


def generate_text(client, contents, config):
    last_error = None
    for model in MODELS:
        try:
            response = client.models.generate_content(model=model, contents=contents, config=config)
            text = response.text or ""
            if text.strip():
                return text, model
        except Exception as exc:
            last_error = exc
    raise RuntimeError(str(last_error) if last_error else "No AI response")


@app.get("/")
def root():
    return {"message": "AgriN API is running", "status": "healthy"}

@app.get("/health")
def health():
    return {"status": "healthy", "ai": bool(os.getenv("GEMINI_API_KEY"))}


@app.post("/ask")
def ask_agri(request: AskRequest):
    client = get_client()
    language_name = LANGUAGE_NAMES.get(request.language, "English")
    try:
        answer, model = generate_text(
            client,
            request.question,
            types.GenerateContentConfig(
                system_instruction=system_prompt(language_name),
                temperature=0.1,
                max_output_tokens=350,
            ),
        )
        return {"question": request.question, "answer": answer, "language": request.language, "model": model}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"AI service temporarily unavailable: {exc}")


@app.post("/analyze-image")
def analyze_image(request: ImageRequest):
    client = get_client()
    language_name = LANGUAGE_NAMES.get(request.language, "English")

    try:
        encoded = request.image
        if "," in encoded:
            header, encoded = encoded.split(",", 1)
            mime_type = header.split(";")[0].replace("data:", "") or "image/jpeg"
        else:
            mime_type = "image/jpeg"

        image_bytes = base64.b64decode(encoded)
        image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)

        prompt = f"""
{system_prompt(language_name)}
Analyze the attached agricultural image.
Explain what crop or plant features are visible, visible symptoms, possible causes, and practical next steps.
Clearly say when the image is not sufficient for a reliable diagnosis.
User question: {request.question}
"""

        answer, model = generate_text(
            client,
            [prompt, image_part],
            types.GenerateContentConfig(
                system_instruction=system_prompt(language_name),
                temperature=0.1,
                max_output_tokens=450,
            ),
        )

        return {"answer": answer, "language": request.language, "model": model}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Image analysis temporarily unavailable: {exc}")
