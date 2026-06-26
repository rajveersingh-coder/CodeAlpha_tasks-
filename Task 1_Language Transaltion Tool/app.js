/**
 * Translify — Frontend Application Logic
 * Handles: language population, translation, TTS, clipboard, history
 */

const API_BASE = "http://127.0.0.1:8080";

// ── DOM references ────────────────────────────────────────────────
const sourceLangSelect  = document.getElementById("sourceLangSelect");
const targetLangSelect  = document.getElementById("targetLangSelect");
const sourceText        = document.getElementById("sourceText");
const translatedText    = document.getElementById("translatedText");
const translateBtn      = document.getElementById("translateBtn");
const swapBtn           = document.getElementById("swapBtn");
const clearBtn          = document.getElementById("clearBtn");
const copyBtn           = document.getElementById("copyBtn");
const listenSourceBtn   = document.getElementById("listenSourceBtn");
const listenOutputBtn   = document.getElementById("listenOutputBtn");
const charCounter       = document.getElementById("charCounter");
const loadingSpinner    = document.getElementById("loadingSpinner");
const themeToggleBtn    = document.getElementById("themeToggleBtn");
const historyToggleBtn  = document.getElementById("historyToggleBtn");
const historyPanel      = document.getElementById("historyPanel");
const historyList       = document.getElementById("historyList");
const historyBadge      = document.getElementById("historyBadge");
const clearHistoryBtn   = document.getElementById("clearHistoryBtn");
const toast             = document.getElementById("toast");
const outputPanel       = document.getElementById("outputPanel");

// ── State ─────────────────────────────────────────────────────────
let currentTranslation  = "";
let currentAudio        = null;       // HTMLAudioElement for TTS
let speakingBtn         = null;       // Which button is "speaking"
let toastTimer          = null;

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Show a toast notification.
 * @param {string} message
 * @param {"" | "success" | "error"} type
 * @param {number} durationMs
 */
function showToast(message, type = "", durationMs = 3000) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className   = `toast show${type ? " " + type : ""}`;
  toastTimer = setTimeout(() => { toast.className = "toast hidden"; }, durationMs);
}

/** Format timestamp for history items */
function formatTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) +
    " · " + d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// ── Theme Toggle ──────────────────────────────────────────────────
const THEME_KEY = "translify-theme";

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const icon = themeToggleBtn.querySelector(".theme-icon");
  icon.textContent = theme === "dark" ? "🌙" : "☀️";
  localStorage.setItem(THEME_KEY, theme);
}

themeToggleBtn.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  applyTheme(current === "dark" ? "light" : "dark");
});

// Load saved theme
applyTheme(localStorage.getItem(THEME_KEY) || "dark");

// ── Language Population ───────────────────────────────────────────
async function loadLanguages() {
  try {
    const res  = await fetch(`${API_BASE}/api/languages`);
    if (!res.ok) throw new Error("Failed to load languages");
    const langs = await res.json(); // { code: name, … }

    const sorted = Object.entries(langs).sort(([,a],[,b]) => a.localeCompare(b));

    // Target select (no "auto")
    targetLangSelect.innerHTML = "";
    for (const [code, name] of sorted) {
      const opt     = document.createElement("option");
      opt.value     = code;
      opt.textContent = name;
      if (code === "es") opt.selected = true;
      targetLangSelect.appendChild(opt);
    }

    // Source select — prepend "auto"
    // Keep the existing "auto" option, then add all langs
    for (const [code, name] of sorted) {
      const opt     = document.createElement("option");
      opt.value     = code;
      opt.textContent = name;
      if (code === "en") opt.selected = true;
      sourceLangSelect.appendChild(opt);
    }

  } catch (err) {
    showToast("⚠️ Could not connect to backend. Is the server running?", "error", 6000);
    console.error(err);
  }
}

// ── Character counter ─────────────────────────────────────────────
function updateCharCounter() {
  const len   = sourceText.value.length;
  const max   = 5000;
  charCounter.textContent = `${len} / ${max}`;
  charCounter.className   = "char-counter" +
    (len > max * 0.9 ? (len >= max ? " over" : " warn") : "");
}

sourceText.addEventListener("input", updateCharCounter);

