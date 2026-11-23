/**
 * index.js — Naukri.com Job Application Bot
 *
 * Usage:
 *   node index.js                  # Apply to one batch of 5 jobs
 *   node index.js --batches 3      # Apply to 3 batches (up to 15 jobs)
 *   node index.js --dry-run        # Dry run (no actual apply clicks)
 */

require("dotenv").config();

const {
  launchBrowser,
  login,
  selectJobs,
  clickApplyButton,
  handleAllApplications,
  getPage,
  getBrowser,
} = require("./src/naukri");

const { initSheets, ensureHeader } = require("./src/sheets");
const { initLLM } = require("./src/llm");

// ─── PROFILE (from .env) ──────────────────────────────────────────────────────

function getProfile() {
  return {
    name: process.env.PROFILE_NAME || "Candidate",
    currentRole: process.env.PROFILE_CURRENT_ROLE || "Software Engineer",
    experienceYears: process.env.PROFILE_EXPERIENCE_YEARS || "3",
    skills: process.env.PROFILE_SKILLS || "Python, JavaScript, React",
    currentCTC: process.env.PROFILE_CURRENT_CTC || "10 LPA",
    expectedCTC: process.env.PROFILE_EXPECTED_CTC || "15 LPA",
    noticePeriod: process.env.PROFILE_NOTICE_PERIOD || "30 days",
    currentLocation: process.env.PROFILE_CURRENT_LOCATION || "Bangalore",
    preferredLocation: process.env.PROFILE_PREFERRED_LOCATION || "Bangalore, Remote",
    currentCompany: process.env.PROFILE_CURRENT_COMPANY || "ABC Corp",
    qualification: process.env.PROFILE_QUALIFICATION || "B.Tech Computer Science",
  };
}

// ─── ARG PARSING ──────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    batches: parseInt(args[args.indexOf("--batches") + 1] || "1", 10),
    dryRun: args.includes("--dry-run"),
  };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  const { batches, dryRun } = parseArgs();
  const profile = getProfile();

  console.log("╔════════════════════════════════════╗");
  console.log("║   🤖 Naukri Job Application Bot    ║");
  console.log("╚════════════════════════════════════╝");
  console.log(`  Batches: ${batches} | Dry Run: ${dryRun}`);
  console.log(`  Profile: ${profile.name} | ${profile.experienceYears} yrs | ${profile.currentRole}`);
  console.log("");

  // Init services
  try {
    initLLM();
    console.log("✅ Gemini LLM ready (gemini-1.5-flash)");
  } catch (e) {
    console.error("❌ LLM init failed:", e.message);
    process.exit(1);
  }

  try {
    await initSheets();
    await ensureHeader(
      process.env.GOOGLE_SPREADSHEET_ID,
      process.env.GOOGLE_SHEET_NAME || "Sheet1"
    );
  } catch (e) {
    console.warn("⚠️  Google Sheets init failed:", e.message);
    console.warn("   Jobs will be logged to console only.\n");
  }

  // Launch browser
  await launchBrowser();
  const page = getPage();
  const browser = getBrowser();

  try {
    await login();

    const stats = { applied: 0, skipped: 0, errors: 0 };

    for (let batch = 1; batch <= batches; batch++) {
      console.log(`\n━━━ Batch ${batch}/${batches} ━━━`);

      const selectedJobs = await selectJobs();

      if (selectedJobs.length === 0) {
        console.log("⚠️  No jobs available to select. Done.");
        break;
      }

      if (dryRun) {
        console.log(`  [DRY RUN] Would apply to ${selectedJobs.length} jobs:`);
        selectedJobs.forEach((j) => console.log(`    - ${j.title} @ ${j.company}`));
        continue;
      }

      await clickApplyButton();

      // ONE unified sidebar handles ALL 5 jobs' questions in sequence
      console.log(`\n  📋 Jobs queued: ${selectedJobs.map(j => j.title.split(' ').slice(0,3).join(' ')).join(', ')}`);
      const batchStats = await handleAllApplications(selectedJobs, profile);

      stats.applied += batchStats.applied;
      stats.skipped += batchStats.skipped;
      stats.errors  += batchStats.errors;

      // Pause between batches
      if (batch < batches) {
        console.log(`\n⏳ Waiting 5s before next batch...`);
        await page.waitForTimeout(5000);
        // Reload page to get fresh unchecked jobs
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);
      }
    }

    console.log("\n╔════════════════════════════════════╗");
    console.log("║            📊 SUMMARY              ║");
    console.log("╠════════════════════════════════════╣");
    console.log(`║  ✅ Applied:  ${String(stats.applied).padEnd(21)}║`);
    console.log(`║  ⏭  Skipped: ${String(stats.skipped).padEnd(21)}║`);
    console.log(`║  ❌ Errors:  ${String(stats.errors).padEnd(21)}║`);
    console.log("╚════════════════════════════════════╝");
  } catch (err) {
    console.error("\n💥 Fatal error:", err);
  } finally {
    console.log("\n🛑 Closing browser in 5s...");
    await page.waitForTimeout(5000);
    await browser.close();
  }
}

main().catch(console.error);
