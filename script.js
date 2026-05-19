const BASE = 'https://speechster.vercel.app';
const SPEECHMA = 'https://speechma.com/com.api/tts-api.php';
const MAX_CHUNK = 900;
const MAX_CONCURRENT = 999;

const THEMES = [
  {k:'violet', l:'Violet'},
  {k:'dark',   l:'Obsidian'},
  {k:'ember',  l:'Ember'},
  {k:'jade',   l:'Jade'},
  {k:'rose',   l:'Rose'},
  {k:'gold',   l:'Gold'},
];
let themeIdx = 0;

function cycleTheme() {
  themeIdx = (themeIdx + 1) % THEMES.length;
  const t = THEMES[themeIdx];
  document.body.setAttribute('data-theme', t.k);
  document.getElementById('theme-lbl').textContent = t.l;
  try { localStorage.setItem('ss-theme', themeIdx); } catch(e) {}
}
(function() {
  try {
    const s = parseInt(localStorage.getItem('ss-theme'));
    if (!isNaN(s) && s >= 0 && s < THEMES.length) {
      themeIdx = s;
      document.body.setAttribute('data-theme', THEMES[s].k);
      document.getElementById('theme-lbl').textContent = THEMES[s].l;
    }
  } catch(e) {}
})();

let voices = [], selectedVoice = null, audioURL = null;

async function loadVoices() {
  try {
    const r = await fetch(BASE + '/api/voices');
    const d = await r.json();
    voices = d.voices || [];
    renderVoices(voices);
  } catch(e) {
    document.getElementById('vlist').innerHTML =
      '<div style="text-align:center;padding:2rem;color:var(--red);font-family:var(--mono);font-size:0.75rem;">Failed to load voices</div>';
  }
}

function renderVoices(list) {
  const c = document.getElementById('vlist');
  if (!list.length) {
    c.innerHTML = '<div style="text-align:center;padding:1.5rem;color:var(--muted);font-family:var(--mono);font-size:0.75rem;">No voices found</div>';
    return;
  }
  const grp = {};
  list.forEach(v => { if (!grp[v.language]) grp[v.language]=[]; grp[v.language].push(v); });
  let h = '';
  for (const [lang, vs] of Object.entries(grp)) {
    h += '<div class="vgrp">'+lang+'</div>';
    vs.forEach(v => {
      const s = selectedVoice && selectedVoice.index===v.index;
      const av = v.gender==='Male' ? 'av-m' : 'av-f';
      const in2 = v.name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase().slice(0,2);
      h += '<div class="vitem'+(s?' sel':'')+'" onclick="selectVoice('+v.index+')">'+
        '<span class="vnum">'+v.index+'</span>'+
        '<div class="vav '+av+'">'+in2+'</div>'+
        '<div class="vinfo"><div class="vname">'+esc(v.name)+'</div><div class="vmeta">'+v.gender+' · '+esc(v.country)+'</div></div>'+
        '<span class="vchk">✓</span></div>';
    });
  }
  c.innerHTML = h;
}

function filterVoices() {
  const q = document.getElementById('vsearch').value.toLowerCase();
  renderVoices(voices.filter(v =>
    v.name.toLowerCase().includes(q) || v.language.toLowerCase().includes(q) ||
    v.country.toLowerCase().includes(q) || String(v.index).includes(q)));
}

function selectVoice(idx) {
  selectedVoice = voices.find(v => v.index===idx);
  const d = document.getElementById('sel-disp');
  if (selectedVoice) {
    d.className = 'sel-disp';
    d.textContent = '🎤 #'+selectedVoice.index+' · '+selectedVoice.name+' · '+selectedVoice.gender;
  } else {
    d.className = 'sel-disp empty';
    d.textContent = '🎤 No voice selected';
  }
  const q = document.getElementById('vsearch').value.toLowerCase();
  renderVoices(q ? voices.filter(v=>v.name.toLowerCase().includes(q)||String(v.index).includes(q)) : voices);
}

function updateCount() {
  const n = document.getElementById('text-input').value.length;
  const el = document.getElementById('char-ctr');
  el.textContent = n.toLocaleString();
  el.className = 'char-ctr'+(n>10000?' over':n>6000?' warn':'');
}

