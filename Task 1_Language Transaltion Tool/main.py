"""
Translify Language Translation Tool - FastAPI Backend
Supports multi-language translation via deep-translator and TTS via gTTS.
"""

import io
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from deep_translator import GoogleTranslator
from gtts import gTTS

app = FastAPI(
    title="Language Translation API",
    description="Free translation API powered by deep-translator & gTTS",
    version="1.0.0",
)

# Allow frontend (served from file:// or a dev server) to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve the frontend static files at the root "/"
app.mount("/static", StaticFiles(directory="."), name="static")


# ──────────────────────────────────────────────
# Supported languages (subset of GoogleTranslator's full list)
# ──────────────────────────────────────────────
SUPPORTED_LANGUAGES: dict[str, str] = {
    "af": "Afrikaans",
    "sq": "Albanian",
    "ar": "Arabic",
    "hy": "Armenian",
    "az": "Azerbaijani",
    "eu": "Basque",
    "be": "Belarusian",
    "bn": "Bengali",
    "bs": "Bosnian",
    "bg": "Bulgarian",
    "ca": "Catalan",
    "zh-CN": "Chinese (Simplified)",
    "zh-TW": "Chinese (Traditional)",
    "hr": "Croatian",
    "cs": "Czech",
    "da": "Danish",
    "nl": "Dutch",
    "en": "English",
    "eo": "Esperanto",
    "et": "Estonian",
    "fi": "Finnish",
    "fr": "French",
    "gl": "Galician",
    "ka": "Georgian",
    "de": "German",
    "el": "Greek",
    "gu": "Gujarati",
    "ht": "Haitian Creole",
    "he": "Hebrew",
    "hi": "Hindi",
    "hu": "Hungarian",
    "is": "Icelandic",
    "id": "Indonesian",
    "ga": "Irish",
    "it": "Italian",
    "ja": "Japanese",
    "kn": "Kannada",
    "kk": "Kazakh",
    "ko": "Korean",
    "lv": "Latvian",
    "lt": "Lithuanian",
    "mk": "Macedonian",
    "ms": "Malay",
    "ml": "Malayalam",
    "mt": "Maltese",
    "mr": "Marathi",
    "mn": "Mongolian",
    "ne": "Nepali",
    "no": "Norwegian",
    "fa": "Persian",
    "pl": "Polish",
    "pt": "Portuguese",
    "pa": "Punjabi",
    "ro": "Romanian",
    "ru": "Russian",
    "sr": "Serbian",
    "si": "Sinhala",
    "sk": "Slovak",
    "sl": "Slovenian",
    "es": "Spanish",
    "sw": "Swahili",
    "sv": "Swedish",
    "tl": "Filipino (Tagalog)",
    "ta": "Tamil",
    "te": "Telugu",
    "th": "Thai",
    "tr": "Turkish",
    "uk": "Ukrainian",
    "ur": "Urdu",
    "uz": "Uzbek",
    "vi": "Vietnamese",
    "cy": "Welsh",
    "yi": "Yiddish",
    "zu": "Zulu",
}

# ──────────────────────────────────────────────
# Request / Response Models
# ──────────────────────────────────────────────

class TranslateRequest(BaseModel):
    text: str
    source_lang: str = "auto"
    target_lang: str = "es"


class TranslateResponse(BaseModel):
    translated_text: str
    source_lang: str
    target_lang: str
    detected_lang: str | None = None


# ──────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────

@app.get("/api/languages", summary="Get supported languages")
def get_languages() -> dict[str, str]:
    """Returns a dict of language_code → language_name."""
    return SUPPORTED_LANGUAGES


@app.post("/api/translate", response_model=TranslateResponse, summary="Translate text")
def translate_text(req: TranslateRequest) -> TranslateResponse:
    """
    Translates the given text from source_lang to target_lang.
    Use 'auto' for source_lang to auto-detect the source language.
    """
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Input text cannot be empty.")

    valid_codes = set(SUPPORTED_LANGUAGES.keys()) | {"auto"}
    if req.source_lang not in valid_codes:
        raise HTTPException(status_code=400, detail=f"Unsupported source language: {req.source_lang}")
    if req.target_lang not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail=f"Unsupported target language: {req.target_lang}")

    try:
        translator = GoogleTranslator(source=req.source_lang, target=req.target_lang)
        translated = translator.translate(req.text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Translation service error: {exc}")

    return TranslateResponse(
        translated_text=translated,
        source_lang=req.source_lang,
        target_lang=req.target_lang,
    )


@app.get("/api/tts", summary="Text-to-Speech audio")
def text_to_speech(text: str, lang: str = "en"):
    """
    Returns an MP3 audio stream of the given text spoken in the specified language.
    """
    if not text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    # Map some language codes gTTS may not accept directly
    gtts_lang_map = {"zh-CN": "zh", "zh-TW": "zh-TW", "tl": "tl"}
    gtts_lang = gtts_lang_map.get(lang, lang)

    try:
        tts = gTTS(text=text, lang=gtts_lang, slow=False)
        audio_buffer = io.BytesIO()
        tts.write_to_fp(audio_buffer)
        audio_buffer.seek(0)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"TTS service error: {exc}")

    return StreamingResponse(
        audio_buffer,
        media_type="audio/mpeg",
        headers={"Content-Disposition": "inline; filename=speech.mp3"},
    )


@app.get("/", include_in_schema=False)
def root():
    """Health check / root."""
    return {"status": "ok", "message": "Language Translation API is running. Visit /docs for API docs."}
