# Translify — Language Translation Tool

Small web app: FastAPI backend (translation + TTS) and a static frontend.

Features
- REST API for translation (powered by deep-translator)
- Text-to-Speech via gTTS (returns MP3 stream)
- Static frontend (served from `/static/index.html`)
- Small test harness `test_backend.py` to validate the API

Quick start (Windows / PowerShell)

1. Activate the project's virtual environment

```powershell
& "c:/Users/rajve/OneDrive/desktop/Language tool/.venv/Scripts/Activate.ps1"
```

2. Install dependencies (if not already installed)

```powershell
pip install -r "c:/Users/rajve/OneDrive/Desktop/Language tool/requirements.txt"
```

3. Run the backend (uvicorn)

```powershell
python -m uvicorn main:app --host 127.0.0.1 --port 8080
```

4. Open the frontend in your browser

Navigate to: http://127.0.0.1:8080/static/index.html

API endpoints
- `GET /api/languages` — returns supported language codes and names
- `POST /api/translate` — JSON body: `{ "text": "...", "source_lang": "auto", "target_lang": "es" }`
- `GET /api/tts?text=Hello&lang=en` — returns `audio/mpeg` stream

Testing
- Run the simple test script (expects the backend running on port 8080):

```powershell
& "c:/Users/rajve/OneDrive/Desktop/Language tool/.venv/Scripts/python.exe" test_backend.py
```

- Or run `pytest` if you prefer (the project includes a small runner script):

```powershell
& "c:/Users/rajve/OneDrive/Desktop/Language tool/.venv/Scripts/python.exe" -m pytest -q
```

Notes
- The backend serves the static frontend at `/static` (so you don't need a separate static server).
- `requirements.txt` contains pinned versions that are known to work together.
- If port 8080 is already in use, either stop the process using it or change the `--port` value when starting uvicorn.

Want me to add a CI workflow to run the tests automatically? Open to add GitHub Actions if you'd like.