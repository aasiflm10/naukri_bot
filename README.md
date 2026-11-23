# 🤖 Naukri.com Job Application Bot

Automatically applies to recommended jobs on [naukri.com](https://naukri.com), answers sidebar questions using **Gemini 1.5 Flash** (free tier), and logs every job to a **Google Sheet**.

---

## ✨ Features

| Feature | Detail |
|---|---|
| **Multi-apply** | Selects up to 5 jobs → clicks "Apply N Jobs" |
| **LLM Q&A** | Gemini Flash answers sidebar questions using your profile |
| **External skip** | Detects jobs that redirect to external pages → skips & logs |
| **Google Sheets** | Logs every job as `applied` / `skipped` / `error` |
| **Visible browser** | Runs headed (you can watch & intervene) |
| **Multi-batch** | `--batches 3` → applies to up to 15 jobs in one run |

---

## 🚀 Quick Start

### 1. Clone & install
```bash
cd naukridotcom_bot
npm install
npx playwright install chromium
```

### 2. Set up environment
```bash
cp .env.example .env
# Edit .env with your credentials and profile
```

### 3. Get a free Gemini API key
- Go to: **https://aistudio.google.com/app/apikey**
- Click **"Create API Key"**
- Copy it into `.env` → `GEMINI_API_KEY=...`
- **Free tier**: 15 requests/min, 1 million tokens/day — more than enough!

### 4. Set up Google Sheets (5 minutes)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → Enable **Google Sheets API**
3. Go to **IAM & Admin → Service Accounts → Create Service Account**
4. Download the JSON key → save as `service-account-key.json` in this folder
5. Create a Google Sheet → copy the ID from the URL:
   `https://docs.google.com/spreadsheets/d/**THIS_PART**/edit`
6. Share the sheet with the service account email (from the JSON key) with **Editor** access
7. Set `GOOGLE_SPREADSHEET_ID` in `.env`

### 5. Configure your profile
Fill in `.env` with your details — the LLM uses these to answer sidebar questions:
```
PROFILE_NAME=Your Name
PROFILE_EXPERIENCE_YEARS=3
PROFILE_SKILLS=Python, JavaScript, React
PROFILE_CURRENT_CTC=10 LPA
PROFILE_EXPECTED_CTC=15 LPA
PROFILE_NOTICE_PERIOD=30 days
...
```

### 6. Run the bot!
```bash
# Apply to 1 batch (up to 5 jobs)
node index.js

# Apply to 3 batches (up to 15 jobs)
node index.js --batches 3

# Dry run — preview without clicking Apply
node index.js --dry-run
```

---

## 📊 Google Sheet Output

The bot writes these columns automatically:

| Timestamp | Job Title | Company | URL | Status | Reason Skipped | Notes |
|---|---|---|---|---|---|---|
| 2026-11-23T17:00:00Z | Python Developer | CGI | naukri.com/... | applied | | Submitted |
| 2026-11-23T17:01:00Z | AI Engineer | Bain | external.com/... | skipped | External page | https://... |

---

## 🗂 Project Structure

```
naukridotcom_bot/
├── index.js                    # Entry point / orchestrator
├── src/
│   ├── naukri.js              # Playwright browser automation
│   ├── llm.js                 # Gemini Flash Q&A
│   └── sheets.js              # Google Sheets logger
├── .env.example               # Template — copy to .env
├── service-account-key.json   # Google service account (you add this)
└── package.json
```

---

## ⚙️ How It Works

```
1. Login to Naukri
2. Go to /mnjuser/recommendedjobs
3. Select up to 5 jobs via checkboxes
4. Click "Apply 5 Jobs"
5. For each sidebar that appears:
   a. Detect question type (radio / select / text)
   b. Send to Gemini Flash → get answer
   c. Fill answer → click Next
   d. If external page → SKIP, log as "skipped"
   e. Click final Apply → log as "applied"
6. Repeat for more batches
```

---

## 💡 LLM Cost

| Model | Cost | Limit |
|---|---|---|
| **Gemini 1.5 Flash** ✅ (default) | **FREE** | 15 RPM, 1M TPD |
| Gemini 1.5 Flash-8B | FREE | Higher limits |
| Gemini 1.0 Pro | Paid | — |

The free tier is plenty for daily job applications. No credit card needed.

---

## ⚠️ Notes

- Run the bot **once manually** first to make sure login works (Naukri may show a CAPTCHA the first time — solve it manually in the visible browser window)
- The bot runs in **headed mode** (visible browser) so you can watch and intervene
- If Naukri changes its HTML structure, update the CSS selectors in `src/naukri.js`
# naukri_bot
