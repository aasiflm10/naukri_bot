/**
 * llm.js — Gemini Flash question answerer
 * Uses Google Gemini 1.5 Flash (FREE tier: 15 RPM, 1M tokens/day)
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");

let genAI = null;
let model = null;

const LOGS_DIR = path.join(__dirname, "../logs");
const QA_LOG_FILE = path.join(LOGS_DIR, "qa_history.log");

function recordQALog({ label, type, options, answer, error }) {
  try {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString();
    const optionsText = options && options.length > 0 ? options.join(" | ") : "N/A";
    const logEntry = [
      `============================================================`,
      `[TIMESTAMP] : ${timestamp}`,
      `[QUESTION]  : ${label}`,
      `[TYPE]      : ${type}`,
      `[OPTIONS]   : ${optionsText}`,
      `[ANSWER]    : ${answer || "NONE"}`,
      ...(error ? [`[ERROR]     : ${error}`] : []),
      `============================================================\n`,
    ].join("\n");

    fs.appendFileSync(QA_LOG_FILE, logEntry, "utf8");
  } catch (err) {
    console.error("  ⚠️  Could not write to qa_history.log:", err.message);
  }
}

function initLLM() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not set in .env");
  }
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
}

/**
 * Answer a sidebar question using the user profile from .env
 * @param {Object} questionData - { label, type, options }
 * @param {Object} profile - user profile from .env
 * @returns {string} - the answer to fill in
 */
async function answerQuestion(questionData, profile) {
  if (!model) initLLM();

  const { label, type, options } = questionData;

  const profileSummary = `
Name: ${profile.name}
Current Role: ${profile.currentRole}
Experience: ${profile.experienceYears} years
Skills: ${profile.skills}
Current CTC: ${profile.currentCTC}
Expected CTC: ${profile.expectedCTC}
Notice Period: ${profile.noticePeriod}
Current Location: ${profile.currentLocation}
Preferred Location: ${profile.preferredLocation}
Current Company: ${profile.currentCompany}
Highest Qualification: ${profile.qualification}
`.trim();

  let prompt = "";

  const specialRules = `
Special Rules & Screening Strategy:
- Primary Goal: Always answer in a way that ensures the candidate passes recruiter screening and GETS SELECTED for the next stage.
- Unknown / Unsure Questions: If a question is asked and the exact answer isn't in the profile, always choose the most favorable, positive, and compliant answer that recruiters prefer (e.g., "Yes", "Willing to relocate", "Flexible", "Available immediately", etc.).
- Technologies / Skills: If asked whether the candidate knows or has worked with ANY technology, tool, skill, or framework (even if not listed in the profile), ALWAYS say YES.
- Experience with any Technology: Always state 2 years of experience for any specific technology/skill requested:
  - If options are provided (radio/dropdown), pick the option matching 2 years (e.g. "2 years", "2", "2-3 years", or "1-3 years").
  - If it is an open text or number field asking for experience, reply with ONLY "2" or "2 years".
`.trim();

  if (type === "radio" || type === "select") {
    prompt = `
You are filling a job application form on behalf of this candidate:
${profileSummary}

${specialRules}

Question: "${label}"
Type: ${type} (pick exactly ONE option)
Options: ${options.map((o, i) => `${i + 1}. ${o}`).join(", ")}

Reply with ONLY the exact text of the best matching option from the list above. No explanation.
`.trim();
  } else if (type === "checkbox") {
    prompt = `
You are filling a job application form on behalf of this candidate:
${profileSummary}

${specialRules}

Question: "${label}"
Type: checkbox (can pick multiple)
Options: ${options.map((o, i) => `${i + 1}. ${o}`).join(", ")}

Reply with ONLY a comma-separated list of the exact option texts that apply. No explanation.
`.trim();
  } else {
    // text / textarea
    prompt = `
You are filling a job application form on behalf of this candidate:
${profileSummary}

${specialRules}

Question: "${label}"
Type: text input

Write a concise, accurate answer that fits this question perfectly.
- If asked for years of experience on any technology/skill, reply with "2" (or "2 years").
- Otherwise, write a concise, professional answer (1-2 sentences max).
Reply with ONLY the answer text. No explanation.
`.trim();
  }

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // ── Log to console with prominent box ───────────────────────────────────
    console.log(`\n  ┌─────────────────────────────────────────────────────────`);
    console.log(`  │ ❓ QUESTION : ${label}`);
    console.log(`  │ 📋 TYPE     : ${type}`);
    if (options && options.length > 0) {
      console.log(`  │ 🏷️  OPTIONS  : ${options.join(" | ")}`);
    }
    console.log(`  │ 🤖 ANSWER   : "${text}"`);
    console.log(`  └─────────────────────────────────────────────────────────\n`);

    // ── Append to logs/qa_history.log for permanent review ──────────────────
    recordQALog({ label, type, options, answer: text });

    return text;
  } catch (err) {
    console.error(`  ❌ LLM error for "${label}":`, err.message);
    recordQALog({ label, type, options, answer: "", error: err.message });
    return "";
  }
}

module.exports = { answerQuestion, initLLM };
