/* ── 3.1 APPLICATION STATE ────────────────────────────────────── */

// Conversation history sent to the API for multi-turn memory
// Format: [{ role: 'user'|'assistant', content: string }, ...]
let conversationHistory = [];

// Active persona configuration
let currentPersona = {
  id:           'assistant',
  emoji:        '🤖',
  name:         'General Assistant',
  systemPrompt: 'You are a helpful, friendly AI assistant named NexBot. Give clear, accurate, concise answers.'
};

// Uploaded document (null if none)
let uploadedDocument = null;

// Voice input
let isRecording    = false;
let speechRecognition = null;

// Session statistics
let totalMessages  = 0;
let estimatedTokens = 0;


/* ── 3.2 PERSONA MANAGEMENT ───────────────────────────────────── */
function setPersona(id, emoji, name, systemPrompt) {
  currentPersona = { id, emoji, name, systemPrompt };
  document.querySelectorAll('.persona-btn').forEach(btn => btn.classList.remove('active'));
  const el = document.getElementById('persona-' + id);
  if (el) el.classList.add('active');
  document.getElementById('stat-persona').textContent = name.split(' ')[0];
  showToast('Persona: ' + name);
}


/* ── 3.3 FEATURE TOGGLES ─────────────────────────────────────── */
function toggleDocSection() {
  const isEnabled = document.getElementById('toggle-doc').checked;
  document.getElementById('doc-section').style.display = isEnabled ? 'block' : 'none';
  if (!isEnabled) removeDocument();
}

function isFeatureEnabled(toggleId) {
  const el = document.getElementById(toggleId);
  return el ? el.checked : false;
}


/* ── 3.4 FILE UPLOAD & DOCUMENT HANDLING ─────────────────────── */
function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = function(e) {
    uploadedDocument = {
      name:    file.name,
      content: e.target.result.slice(0, 8000)
    };

    const badge    = document.getElementById('doc-badge');
    const badgeName = document.getElementById('doc-badge-name');
    if (badgeName) badgeName.textContent = file.name;
    if (badge) badge.style.display = 'flex';

    showToast('Document loaded: ' + file.name);
  };

  reader.onerror = function() {
    showToast('Failed to read file. Please try a text-based file.', 'warn');
  };

  reader.readAsText(file);
}

function removeDocument() {
  uploadedDocument = null;
  const badge = document.getElementById('doc-badge');
  if (badge) badge.style.display = 'none';
  const input = document.getElementById('fileInput');
  if (input) input.value = '';
}


/* ── 3.5 VOICE INPUT (Speech-to-Text) ────────────────────────── */
function toggleVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast('Voice input requires Google Chrome. Please switch browsers!', 'warn');
    return;
  }

  if (isRecording) {
    speechRecognition.stop();
    return;
  }

  speechRecognition = new SpeechRecognition();
  speechRecognition.lang            = 'en-US';
  speechRecognition.continuous      = false;
  speechRecognition.interimResults  = true;

  speechRecognition.onstart = function() {
    isRecording = true;
    const micBtn = document.getElementById('mic-btn');
    if (micBtn) {
      micBtn.classList.add('icon-btn--active');
      micBtn.innerHTML = `
        <span class="voice-wave">
          <span class="wave-bar"></span><span class="wave-bar"></span>
          <span class="wave-bar"></span><span class="wave-bar"></span>
          <span class="wave-bar"></span>
        </span>`;
    }
  };

  speechRecognition.onresult = function(event) {
    const transcript = Array.from(event.results)
      .map(result => result[0].transcript)
      .join('');
    const input = document.getElementById('userInput');
    if (input) input.value = transcript;
    if (input) autoResizeTextarea(input);
  };

  speechRecognition.onend = function() {
    isRecording = false;
    const micBtn = document.getElementById('mic-btn');
    if (micBtn) {
      micBtn.classList.remove('icon-btn--active');
      micBtn.innerHTML = '🎤';
    }
  };

  speechRecognition.onerror = function(event) {
    showToast('Voice error: ' + event.error, 'warn');
    speechRecognition.stop();
  };

  speechRecognition.start();
}


