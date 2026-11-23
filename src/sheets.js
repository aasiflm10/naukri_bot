/**
 * sheets.js — Google Sheets logger
 * Logs applied/skipped jobs to a Google Sheet
 * Auth: Service Account (download JSON key and point GOOGLE_SERVICE_ACCOUNT_KEY_PATH in .env)
 */

const { google } = require("googleapis");
const path = require("path");
const fs = require("fs");

let sheetsClient = null;

async function initSheets() {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  if (!keyPath || !fs.existsSync(keyPath)) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_KEY_PATH not set or file not found.\n" +
      "See README.md → Google Sheets Setup."
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const authClient = await auth.getClient();
  sheetsClient = google.sheets({ version: "v4", auth: authClient });
  console.log("✅ Google Sheets client ready");
}

/**
 * Ensure the sheet has a header row; create it if missing.
 */
async function ensureHeader(spreadsheetId, sheetName = "Sheet1") {
  const range = `${sheetName}!A1:G1`;
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rows = res.data.values || [];
  if (rows.length === 0 || rows[0][0] !== "Timestamp") {
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      requestBody: {
        values: [
          [
            "Timestamp",
            "Job Title",
            "Company",
            "Job ID / URL",
            "Status",
            "Reason Skipped",
            "Notes",
          ],
        ],
      },
    });
    console.log("📝 Header row created in Google Sheet");
  }
}

/**
 * Append a job log entry to the sheet.
 * @param {Object} job - { title, company, url, status, reason, notes }
 */
async function logJob(job) {
  if (!sheetsClient) {
    console.warn("⚠️  Sheets not initialized — skipping log");
    return;
  }

  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || "Sheet1";

  const row = [
    new Date().toISOString(),
    job.title || "",
    job.company || "",
    job.url || "",
    job.status || "",     // "applied" | "skipped" | "error"
    job.reason || "",     // e.g. "external application page"
    job.notes || "",
  ];

  try {
    await sheetsClient.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:G`,
      valueInputOption: "RAW",
      requestBody: { values: [row] },
    });
    console.log(`  📊 Logged to sheet: [${job.status}] ${job.title} @ ${job.company}`);
  } catch (err) {
    console.error("  ❌ Sheet log error:", err.message);
  }
}

module.exports = { initSheets, ensureHeader, logJob };
