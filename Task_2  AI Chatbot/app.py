# ============================================================
#  NexBot — Python Flask Backend (with NLP)
#  File: app.py
#
#  HOW IT WORKS:
#  1. Browser sends user message to THIS server (not the upstream API)
#  2. THIS server adds your secret API key and calls the upstream API (GROQ or other)
#  3. Upstream replies to THIS server
#  4. THIS server runs NLP analysis on both user message and bot reply
#  5. THIS server sends the reply + NLP metadata back to the browser
#
#  WHY: API key stays SECRET on the server. Browser never sees it.
# ============================================================

from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from groq import Groq
import os

# ── Import NLP functions ─────────────────────────────────────────
from nlp_processor import (
    analyze_message,
    analyze_bot_reply,
    summarize_text
)

load_dotenv()

print("Current directory:", os.getcwd())
print("Env file loaded key:", os.getenv("GROQ_API_KEY"))

app = Flask(__name__)
CORS(app)

api_key = os.getenv("GROQ_API_KEY")

if not api_key:
    print("[ERROR] GROQ_API_KEY not found")
    client = None
else:
    print("[OK] GROQ API Key Loaded")
    client = Groq(api_key=api_key)

@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "status": "NexBot backend is running"
    })


@app.route("/api/message", methods=["POST"])
def chat():

    try:
        if not client:
            raise Exception("Groq client is not initialized. Please ensure your GROQ_API_KEY is correctly set in your .env file.")

        data = request.get_json() or {}

        messages = data.get("messages", [])
        system = data.get("system", "")
        web_context = data.get("web_context", False)
        document_content = data.get("document", None)
        document_name = data.get("document_name", None)

        if web_context:
            system += ('\n\nYou have web browsing context awareness. '
                       'When answering questions about recent events or current data, '
                       'mention your knowledge cutoff and suggest where users can find '
                       'the latest information online.')

        if document_content:
            system += (f'\n\nThe user has uploaded a document: "{document_name}".\n'
                       f'Here are its full contents:\n\n{document_content}\n\n'
                       f'Use this document to answer questions when relevant.')

        groq_messages = []

        if system:
            groq_messages.append({
                "role": "system",
                "content": system
            })

        groq_messages.extend(messages)

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=groq_messages,
            temperature=0.7,
            max_tokens=1000
        )

        reply = response.choices[0].message.content
        tokens_used = response.usage.total_tokens if response.usage else 0

        # ── NLP Analysis ─────────────────────────────────────────
        # Get the user's latest message text for NLP processing
        user_text = ""
        if messages:
            last_msg = messages[-1]
            if isinstance(last_msg, dict):
                user_text = last_msg.get("content", "")

        # Run full NLP analysis on user message
        user_nlp = analyze_message(user_text) if user_text else {}

        # Run lighter NLP analysis on bot reply
        bot_nlp = analyze_bot_reply(reply) if reply else {}

        return jsonify({
            "reply": reply,
            "tokens_used": tokens_used,
            "nlp": {
                "user": user_nlp,
                "bot": bot_nlp
            }
        })

    except Exception as e:
        print("ERROR:", str(e))
        return jsonify({
            "error": str(e)
        }), 500


# ── New Endpoint: Conversation Summarization ─────────────────────
@app.route("/api/summarize", methods=["POST"])
def summarize():
    """
    Accepts the full conversation history and returns an
    extractive NLP summary (using NLTK TF-IDF sentence scoring).
    """
    try:
        data = request.get_json() or {}
        messages = data.get("messages", [])

        if not messages:
            return jsonify({"summary": "No conversation to summarize."})

        # Combine all message contents into one text block
        full_text = "\n".join(
            msg.get("content", "") for msg in messages
            if isinstance(msg, dict) and msg.get("content")
        )

        if not full_text.strip():
            return jsonify({"summary": "No text content to summarize."})

        summary = summarize_text(full_text, num_sentences=4)

        return jsonify({
            "summary": summary
        })

    except Exception as e:
        print("SUMMARIZE ERROR:", str(e))
        return jsonify({
            "error": str(e)
        }), 500


if __name__ == "__main__":
    print("[OK] NexBot backend running on http://localhost:5000")
    app.run(host="0.0.0.0", port=5000, debug=True)