/* ── 3.6 VOICE OUTPUT (Text-to-Speech) ───────────────────────── */
function speakText(text) {
  if (!isFeatureEnabled('toggle-voice') || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const cleanText = text.replace(/[`*#_>\[\]]/g, '').slice(0, 600);
  const utterance  = new SpeechSynthesisUtterance(cleanText);
  utterance.rate   = 1.0;
  utterance.pitch  = 1.0;
  utterance.volume = 0.9;

  const voices = window.speechSynthesis.getVoices();
  const preferredVoice = voices.find(v =>
    v.name.includes('Google') || v.name.includes('Samantha') || v.lang === 'en-US'
  );
  if (preferredVoice) utterance.voice = preferredVoice;

  window.speechSynthesis.speak(utterance);
}

if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = function() {};
}


/* ── 3.7 SEND MESSAGE & API CALL ─────────────────────────────── */
async function sendMessage() {
  const inputEl  = document.getElementById('userInput');
  const userText = inputEl ? inputEl.value.trim() : '';
  if (!userText) return;

  if (inputEl) inputEl.value = '';
  if (inputEl) autoResizeTextarea(inputEl);
  const sendBtn = document.getElementById('send-btn');
  if (sendBtn) sendBtn.disabled = true;

  const welcomeScreen = document.getElementById('welcome-screen');
  if (welcomeScreen) welcomeScreen.style.display = 'none';

  const activeFeatureTags = [];
  if (isFeatureEnabled('toggle-memory')) activeFeatureTags.push('mem');
  if (isFeatureEnabled('toggle-web'))    activeFeatureTags.push('web');
  if (uploadedDocument)                  activeFeatureTags.push('doc');
  if (isFeatureEnabled('toggle-voice'))  activeFeatureTags.push('voice');

  appendMessage('user', userText, activeFeatureTags);

  totalMessages++;
  const statMessages = document.getElementById('stat-messages');
  if (statMessages) statMessages.textContent = totalMessages;

  if (isFeatureEnabled('toggle-memory')) {
    conversationHistory.push({ role: 'user', content: userText });
    if (conversationHistory.length > 20) conversationHistory = conversationHistory.slice(-20);
  }
  updateMemoryDisplay();

  let systemPrompt = currentPersona.systemPrompt;
  if (isFeatureEnabled('toggle-web')) {
    systemPrompt += '\n\nYou have web browsing context awareness. ' +
      'When answering questions about recent events or current data, ' +
      'mention your knowledge cutoff and suggest where users can find ' +
      'the latest information online.';
  }
  if (uploadedDocument) {
    systemPrompt +=
      `\n\nThe user has uploaded a document: "${uploadedDocument.name}".\n` +
      `Here are its full contents:\n\n${uploadedDocument.content}\n\n` +
      `Use this document to answer questions when relevant.`;
  }

  const typingId = 'typing-' + Date.now();
  appendTypingIndicator(typingId);

  try {
    const messagesToSend = isFeatureEnabled('toggle-memory')
      ? conversationHistory
      : [{ role: 'user', content: userText }];

    // Send request to local backend which proxies to the configured upstream API (GROQ or other).
    // Backend injects the API key from environment and returns JSON { reply: 'text' }.
    const response = await fetch('http://127.0.0.1:5000/api/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:      'llama-3.3-70b-versatile',
        max_tokens: 1000,
        system:     systemPrompt,
        messages:   messagesToSend
      })
    });

    // Read response as text first to avoid uncaught JSON errors when body is empty
    const raw = await response.text();
    removeTypingIndicator(typingId);

    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch (err) {
      // If backend returned plain text (or HTML), treat it as the reply body
      data = { reply: raw };
    }

    let botReply = '';
    if (!response.ok) {
      // Backend returned non-2xx; prefer structured error if present
      if (data && data.error) botReply = `⚠️ API Error: ${typeof data.error === 'string' ? data.error : JSON.stringify(data.error)}`;
      else botReply = `⚠️ Backend error: ${raw || response.statusText}`;
    } else {
      if (data && data.reply) {
        botReply = data.reply;
      } else if (raw && raw.trim().length > 0) {
        // No JSON 'reply' field but non-empty body — show raw text
        botReply = raw;
      } else {
        botReply = '⚠️ Empty response from backend. Please check the server logs.';
      }
    }

    appendMessage('bot', botReply, activeFeatureTags);

    if (isFeatureEnabled('toggle-memory')) {
      conversationHistory.push({ role: 'assistant', content: botReply });
      if (conversationHistory.length > 20) conversationHistory = conversationHistory.slice(-20);
    }
    updateMemoryDisplay();

    estimatedTokens += Math.ceil((userText.length + botReply.length) / 4);
    const statTokens = document.getElementById('stat-tokens');
    if (statTokens) statTokens.textContent = estimatedTokens.toLocaleString();

    speakText(botReply);

  } catch (error) {
    removeTypingIndicator(typingId);
    appendMessage('bot',
      `⚠️ Connection error: ${error.message}.\n\nPlease check your internet connection and try again.`,
      []
    );
  }

  if (sendBtn) sendBtn.disabled = false;
  const inputFocus = document.getElementById('userInput');
  if (inputFocus) inputFocus.focus();
}

function sendQuick(text) {
  const input = document.getElementById('userInput');
  if (input) input.value = text;
  sendMessage();
}


/* ── 3.8 DOM HELPERS ──────────────────────────────────────────── */
function appendMessage(role, text, tags) {
  const messagesEl = document.getElementById('messages');
  if (!messagesEl) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = `msg msg--${role}`;

  const avatarDiv = document.createElement('div');
  avatarDiv.className = `avatar avatar--${role === 'bot' ? 'bot' : 'user'}`;
  avatarDiv.textContent = role === 'bot' ? currentPersona.emoji : '👤';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'msg__content';

  const bubbleDiv = document.createElement('div');
  bubbleDiv.className = 'bubble';
  bubbleDiv.innerHTML = formatMarkdown(text);

  const metaDiv = document.createElement('div');
  metaDiv.className = 'msg__meta';

  const timeEl = document.createElement('span');
  timeEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  metaDiv.appendChild(timeEl);

  if (role === 'bot') {
    const personaTag = document.createElement('span');
    personaTag.className = 'persona-tag';
    personaTag.textContent = currentPersona.name;
    metaDiv.appendChild(personaTag);
  }

  if (tags && tags.length > 0) {
    const tagsDiv = document.createElement('div');
    tagsDiv.className = 'feature-tags';

    const tagLabels = {
      mem:   '🧠 Memory',
      doc:   '📄 Doc',
      web:   '🔍 Web',
      voice: '🔊 Voice'
    };

    tags.forEach(tag => {
      const tagEl = document.createElement('span');
      tagEl.className = `ftag ftag--${tag}`;
      tagEl.textContent = tagLabels[tag] || tag;
      tagsDiv.appendChild(tagEl);
    });

    metaDiv.appendChild(tagsDiv);
  }

  contentDiv.appendChild(bubbleDiv);
  contentDiv.appendChild(metaDiv);
  msgDiv.appendChild(avatarDiv);
  msgDiv.appendChild(contentDiv);
  messagesEl.appendChild(msgDiv);

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function appendTypingIndicator(id) {
  const messagesEl = document.getElementById('messages');
  if (!messagesEl) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = 'msg msg--bot msg--typing';
  msgDiv.id = id;
  msgDiv.innerHTML = `
    <div class="avatar avatar--bot">${currentPersona.emoji}</div>
    <div class="msg__content">
      <div class="bubble">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>`;

  messagesEl.appendChild(msgDiv);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function removeTypingIndicator(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function updateMemoryDisplay() {
  const memEl    = document.getElementById('memory-display');
  const countEl  = document.getElementById('memory-count');
  if (!memEl || !countEl) return;

  if (conversationHistory.length === 0) {
    memEl.textContent = 'No messages yet.';
    countEl.textContent = '0 / 20 turns stored';
    return;
  }

  const recentTurns = conversationHistory.slice(-4);
  memEl.innerHTML = recentTurns.map(turn => {
    const isUser   = turn.role === 'user';
    const label    = isUser ? 'You' : 'Bot';
    const colorCls = isUser ? 'memory-list__entry--user' : 'memory-list__entry--bot';
    const preview  = turn.content.slice(0, 45) + (turn.content.length > 45 ? '…' : '');
    return `<div class="memory-list__entry ${colorCls}"><strong>${label}:</strong> ${preview}</div>`;
  }).join('');

  countEl.textContent = `${conversationHistory.length} / 20 turns stored`;
}


/* ── 3.9 TEXT FORMATTING (Markdown → HTML) ────────────────────── */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMarkdown(text) {
  text = text.replace(/```(\w+)?\n?([\s\S]*?)```/g, function(_, lang, code) {
    const langLabel = lang ? `<span style="color:var(--muted);font-size:10px;">${lang}</span><br/>` : '';
    return `<pre>${langLabel}<code>${escapeHtml(code.trim())}</code></pre>`;
  });

  text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  text = text.replace(/_([^_\n]+)_/g, '<em>$1</em>');
  text = text.replace(/^#{1,3} (.+)$/gm,
    '<p><strong style="font-size:14px;color:var(--accent2);">$1</strong></p>');
  text = text.replace(/^[\-\*•] (.+)$/gm, '<li>$1</li>');
  text = text.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
  text = text.replace(/\n\n+/g, '</p><p>');
  text = text.replace(/\n/g, '<br/>');
  return `<p>${text}</p>`;
}


/* ── 3.10 UI HELPERS ──────────────────────────────────────────── */
function handleKeyDown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function clearChat() {
  conversationHistory = [];
  totalMessages       = 0;
  estimatedTokens     = 0;

  const messagesEl = document.getElementById('messages');
  if (messagesEl) {
    messagesEl.innerHTML = `
      <div class="welcome" id="welcome-screen">
        <div class="welcome__emoji">🤖</div>
        <h2 class="welcome__title">Chat cleared!</h2>
        <p class="welcome__subtitle">Start fresh. Type a message or pick a prompt below.</p>
        <div class="welcome__chips">
          <button class="quick-chip" onclick="sendQuick('Explain what NLP is in simple terms')">🧠 What is NLP?</button>
          <button class="quick-chip" onclick="sendQuick('Write Python code for a simple chatbot')">💻 Chatbot code</button>
          <button class="quick-chip" onclick="sendQuick('What is LangChain and how do I use it?')">⛓ LangChain guide</button>
        </div>
      </div>`;
  }

  const statMessages = document.getElementById('stat-messages');
  if (statMessages) statMessages.textContent = '0';
  const statTokens = document.getElementById('stat-tokens');
  if (statTokens) statTokens.textContent = '0';
  updateMemoryDisplay();
}

function showToast(message, type = 'info') {
  const existingToast = document.querySelector('.toast');
  if (existingToast) existingToast.remove();

  const toast = document.createElement('div');
  toast.className = `toast${type === 'warn' ? ' toast--warn' : ''}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => { toast.style.opacity = '1'; });

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}
