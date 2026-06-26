# NexBot — AI Chatbot with Flask Backend & NLP

NexBot is an AI chatbot that uses Groq for fast LLM responses and a custom Python Flask backend to keep API keys secure. It also features a full suite of **Natural Language Processing (NLP)** capabilities running locally on the server to analyze conversations in real-time.

## Features

*   **Groq LLM Integration**: Fast and smart conversational AI.
*   **Sentiment Analysis**: Detects user mood (positive/negative/neutral) using `TextBlob`.
*   **Named Entity Recognition (NER)**: Highlights people, places, organizations, and dates using `spaCy`.
*   **Keyword Extraction**: Extracts the main topics from messages using RAKE (`rake-nltk`).
*   **Language Detection**: Automatically identifies the language spoken using `langdetect`.
*   **Conversation Summarization**: Generates an extractive summary of the chat on demand using TF-IDF sentence scoring (`nltk`).

## Project Structure
```
nexbot-backend/
├── app.py             ← Flask backend (handles API calls and routing)
├── nlp_processor.py   ← NLP module (Sentiment, NER, Keywords, Summary, etc.)
├── index.html         ← Frontend chatbot UI
├── requirements.txt   ← Python dependencies
├── .env.example       ← Copy this to .env and add your API key
└── README.md          ← This file
```

## Setup Instructions (Step by Step)

### Step 1 — Get your GROQ API Key
1. Obtain your provider's API key (e.g., from the Groq console).
2. Copy the key and keep it secret.

### Step 2 — Install Python dependencies
```bash
pip install -r requirements.txt
```

*(Note: The application will automatically download the necessary NLP models like spaCy's `en_core_web_sm` and NLTK datasets on the first run. However, if you want to pre-download them manually, you can run: `python -m spacy download en_core_web_sm`)*

### Step 3 — Add your API key
```bash
# Copy the example file
cp .env.example .env

# Open .env and replace your key
# GROQ_API_KEY=your_groq_key_here
```

### Step 4 — Run the Flask backend
```bash
python app.py
```
You should see:
```
[OK] NLP Processor loaded (NLTK, spaCy, TextBlob, langdetect, RAKE)
[OK] NexBot backend running on http://localhost:5000
```

### Step 5 — Open the chatbot
Open `index.html` in your web browser.
The top status bar should show a green dot and say "Backend connected".

## How it Works
```
Browser (index.html)
    ↓  POST /api/message  (sends user message)
Flask Server (app.py)
    ↓  Calls upstream API (Groq) with secret key
Upstream API
    ↓  Returns AI response
Flask Server (nlp_processor.py)
    ↓  Runs NLP analysis on both the user message and the bot reply
Flask Server
    ↓  Sends bot reply + NLP metadata back to browser
Browser (index.html)
    ↑  Shows the bot's reply and renders NLP badges, keywords, and entity highlights
```

## Deploying Online (Free)
Use Render.com:
1. Push code to GitHub
2. Create account on render.com
3. New Web Service → connect your GitHub repo
4. Build command: `pip install -r requirements.txt && python -m spacy download en_core_web_sm`
5. Start command: `python app.py`
6. Add environment variable: `GROQ_API_KEY` = your_key
7. Deploy → get a public URL!
