# ============================================================
#  NexBot — NLP Processing Module
#  File: nlp_processor.py
#
#  Provides 5 NLP analysis functions used by the Flask backend.
#  Each function is wrapped in try/except so a failure in any
#  single NLP feature never crashes the main chat endpoint.
# ============================================================

import math
from collections import Counter

# ── Library Imports ──────────────────────────────────────────────
import nltk
import spacy
from textblob import TextBlob
from langdetect import detect_langs
from rake_nltk import Rake

# ── One-time Downloads / Model Loading ───────────────────────────
# NLTK data (downloaded at module load if missing)
for _resource in ['punkt_tab', 'stopwords', 'averaged_perceptron_tagger_eng']:
    try:
        nltk.data.find(f'tokenizers/{_resource}' if 'punkt' in _resource else f'{_resource}')
    except LookupError:
        nltk.download(_resource, quiet=True)

# spaCy English model
try:
    nlp = spacy.load("en_core_web_sm")
except OSError:
    print("[NLP] Downloading spaCy en_core_web_sm model...")
    from spacy.cli import download as spacy_download
    spacy_download("en_core_web_sm")
    nlp = spacy.load("en_core_web_sm")

print("[OK] NLP Processor loaded (NLTK, spaCy, TextBlob, langdetect, RAKE)")


# ── 1. Sentiment Analysis (TextBlob) ────────────────────────────
def analyze_sentiment(text: str) -> dict:
    """
    Returns sentiment label, polarity (-1.0 to 1.0), and
    subjectivity (0.0 = objective, 1.0 = subjective).
    """
    try:
        blob = TextBlob(text)
        polarity = round(blob.sentiment.polarity, 3)
        subjectivity = round(blob.sentiment.subjectivity, 3)

        if polarity > 0.1:
            label = "positive"
        elif polarity < -0.1:
            label = "negative"
        else:
            label = "neutral"

        return {
            "label": label,
            "polarity": polarity,
            "subjectivity": subjectivity
        }
    except Exception as e:
        print(f"[NLP] Sentiment error: {e}")
        return {"label": "neutral", "polarity": 0.0, "subjectivity": 0.0}


# ── 2. Named Entity Recognition (spaCy) ─────────────────────────
# Human-readable descriptions for spaCy entity types
_ENTITY_DESCRIPTIONS = {
    "PERSON":    "Person",
    "NORP":      "Group/Nationality",
    "FAC":       "Facility",
    "ORG":       "Organization",
    "GPE":       "Country/City/State",
    "LOC":       "Location",
    "PRODUCT":   "Product",
    "EVENT":     "Event",
    "WORK_OF_ART": "Creative Work",
    "LAW":       "Law/Document",
    "LANGUAGE":  "Language",
    "DATE":      "Date",
    "TIME":      "Time",
    "PERCENT":   "Percentage",
    "MONEY":     "Money",
    "QUANTITY":  "Quantity",
    "ORDINAL":   "Ordinal",
    "CARDINAL":  "Cardinal Number",
}


def extract_entities(text: str) -> list:
    """
    Returns a list of named entities:
    [{ "text": "Google", "label": "ORG", "description": "Organization" }, ...]
    """
    try:
        doc = nlp(text)
        entities = []
        seen = set()

        for ent in doc.ents:
            key = (ent.text.strip(), ent.label_)
            if key not in seen and ent.text.strip():
                seen.add(key)
                entities.append({
                    "text": ent.text.strip(),
                    "label": ent.label_,
                    "description": _ENTITY_DESCRIPTIONS.get(ent.label_, ent.label_)
                })

        return entities
    except Exception as e:
        print(f"[NLP] Entity extraction error: {e}")
        return []


# ── 3. Keyword Extraction (RAKE) ────────────────────────────────
def extract_keywords(text: str, top_n: int = 5) -> list:
    """
    Returns top-N ranked keyword phrases.
    """
    try:
        rake = Rake(
            min_length=1,
            max_length=3,
            include_repeated_phrases=False
        )
        rake.extract_keywords_from_text(text)
        ranked = rake.get_ranked_phrases()
        # Return up to top_n, filtering out very short single-char results
        keywords = [kw for kw in ranked if len(kw) > 1][:top_n]
        return keywords
    except Exception as e:
        print(f"[NLP] Keyword extraction error: {e}")
        return []


# ── 4. Language Detection (langdetect) ───────────────────────────
def detect_language(text: str) -> dict:
    """
    Returns the most likely language code and confidence.
    """
    try:
        if len(text.strip()) < 3:
            return {"language": "en", "confidence": 0.0}

        results = detect_langs(text)
        if results:
            best = results[0]
            return {
                "language": str(best.lang),
                "confidence": round(best.prob, 3)
            }
        return {"language": "unknown", "confidence": 0.0}
    except Exception as e:
        print(f"[NLP] Language detection error: {e}")
        return {"language": "unknown", "confidence": 0.0}


# ── 5. Extractive Text Summarization (NLTK + TF-IDF) ────────────
def summarize_text(text: str, num_sentences: int = 3) -> str:
    """
    Extracts the top N most important sentences from the text
    using TF-IDF-like scoring.
    """
    try:
        from nltk.tokenize import sent_tokenize, word_tokenize
        from nltk.corpus import stopwords

        sentences = sent_tokenize(text)
        if len(sentences) <= num_sentences:
            return text  # Already short enough

        stop_words = set(stopwords.words("english"))

        # Tokenize all words (lowered, no stopwords)
        words_per_sentence = []
        all_words = []
        for sent in sentences:
            words = [
                w.lower() for w in word_tokenize(sent)
                if w.isalnum() and w.lower() not in stop_words
            ]
            words_per_sentence.append(words)
            all_words.extend(words)

        # Term frequency across full document
        word_freq = Counter(all_words)
        if not word_freq:
            return sentences[0]

        max_freq = max(word_freq.values())
        for w in word_freq:
            word_freq[w] /= max_freq  # Normalize

        # Score each sentence by sum of its word frequencies
        sentence_scores = []
        for i, words in enumerate(words_per_sentence):
            score = sum(word_freq.get(w, 0) for w in words)
            # Slight boost for position (earlier sentences often more important)
            position_boost = 1.0 / (1.0 + math.log1p(i))
            sentence_scores.append((score * position_boost, i))

        # Pick top N sentences, keeping original order
        sentence_scores.sort(reverse=True)
        top_indices = sorted([idx for _, idx in sentence_scores[:num_sentences]])
        summary = " ".join(sentences[i] for i in top_indices)

        return summary
    except Exception as e:
        print(f"[NLP] Summarization error: {e}")
        return text[:500] if len(text) > 500 else text


# ── Convenience: Analyze a single message with all features ──────
def analyze_message(text: str) -> dict:
    """
    Run all NLP analyses on a single text. Returns a dict with
    sentiment, entities, keywords, and language.
    """
    return {
        "sentiment": analyze_sentiment(text),
        "entities": extract_entities(text),
        "keywords": extract_keywords(text),
        "language": detect_language(text)
    }


def analyze_bot_reply(text: str) -> dict:
    """
    Lighter analysis for bot replies (sentiment + keywords only).
    """
    return {
        "sentiment": analyze_sentiment(text),
        "keywords": extract_keywords(text)
    }
