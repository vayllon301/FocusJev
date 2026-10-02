# FocusJev 🛡️

**FocusJev** is a high-discipline browser extension that enforces your focus goals in real-time. Powered by **Jev** (`typesafe/jev-1.13`) by TypeSafe via **OpenRouter**, it evaluates every webpage you navigate to and **immediately closes any tab that is not relevant to your current goal**.

Cross-browser compatible with **Zen**, **Firefox**, **Chrome**, **Brave**, **Edge**, and **Arc**.

---

## ⚡ Features

- **Goal & Timer Enforcement**: Set any goal (e.g., *"Research AI security and red teaming"*) and a duration (e.g., 25m Pomodoro, 45m, 60m).
- **Instant Hard Close**: Off-task tabs (social media, entertainment, unrelated news, shopping, off-topic rabbit holes) are terminated instantly without warning.
- **Powered by Jev (TypeSafe)**:
  - Uses OpenRouter's Decisions API (`/api/alpha/decisions`) with `typesafe/jev-1.13`.
  - Calibrated probability decisions (`noul` primitive) with ultra-low latency (~175ms p50) and zero hallucinated text.
  - Resilience fallback to OpenRouter chat completions.
- **Initial Clean Sweep**: Automatically detects and closes off-task tabs already open when you initiate your focus session.
- **Window Safety Guard**: Never accidentally closes your entire browser window if the only tab is closed—it safely creates a blank tab first.
- **Interception Feed & Audit Log**: Track all blocked tabs, their relevance scores, timestamps, and your goal history.
- **Customizable Strictness & Whitelist**: Fine-tune the decision threshold (Lenient, Balanced, Strict) and whitelist internal sites or dev servers.

---

## 🚀 Installation Instructions

### Option A: Loading in Zen Browser / Firefox
1. Open **Zen** (or Firefox) and in the URL bar type:
   ```
   about:debugging#/runtime/this-firefox
   ```
2. Click **Load Temporary Add-on...**
3. Navigate to `/Users/victorayllon/Desktop/FocusJev` and select the **`manifest.json`** file.
4. FocusJev will appear in your Zen extensions / toolbar!

---

### Option B: Loading in Chrome / Brave / Edge / Arc
1. Open your browser and navigate to `chrome://extensions` (or `brave://extensions`, `edge://extensions`).
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** in the top-left toolbar.
4. Select the project folder:
   ```
   /Users/victorayllon/Desktop/FocusJev
   ```
5. Pin the **FocusJev** icon to your toolbar.

---

## 🔑 Setup & Usage

1. **Enter your OpenRouter API Key**:
   - Click the FocusJev icon in your toolbar.
   - Go to the **Settings** tab.
   - Paste your [OpenRouter API Key](https://openrouter.ai/keys) (`sk-or-v1-...`).
   - Click **Test Jev Connection** to verify connectivity with `typesafe/jev-1.13`.
   - Click **Save Configuration**.

2. **Start a Focus Session**:
   - Return to the **Focus** tab.
   - Type your goal (e.g. `Research AI security vulnerabilities and red teaming`).
   - Choose your duration (e.g. `25m`).
   - Click **Start Focus Session**.

3. **Browse Normally**:
   - Any website you open that supports your research goal will remain open.
   - Any tab that wanders off-topic (e.g., YouTube, Twitter/X, Reddit, shopping) will be closed **immediately**!
