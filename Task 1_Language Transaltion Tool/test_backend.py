"""
test_backend.py — Automated backend tests for Translify Translation API.
Run with: python test_backend.py  (server must be running on port 8000)
"""

import sys
import json
import urllib.request
import urllib.error

BASE = "http://127.0.0.1:8080"
PASS = "\033[92m✔\033[0m"
FAIL = "\033[91m✘\033[0m"


def get(path: str):
    with urllib.request.urlopen(f"{BASE}{path}", timeout=10) as r:
        return r.status, r.read(), r.headers


def post(path: str, body: dict):
    data = json.dumps(body).encode()
    req  = urllib.request.Request(
        f"{BASE}{path}", data=data,
        headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.status, r.read(), r.headers


results = []


def check(name, cond, detail=""):
    icon = PASS if cond else FAIL
    print(f"  {icon} {name}" + (f"  ({detail})" if detail else ""))
    results.append(cond)


print("\n══════════════════════════════════════════")
print("  Translify API Tests")
print("══════════════════════════════════════════\n")

# ── Test 1: Health check ─────────────────────────────────────────
print("1. Health Check  GET /")
try:
    status, body, _ = get("/")
    data = json.loads(body)
    check("Status 200", status == 200, f"got {status}")
    check("Status ok", data.get("status") == "ok")
except Exception as e:
    check("Server reachable", False, str(e))

# ── Test 2: GET /api/languages ────────────────────────────────────
print("\n2. Languages   GET /api/languages")
try:
    status, body, _ = get("/api/languages")
    langs = json.loads(body)
    check("Status 200", status == 200)
    check("Returns dict",  isinstance(langs, dict))
    check("Has >10 langs", len(langs) > 10, f"{len(langs)} languages")
    check("'en' present",  "en" in langs)
    check("'es' present",  "es" in langs)
    check("'hi' present",  "hi" in langs)
    check("Values are strings", all(isinstance(v, str) for v in langs.values()))
except Exception as e:
    check("Request succeeded", False, str(e))

# ── Test 3: POST /api/translate ───────────────────────────────────
print("\n3. Translation  POST /api/translate")
try:
    status, body, _ = post("/api/translate", {
        "text": "Hello", "source_lang": "en", "target_lang": "es"
    })
    data = json.loads(body)
    check("Status 200", status == 200)
    check("Has translated_text", "translated_text" in data)
    translated = data.get("translated_text", "")
    check("'Hola' or 'Hello' returned", "hola" in translated.lower() or "hello" in translated.lower(),
          f"got '{translated}'")
    print(f"     ↳ 'Hello' → '{translated}'")
except Exception as e:
    check("Request succeeded", False, str(e))

# ── Test 4: Translate auto-detect ────────────────────────────────
print("\n4. Auto-detect  POST /api/translate (auto source)")
try:
    status, body, _ = post("/api/translate", {
        "text": "Bonjour le monde", "source_lang": "auto", "target_lang": "en"
    })
    data = json.loads(body)
    check("Status 200", status == 200)
    translated = data.get("translated_text", "")
    check("Non-empty result", bool(translated), f"got '{translated}'")
    print(f"     ↳ 'Bonjour le monde' → '{translated}'")
except Exception as e:
    check("Request succeeded", False, str(e))

# ── Test 5: Empty text validation ────────────────────────────────
print("\n5. Validation   POST /api/translate (empty text)")
try:
    req  = urllib.request.Request(
        f"{BASE}/api/translate",
        data=json.dumps({"text": "  ", "source_lang": "en", "target_lang": "es"}).encode(),
        headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            check("Returns 4xx", r.status >= 400, f"got {r.status}")
    except urllib.error.HTTPError as e:
        check("Returns 4xx for empty text", e.code == 400, f"got {e.code}")
except Exception as e:
    check("Request succeeded", False, str(e))

# ── Test 6: GET /api/tts ─────────────────────────────────────────
print("\n6. TTS          GET /api/tts?text=Hello&lang=en")
try:
    status, body, headers = get("/api/tts?text=Hello&lang=en")
    ct = headers.get("Content-Type", "")
    check("Status 200", status == 200)
    check("Content-Type is audio/mpeg", "audio/mpeg" in ct, f"got '{ct}'")
    check("Body is non-empty", len(body) > 0, f"{len(body)} bytes")
    check("Body ≥ 1 KB (valid MP3)", len(body) >= 1024, f"{len(body)} bytes")
except Exception as e:
    check("Request succeeded", False, str(e))

# ── Summary ───────────────────────────────────────────────────────
passed = sum(results)
total  = len(results)
print(f"\n══════════════════════════════════════════")
print(f"  Results: {passed}/{total} checks passed")
print(f"══════════════════════════════════════════\n")

sys.exit(0 if passed == total else 1)
