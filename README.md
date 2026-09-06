<div align="center">

# 🗣️ SpeechFlow | Ultra-Fast Text to Speech

### High-performance, browser-based TTS — no limits, no server, no cost

SpeechFlow synthesizes long texts **instantly** by splitting them into chunks and firing them **in parallel**, then merging the audio directly in your browser. Unlimited length, zero server-side processing, multiple themes.

[![View Live Demo](https://img.shields.io/badge/🚀-View_Live_Demo-00C853?style=flat-square)](https://ahsan-dogar.github.io/SpeechFlow/)

[![Performance](https://img.shields.io/badge/performance-parallel-brightgreen)]()
[![Length](https://img.shields.io/badge/length-unlimited-blue)]()
[![Dependencies](https://img.shields.io/badge/dependencies-zero-yellow)]()
[![Platform](https://img.shields.io/badge/platform-browser-FF7139?logo=firefox&logoColor=white)]()
[![Deploy](https://img.shields.io/badge/deploy-Vercel-000000?logo=vercel&logoColor=white)]()

</div>

---

## ✨ Features

- ⚡ **Ultra fast** — all chunks are synthesized simultaneously and merged
- ♾️ **Unlimited length** — no character limits on your text input
- 🧩 **In-browser merging** — zero server-side FFmpeg / processing for the merge step
- 🎨 **Modern UI** — clean dark theme with multiple color schemes
- 📱 **Responsive design** — perfect on Desktop, Tablet & Mobile
- 🚫 **Zero dependencies** — pure HTML, CSS & JavaScript

---

## 🛠️ How It Works

1. Your text is split into small chunks
2. All chunks are sent to the TTS engine **in parallel**
3. The resulting audio blobs are merged **in the browser**
4. You get a single, playable audio file — fast

---

## 🛠️ Tech Stack

| Technology | Usage |
| ---------- | ----- |
| **HTML5** | Structure & audio APIs |
| **CSS3** | Custom properties, Flexbox, Grid, themes |
| **JavaScript** | Vanilla JS, Promises, Blobs, parallel chunking |

---

## 🚀 Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/Ahsan-Dogar/SpeechFlow.git
cd SpeechFlow

# 2. Just open index.html in any browser
```

### Deploy to Vercel

```bash
npm i -g vercel
vercel
```

The project is fully Vercel-ready — a static site that deploys in seconds.

---

## 📂 File Structure

```
├── index.html   # App shell
├── style.css    # Themes & responsive styling
└── script.js    # Parallel TTS + in-browser merging
```

---

<div align="center">

⭐ **Useful? Please star the repo!**

Made with ❤️ by [Ahsan Dogar](https://github.com/Ahsan-Dogar)

</div>