// API endpoints
const BASE = 'https://speechster.vercel.app';
const SPEECHMA = 'https://speechma.com/com.api/tts-api.php';
const MAX_CHUNK = 950;

let voices = [];
let selectedVoice = null;
let audioURL = null;

// ========== THEMES ==========
const THEMES = [
  {k:'violet', l:'Violet'},{k:'dark',l:'Obsidian'},{k:'ember',l:'Ember'},
  {k:'jade',l:'Jade'},{k:'rose',l:'Rose'},{k:'gold',l:'Gold'}
];
let themeIdx = 0;

window.cycleTheme = function() {
  themeIdx = (themeIdx + 1) % THEMES.length;
  document.body.setAttribute('data-theme', THEMES[themeIdx].k);
  document.getElementById('theme-lbl').textContent = THEMES[themeIdx].l;
  localStorage.setItem('ss-theme', themeIdx);
};

(function initTheme() {
  try {
    let saved = parseInt(localStorage.getItem('ss-theme'));
    if (!isNaN(saved) && saved >= 0 && saved < THEMES.length) {
      themeIdx = saved;
      document.body.setAttribute('data-theme', THEMES[themeIdx].k);
      document.getElementById('theme-lbl').textContent = THEMES[themeIdx].l;
    }
  } catch(e) {}
})();

// ========== VOICE LOADING ==========
async function loadVoices() {
  try {
    const res = await fetch(BASE + '/api/voices');
    const data = await res.json();
    voices = data.voices || [];
    renderVoices(voices);
  } catch(e) {
    document.getElementById('vlist').innerHTML = '<div style="text-align:center;padding:2rem;color:var(--red);font-size:0.75rem;">⚠️ Failed to load voice library</div>';
  }
}

function renderVoices(list) {
  const container = document.getElementById('vlist');
  if (!list.length) { container.innerHTML = '<div style="padding:1.5rem;text-align:center;color:var(--muted);">No voices match</div>'; return; }
  const groups = {};
  list.forEach(v => { if (!groups[v.language]) groups[v.language] = []; groups[v.language].push(v); });
  let html = '';
  for (let lang of Object.keys(groups)) {
    html += `<div class="vgrp">${lang}</div>`;
    groups[lang].forEach(v => {
      const isSelected = selectedVoice && selectedVoice.index === v.index;
      const avatarClass = v.gender === 'Male' ? 'av-m' : 'av-f';
      const initials = v.name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase().slice(0,2);
      html += `<div class="vitem ${isSelected ? 'sel' : ''}" onclick="selectVoice(${v.index})">
        <span class="vnum">${v.index}</span>
        <div class="vav ${avatarClass}">${initials}</div>
        <div class="vinfo"><div class="vname">${escapeHtml(v.name)}</div><div class="vmeta">${v.gender} · ${escapeHtml(v.country)}</div></div>
        <span class="vchk">✓</span>
      </div>`;
    });
  }
  container.innerHTML = html;
}

window.filterVoices = function() {
  const query = document.getElementById('vsearch').value.toLowerCase();
  if (!query) renderVoices(voices);
  else renderVoices(voices.filter(v => v.name.toLowerCase().includes(query) || v.language.toLowerCase().includes(query) || v.country.toLowerCase().includes(query) || String(v.index).includes(query)));
};

window.selectVoice = function(idx) {
  selectedVoice = voices.find(v => v.index === idx);
  const disp = document.getElementById('sel-disp');
  if (selectedVoice) {
    disp.className = 'sel-disp';
    disp.textContent = `🎤 #${selectedVoice.index} · ${selectedVoice.name} · ${selectedVoice.gender}`;
  } else {
    disp.className = 'sel-disp empty';
    disp.textContent = '🎤 No voice selected';
  }
  filterVoices(); // refresh highlight
};

window.updateCount = function() {
  const len = document.getElementById('text-input').value.length;
  const el = document.getElementById('char-ctr');
  el.textContent = len.toLocaleString();
  el.className = 'char-ctr' + (len > 10000 ? ' over' : (len > 6000 ? ' warn' : ''));
};