// ── Translation ───────────────────────────────────────────────────
async function translate() {
  const text   = sourceText.value.trim();
  const src    = sourceLangSelect.value;
  const tgt    = targetLangSelect.value;

  if (!text) {
    showToast("Please enter some text to translate.", "error");
    sourceText.focus();
    return;
  }

  // UI — loading state
  translateBtn.disabled = true;
  loadingSpinner.classList.remove("hidden");
  outputPanel.classList.add("translating");
  translatedText.innerHTML = `<span class="output-placeholder">Translating…</span>`;
  copyBtn.disabled        = true;
  listenOutputBtn.disabled = true;
  currentTranslation      = "";

  try {
    const res = await fetch(`${API_BASE}/api/translate`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ text, source_lang: src, target_lang: tgt }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Unknown error" }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }

    const data         = await res.json();
    currentTranslation = data.translated_text;
    translatedText.textContent = currentTranslation;
    copyBtn.disabled        = false;
    listenOutputBtn.disabled = false;

    // Save to history
    saveHistory({ text, translation: currentTranslation, src, tgt, time: new Date().toISOString() });

  } catch (err) {
    translatedText.innerHTML = `<span class="output-placeholder" style="color:var(--rose)">Translation failed: ${err.message}</span>`;
    showToast(`❌ ${err.message}`, "error", 5000);
  } finally {
    translateBtn.disabled = false;
    loadingSpinner.classList.add("hidden");
    outputPanel.classList.remove("translating");
  }
}

translateBtn.addEventListener("click", translate);

// Translate on Ctrl+Enter
sourceText.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    translate();
  }
});

// ── Swap Languages ────────────────────────────────────────────────
swapBtn.addEventListener("click", () => {
  const srcVal = sourceLangSelect.value;
  const tgtVal = targetLangSelect.value;

  // Can't swap if source is "auto"
  if (srcVal === "auto") {
    showToast("Set a specific source language before swapping.", "");
    return;
  }

  // Find matching option in source for target's value
  const srcOption = [...sourceLangSelect.options].find(o => o.value === tgtVal);
  const tgtOption = [...targetLangSelect.options].find(o => o.value === srcVal);

  if (srcOption) srcOption.selected = true;
  if (tgtOption) tgtOption.selected = true;

  // Also swap text areas
  const srcText = sourceText.value;
  sourceText.value = currentTranslation || translatedText.textContent.replace("Your translation will appear here…", "");
  updateCharCounter();

  if (srcText) {
    translatedText.textContent = srcText;
    copyBtn.disabled           = false;
    listenOutputBtn.disabled   = false;
    currentTranslation         = srcText;
  } else {
    translatedText.innerHTML   = `<span class="output-placeholder">Your translation will appear here…</span>`;
    copyBtn.disabled           = true;
    listenOutputBtn.disabled   = true;
    currentTranslation         = "";
  }
});

// ── Clear ─────────────────────────────────────────────────────────
clearBtn.addEventListener("click", () => {
  sourceText.value           = "";
  translatedText.innerHTML   = `<span class="output-placeholder">Your translation will appear here…</span>`;
  copyBtn.disabled           = true;
  listenOutputBtn.disabled   = true;
  currentTranslation         = "";
  updateCharCounter();
  sourceText.focus();
});

// ── Copy ──────────────────────────────────────────────────────────
copyBtn.addEventListener("click", async () => {
  if (!currentTranslation) return;
  try {
    await navigator.clipboard.writeText(currentTranslation);
    const origHTML = copyBtn.innerHTML;
    copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
    copyBtn.style.color       = "#10b981";
    copyBtn.style.borderColor = "#10b981";
    showToast("✅ Copied to clipboard!", "success");
    setTimeout(() => {
      copyBtn.innerHTML         = origHTML;
      copyBtn.style.color       = "";
      copyBtn.style.borderColor = "";
    }, 2000);
  } catch {
    showToast("❌ Clipboard access denied.", "error");
  }
});

// ── Text-to-Speech ────────────────────────────────────────────────
function stopAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (speakingBtn) {
    speakingBtn.classList.remove("btn--speaking");
    speakingBtn = null;
  }
}