function splitText(text, max) {
  const chunks = [];
  let rem = text.replace(/[*_`~><^#|\\]/g,'').replace(/\s+/g,' ').trim();
  while (rem.length > 0) {
    if (rem.length <= max) { chunks.push(rem); break; }
    let i = rem.lastIndexOf('. ', max);
    if (i===-1) i = rem.lastIndexOf('! ', max);
    if (i===-1) i = rem.lastIndexOf('? ', max);
    if (i===-1) i = rem.lastIndexOf('; ', max);
    if (i===-1) i = rem.lastIndexOf(', ', max);
    if (i===-1) i = rem.lastIndexOf(' ', max);
    if (i===-1) i = max;
    const c = rem.substring(0, i+1).trim();
    if (c) chunks.push(c);
    rem = rem.substring(i+1).trim();
  }
  return chunks;
}

function getVoiceId(voiceIndex) {
  const v = voices.find(x => x.index === voiceIndex);
  return v ? v.id : null;
}

async function fetchChunkDirect(voiceId, text) {
  const body = JSON.stringify({ text, voice: voiceId, pitch: 0, rate: 0 });
  const headers = {
    'Content-Type': 'application/json',
    'Origin': 'https://speechma.com',
    'Referer': 'https://speechma.com/english',
  };
  const r = await fetch(SPEECHMA, { method: 'POST', headers, body });
  if (!r.ok) throw new Error('direct:' + r.status);
  const blob = await r.blob();
  if (blob.size < 100) throw new Error('direct:tiny');
  return blob;
}

async function fetchChunkProxy(voiceIndex, text) {
  const r = await fetch(BASE + '/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voiceIndex, text }),
  });
  if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.error || 'HTTP ' + r.status); }
  return r.blob();
}

async function parallelFetch(chunks, voiceIndex, onDone) {
  const pips = document.getElementById('chunk-grid').children;
  const voiceId = getVoiceId(voiceIndex);
  for (let i = 0; i < pips.length; i++) pips[i].className = 'chunk-pip active';

  const promises = chunks.map(async (text, idx) => {
    try {
      let blob;
      try {
        blob = await fetchChunkDirect(voiceId, text);
      } catch(e) {
        blob = await fetchChunkProxy(voiceIndex, text);
      }
      if (pips[idx]) pips[idx].className = 'chunk-pip done';
      onDone();
      return { idx, blob };
    } catch(err) {
      if (pips[idx]) pips[idx].className = 'chunk-pip error';
      throw new Error('Chunk ' + (idx + 1) + ' failed: ' + err.message);
    }
  });

  const settled = await Promise.allSettled(promises);
  const results = new Array(chunks.length);
  const errors = [];
  settled.forEach(s => {
    if (s.status === 'fulfilled') results[s.value.idx] = s.value.blob;
    else errors.push(s.reason?.message || 'unknown');
  });
  if (errors.length === chunks.length) throw new Error(errors[0]);
  results.forEach((r, i) => { if (!r) results[i] = new Blob([], { type: 'audio/mpeg' }); });
  return results;
}

async function generate() {
  const text = document.getElementById('text-input').value.trim();
  if (!text) { showToast('Please enter some text.', 'err'); return; }
  if (!selectedVoice) { showToast('Please select a voice first.', 'err'); return; }

  const chunks = splitText(text, MAX_CHUNK);
  const btn = document.getElementById('gen-btn');
  const pw = document.getElementById('prog-wrap');
  const pf = document.getElementById('prog-fill');
  const pt = document.getElementById('prog-txt');
  const rw = document.getElementById('res-wrap');

  btn.disabled = true;
  btn.innerHTML = '<span class="spin" style="width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff"></span> Processing...';
  pw.classList.add('show'); rw.classList.remove('show'); hideToast();
  if (audioURL) { URL.revokeObjectURL(audioURL); audioURL = null; }

  document.getElementById('chunk-grid').innerHTML =
    chunks.map(()=>'<div class="chunk-pip"></div>').join('');

  let done = 0;
  const t0 = Date.now();

  const updateProgress = () => {
    done++;
    const pct = Math.round((done / chunks.length) * 92);
    pf.style.width = pct + '%';
    pt.textContent = chunks.length > 1
      ? done + '/' + chunks.length + ' chunks done (' + pct + '%)'
      : 'Generating...';
  };

  try {
    pt.textContent = '⚡ Firing all ' + chunks.length + ' chunk(s) simultaneously...';
    pf.style.width = '3%';

    const blobs = await parallelFetch(chunks, selectedVoice.index, updateProgress);

    pf.style.width = '97%';
    pt.textContent = 'Merging in browser...';

    const merged = new Blob(blobs, { type: 'audio/mpeg' });
    audioURL = URL.createObjectURL(merged);

    pf.style.width = '100%';
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    pt.textContent = '✓ Done in ' + elapsed + 's';

    document.getElementById('audio-player').src = audioURL;
    const dl = document.getElementById('dl-btn');
    dl.href = audioURL;
    dl.download = selectedVoice.name.replace(/\s+/g,'_') + '_speech.mp3';

    setTimeout(() => {
      pw.classList.remove('show');
      rw.classList.add('show');
      showToast('✓ Generated in ' + elapsed + 's — ' + chunks.length + ' chunk(s)', 'ok');
    }, 400);

  } catch(e) {
    pw.classList.remove('show');
    rw.classList.add('show');
    showToast('Error: ' + e.message, 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg> Generate Speech';
  }
}

function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast ' + type; t.style.display = 'block';
  setTimeout(() => { if (t.textContent===msg) t.style.display='none'; }, 5000);
}
function hideToast() { document.getElementById('toast').style.display = 'none'; }

function esc(s) { return String(s).replace(/&/g,'&').replace(/</g,'<').replace(/>/g,'>'); }

// Start
loadVoices();