function splitText(text, maxLen) {
  let clean = text.replace(/[*_`~><^#|\\]/g, '').replace(/\s+/g, ' ').trim();
  const chunks = [];
  while (clean.length > 0) {
    if (clean.length <= maxLen) { chunks.push(clean); break; }
    let splitAt = clean.lastIndexOf('. ', maxLen);
    if (splitAt === -1) splitAt = clean.lastIndexOf('! ', maxLen);
    if (splitAt === -1) splitAt = clean.lastIndexOf('? ', maxLen);
    if (splitAt === -1) splitAt = clean.lastIndexOf('; ', maxLen);
    if (splitAt === -1) splitAt = clean.lastIndexOf(', ', maxLen);
    if (splitAt === -1) splitAt = clean.lastIndexOf(' ', maxLen);
    if (splitAt === -1) splitAt = maxLen;
    chunks.push(clean.substring(0, splitAt + 1).trim());
    clean = clean.substring(splitAt + 1).trim();
  }
  return chunks;
}

function getVoiceId(voiceIndex) {
  const v = voices.find(x => x.index === voiceIndex);
  return v ? v.id : null;
}

async function fetchChunkDirect(voiceId, text) {
  const res = await fetch(SPEECHMA, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': 'https://speechma.com', 'Referer': 'https://speechma.com/english' },
    body: JSON.stringify({ text, voice: voiceId, pitch: 0, rate: 0 })
  });
  if (!res.ok) throw new Error('direct-http');
  const blob = await res.blob();
  if (blob.size < 80) throw new Error('tiny blob');
  return blob;
}

async function fetchChunkProxy(voiceIndex, text) {
  const res = await fetch(BASE + '/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voiceIndex, text })
  });
  if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.error || `proxy ${res.status}`); }
  return res.blob();
}

async function parallelFetch(chunks, voiceIndex, onProgress) {
  const voiceId = getVoiceId(voiceIndex);
  const pips = document.getElementById('chunk-grid').children;
  for (let i=0; i<pips.length; i++) pips[i].className = 'chunk-pip active';

  const promises = chunks.map(async (text, idx) => {
    try {
      let blob;
      try { blob = await fetchChunkDirect(voiceId, text); } catch(e) { blob = await fetchChunkProxy(voiceIndex, text); }
      if (pips[idx]) pips[idx].className = 'chunk-pip done';
      onProgress();
      return { idx, blob };
    } catch(err) {
      if (pips[idx]) pips[idx].className = 'chunk-pip error';
      throw new Error(`chunk ${idx+1}: ${err.message}`);
    }
  });
  const settled = await Promise.allSettled(promises);
  const results = new Array(chunks.length);
  let anySuccess = false;
  for (const s of settled) {
    if (s.status === 'fulfilled') { results[s.value.idx] = s.value.blob; anySuccess = true; }
  }
  if (!anySuccess) throw new Error('All chunks failed');
  for (let i=0; i<results.length; i++) if (!results[i]) results[i] = new Blob([], { type: 'audio/mpeg' });
  return results;
}

window.generate = async function() {
  const text = document.getElementById('text-input').value.trim();
  if (!text) { showToast('Please enter text', 'err'); return; }
  if (!selectedVoice) { showToast('Select a voice from the library', 'err'); return; }

  const chunks = splitText(text, MAX_CHUNK);
  const btn = document.getElementById('gen-btn');
  const progWrap = document.getElementById('prog-wrap');
  const progFill = document.getElementById('prog-fill');
  const progTxt = document.getElementById('prog-txt');
  const resWrap = document.getElementById('res-wrap');

  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> Firing parallel requests...';
  progWrap.classList.add('show');
  resWrap.classList.remove('show');
  if (audioURL) URL.revokeObjectURL(audioURL);
  document.getElementById('chunk-grid').innerHTML = chunks.map(()=>'<div class="chunk-pip"></div>').join('');

  let completed = 0;
  const updateProgress = () => { completed++; const percent = Math.min(92, Math.round((completed/chunks.length)*92)); progFill.style.width = percent+'%'; progTxt.textContent = `⚡ ${completed}/${chunks.length} chunks ready`; };
  const startTime = Date.now();

  try {
    progTxt.textContent = `🚀 Launching ${chunks.length} chunk(s) simultaneously`;
    progFill.style.width = '4%';
    const blobs = await parallelFetch(chunks, selectedVoice.index, updateProgress);
    progFill.style.width = '96%';
    progTxt.textContent = '🔊 Merging audio stream...';
    const merged = new Blob(blobs, { type: 'audio/mpeg' });
    const url = URL.createObjectURL(merged);
    audioURL = url;
    document.getElementById('audio-player').src = url;
    const dl = document.getElementById('dl-btn');
    dl.href = url;
    dl.download = `${selectedVoice.name.replace(/\s/g,'_')}_speech.mp3`;
    progFill.style.width = '100%';
    const elapsed = ((Date.now() - startTime)/1000).toFixed(1);
    progTxt.textContent = `✅ Done in ${elapsed}s`;
    setTimeout(() => { progWrap.classList.remove('show'); resWrap.classList.add('show'); showToast(`✨ ${chunks.length} chunk(s) · ${elapsed} sec`, 'ok'); }, 300);
  } catch(err) {
    progWrap.classList.remove('show');
    resWrap.classList.add('show');
    showToast(`Error: ${err.message}`, 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg> Generate Speech';
  }
};

function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.style.display = 'block';
  setTimeout(() => { if (t.textContent === msg) t.style.display = 'none'; }, 4800);
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Start loading voices
loadVoices();