async function playTTS(text, lang, btn) {
  if (!text.trim()) { showToast("Nothing to listen to.", ""); return; }

  // If already speaking this button, stop.
  if (speakingBtn === btn) { stopAudio(); return; }

  stopAudio();

  btn.classList.add("btn--speaking");
  speakingBtn = btn;

  try {
    const url  = `${API_BASE}/api/tts?` + new URLSearchParams({ text, lang });
    const audio = new Audio(url);
    currentAudio = audio;

    audio.addEventListener("ended",  stopAudio);
    audio.addEventListener("error",  () => {
      stopAudio();
      showToast("❌ TTS failed. Is the server running?", "error");
    });

    await audio.play();
  } catch (err) {
    stopAudio();
    showToast(`❌ TTS error: ${err.message}`, "error");
  }
}

listenSourceBtn.addEventListener("click", () => {
  const lang = sourceLangSelect.value === "auto" ? "en" : sourceLangSelect.value;
  playTTS(sourceText.value.trim(), lang, listenSourceBtn);
});

listenOutputBtn.addEventListener("click", () => {
  playTTS(currentTranslation, targetLangSelect.value, listenOutputBtn);
});

// ── History ───────────────────────────────────────────────────────
const HISTORY_KEY = "translify-history";
const MAX_HISTORY = 50;

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); }
  catch { return []; }
}

function saveHistory(entry) {
  const history = [entry, ...getHistory()].slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  renderHistory(history);
}

function getLangName(code) {
  const opt = [...targetLangSelect.options, ...sourceLangSelect.options].find(o => o.value === code);
  return opt ? opt.textContent : code.toUpperCase();
}

function renderHistory(history) {
  // Update badge
  if (history.length > 0) {
    historyBadge.textContent = history.length > 99 ? "99+" : history.length;
    historyBadge.classList.remove("hidden");
  } else {
    historyBadge.classList.add("hidden");
  }

  if (history.length === 0) {
    historyList.innerHTML = `
      <div class="history-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg>
        <p>No translations yet. Translate something to start building your history!</p>
      </div>`;
    return;
  }

  historyList.innerHTML = history.map((item, i) => `
    <div class="history-item" role="button" tabindex="0" aria-label="Restore translation" data-index="${i}">
      <div class="history-item__langs">
        ${item.src === "auto" ? "Auto" : getLangName(item.src)}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        ${getLangName(item.tgt)}
      </div>
      <div class="history-item__source">${escapeHTML(item.text)}</div>
      <div class="history-item__target">${escapeHTML(item.translation)}</div>
      <div class="history-item__time">${formatTime(item.time)}</div>
    </div>
  `).join("");

  // Restore on click
  historyList.querySelectorAll(".history-item").forEach(el => {
    el.addEventListener("click", () => restoreFromHistory(+el.dataset.index));
    el.addEventListener("keydown", e => { if (e.key === "Enter") restoreFromHistory(+el.dataset.index); });
  });
}

function restoreFromHistory(index) {
  const history = getHistory();
  const item    = history[index];
  if (!item) return;

  sourceText.value     = item.text;
  currentTranslation   = item.translation;
  translatedText.textContent = item.translation;
  copyBtn.disabled         = false;
  listenOutputBtn.disabled = false;
  updateCharCounter();

  // Set language selectors
  const srcOpt = [...sourceLangSelect.options].find(o => o.value === item.src);
  if (srcOpt) srcOpt.selected = true;
  const tgtOpt = [...targetLangSelect.options].find(o => o.value === item.tgt);
  if (tgtOpt) tgtOpt.selected = true;

  showToast("✅ Translation restored from history.", "success");

  // Close history panel on mobile
  if (window.innerWidth <= 768) historyPanel.classList.add("hidden");
}

function escapeHTML(str) {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// History panel toggle
historyToggleBtn.addEventListener("click", () => {
  historyPanel.classList.toggle("hidden");
});

// Clear history
clearHistoryBtn.addEventListener("click", () => {
  if (!confirm("Clear all translation history?")) return;
  localStorage.removeItem(HISTORY_KEY);
  renderHistory([]);
  showToast("History cleared.", "");
});

// ── Init ──────────────────────────────────────────────────────────
async function init() {
  await loadLanguages();
  renderHistory(getHistory());
  updateCharCounter();
}

init();
