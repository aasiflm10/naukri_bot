/**
 * naukri.js — Playwright browser automation for Naukri.com
 * Handles login, job selection, multi-apply, sidebar Q&A, and external page detection.
 */

const { chromium } = require("playwright");
const { answerQuestion } = require("./llm");
const { logJob } = require("./sheets");

const NAUKRI_RECOMMENDED_URL =
  "https://www.naukri.com/mnjuser/recommendedjobs";
const NAUKRI_LOGIN_URL = "https://www.naukri.com/nlogin/login";

let browser, page;

// ─── BROWSER SETUP ────────────────────────────────────────────────────────────

async function launchBrowser() {
  browser = await chromium.launch({
    headless: false,       // visible so you can watch / solve captchas if needed
    slowMo: 300,
    args: ["--start-maximized"],
  });

  const context = await browser.newContext({
    viewport: null,
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  page = await context.newPage();
  return { browser, page };
}

// ─── LOGIN ─────────────────────────────────────────────────────────────────────

async function login() {
  const email = process.env.NAUKRI_EMAIL;
  const password = process.env.NAUKRI_PASSWORD;

  if (!email || !password) {
    throw new Error("NAUKRI_EMAIL or NAUKRI_PASSWORD not set in .env");
  }

  console.log("🔐 Logging in to Naukri...");
  await page.goto(NAUKRI_LOGIN_URL, { waitUntil: "domcontentloaded" });

  // Wait for the login form specifically (not the search bar)
  // Naukri's login page uses id="usernameField" for the email input
  await page.waitForSelector(
    '#usernameField, input[placeholder*="Email ID"], input[placeholder*="email"], input[name="email"]',
    { timeout: 15000 }
  );

  // Fill email — use the specific login form field (NOT the search bar)
  const emailField = page.locator(
    '#usernameField, input[placeholder*="Email ID"], input[placeholder*="email id"], input[name="email"]'
  ).first();
  await emailField.fill(email);

  // Fill password
  const pwField = page.locator('input[type="password"], input[placeholder*="password"], input[placeholder*="Password"]').first();
  await pwField.fill(password);

  // Click Login button — scoped to the login form area
  const loginBtn = page.locator(
    'button[type="submit"], button.loginButton, button:has-text("Login"), button:has-text("Sign in")'
  ).first();
  await loginBtn.click();

  // Wait to leave the login page
  await page.waitForURL((url) => !url.toString().includes("nlogin"), {
    timeout: 30000,
  });
  console.log("✅ Logged in successfully");
}

// ─── SELECT JOBS ──────────────────────────────────────────────────────────────

/**
 * Navigate to recommended jobs and select up to 5 unchecked jobs.
 * Returns array of { title, company, url } for selected jobs.
 */
async function selectJobs() {
  console.log("📋 Navigating to recommended jobs...");
  await page.goto(NAUKRI_RECOMMENDED_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  // Scroll to load jobs
  await page.evaluate(() => window.scrollBy(0, 400));
  await page.waitForTimeout(1000);

  // Find all job cards — Naukri uses article tags or tuple classes
  const jobCards = await page.$$(
    ".jobTuple, .job-tuple, article.jobTuple, [class*='jobTuple'], article[class*='tuple']"
  );

  console.log(`  Found ${jobCards.length} job cards`);

  if (jobCards.length === 0) {
    console.log("⚠️  No job cards found — check if page loaded correctly");
    return [];
  }

  const selectedJobs = [];
  let selectedCount = 0;

  for (const card of jobCards) {
    if (selectedCount >= 5) break;

    // ── Extract metadata first ───────────────────────────────────────────────
    const titleEl = await card.$(".title, .jobTitle, [class*='title']");
    const companyEl = await card.$(".subTitle, .companyName, [class*='company']");
    const linkEl = await card.$("a[href]");

    const title = titleEl ? (await titleEl.innerText()).trim() : "Unknown";
    const company = companyEl ? (await companyEl.innerText()).trim() : "Unknown";
    const url = linkEl ? await linkEl.getAttribute("href") : "";

    // ── Naukri uses a CUSTOM checkbox: <i class="naukicon-ot-checkbox"> ──────
    // The real <input> is hidden under the icon — we must click the <i> icon.
    const checkIcon = await card.$("i.naukicon-ot-checkbox, i[class*='checkbox'], i[class*='ot-checkbox']");
    const hiddenInput = await card.$('input[type="checkbox"]');

    if (!hiddenInput) continue; // no checkbox on this card, skip

    // Check current state via the hidden input
    const isChecked = await hiddenInput.isChecked().catch(() => false);
    if (isChecked) continue; // already selected

    try {
      if (checkIcon) {
        // Click the visible icon (what Naukri actually responds to)
        await checkIcon.click();
      } else {
        // Fallback: force-click the hidden input directly via JS
        await page.evaluate((el) => el.click(), hiddenInput);
      }
      await page.waitForTimeout(400);

      // Verify it got checked
      const nowChecked = await hiddenInput.isChecked().catch(() => true);
      if (!nowChecked) {
        // Last resort: JavaScript click on the icon
        await page.evaluate((el) => el.click(), checkIcon || hiddenInput);
        await page.waitForTimeout(300);
      }

      selectedJobs.push({ title, company, url });
      selectedCount++;
      console.log(`  ✓ Selected [${selectedCount}/5]: ${title} @ ${company}`);

    } catch (err) {
      console.log(`  ⚠️  Could not select "${title}": ${err.message}`);
    }
  }

  return selectedJobs;
}

// ─── CLICK MULTI-APPLY ────────────────────────────────────────────────────────

async function clickApplyButton() {
  // Naukri's "Apply N Jobs" button — try multiple selectors
  const selectors = [
    'button:has-text("Apply 5 Jobs")',
    'button:has-text("Apply 4 Jobs")',
    'button:has-text("Apply 3 Jobs")',
    'button:has-text("Apply 2 Jobs")',
    'button:has-text("Apply 1 Jobs")',
    'button:has-text("Apply")',
    '.apply-button',
    '[class*="applyButton"]',
    '[class*="apply-btn"]',
  ];

  let clicked = false;
  for (const sel of selectors) {
    try {
      const btn = page.locator(sel).first();
      const visible = await btn.isVisible({ timeout: 3000 }).catch(() => false);
      if (visible) {
        // Use JS click to avoid interception issues
        await btn.evaluate((el) => el.click());
        console.log(`🚀 Clicked Apply button (${sel})`);
        clicked = true;
        break;
      }
    } catch {}
  }

  if (!clicked) {
    throw new Error("Could not find the Apply button on the page");
  }

  await page.waitForTimeout(1500);
}

// ─── UNIFIED APPLICATION HANDLER ─────────────────────────────────────────────
// After clicking "Apply N Jobs", Naukri opens ONE right-side panel that walks
// through questions for all selected jobs in sequence (chatbot-style).
// We handle the entire flow here — not per-job.

/**
 * Waits for the application sidebar to appear, then answers all questions
 * for all selected jobs using LLM, clicking Save after each answer.
 */
async function handleAllApplications(selectedJobs, profile) {
  console.log("\n🤖 Waiting for application Q&A sidebar...");

  // ── Step 1: Detect sidebar appearance ───────────────────────────────────────
  // Naukri's panel has radio inputs or a Save button — wait for either
  let sidebarDetected = false;
  const detectionAttempts = [
    'input[type="radio"]',
    'button:has-text("Save")',
    '[class*="chatbot"]',
    '[class*="applyModal"]',
    '[class*="apply-modal"]',
    '[class*="bot-message"]',
    '[class*="ssrc"]',
  ];

  for (const sel of detectionAttempts) {
    try {
      await page.waitForSelector(sel, { timeout: 6000 });
      console.log(`  ✅ Sidebar detected via: ${sel}`);
      sidebarDetected = true;
      break;
    } catch {}
  }

  if (!sidebarDetected) {
    console.log("  ⚠️  Sidebar never appeared — logging all as errors");
    for (const job of selectedJobs) {
      await logJob({ ...job, status: "error", reason: "Sidebar not detected after apply click" });
    }
    return { applied: 0, skipped: 0, errors: selectedJobs.length };
  }

  // ── Step 2: Loop through ALL questions for ALL jobs ──────────────────────────
  let round = 0;
  const MAX_ROUNDS = 80; // safety cap (up to ~15 Qs × 5 jobs)

  while (round < MAX_ROUNDS) {
    round++;
    await page.waitForTimeout(900);

    // ── Detect current state of the page ──────────────────────────────────────
    const state = await page.evaluate(() => {
      // Find all visible radio buttons
      const radios = Array.from(document.querySelectorAll('input[type="radio"]'))
        .filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 || el.offsetParent !== null;
        });

      // Find visible text inputs / textareas
      const textInputs = Array.from(document.querySelectorAll('input[type="text"], input[type="number"], textarea'))
        .filter(el => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
        });

      // Find Save / Apply / Submit button
      const allButtons = Array.from(document.querySelectorAll('button'));
      const actionBtn = allButtons.find(b =>
        /^(Save|Apply|Submit|Continue|Next|Done)$/i.test(b.innerText.trim()) && !b.disabled
      );

      // Find question text: look for text that ends with ? or is near radio buttons
      let questionText = null;

      // Strategy 1: element with class containing "question" or "bot"
      const qEl = document.querySelector(
        '[class*="question-text"], [class*="questionText"], [class*="bot-message"], ' +
        '[class*="chatbot-message"], [class*="ssrc__text"]'
      );
      if (qEl) questionText = qEl.innerText.trim();

      // Strategy 2: nearest paragraph/span/div above the radio group
      if (!questionText && radios.length > 0) {
        let el = radios[0].closest('div, section, form');
        if (el) {
          // Walk siblings/parents looking for question text
          const walker = document.createTreeWalker(el.parentElement || el, NodeFilter.SHOW_TEXT);
          const texts = [];
          let node;
          while ((node = walker.nextNode())) {
            const t = node.textContent.trim();
            if (t.length > 8) texts.push(t);
          }
          // Pick the one that looks like a question
          questionText = texts.find(t => t.includes('?') || t.length > 15) || texts[0] || null;
        }
      }

      // Strategy 3: look for any visible text ending in ?
      if (!questionText) {
        const allEls = document.querySelectorAll('p, span, div, label, h3, h4, h5');
        for (const el of allEls) {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          const t = el.innerText?.trim();
          if (t && t.endsWith('?') && t.length > 10 && t.length < 300) {
            questionText = t;
            break;
          }
        }
      }

      // Get radio options with their labels
      const radioOptions = radios.map(r => {
        const id = r.id;
        const forLabel = id ? document.querySelector(`label[for="${id}"]`) : null;
        const parentLabel = r.closest('label');
        const siblingSpan = r.nextElementSibling;
        return {
          value: r.value || '',
          label: (forLabel?.innerText || parentLabel?.innerText || siblingSpan?.innerText || r.value || '').trim()
        };
      });

      return {
        hasRadios: radios.length > 0,
        radioOptions,
        hasTextInput: textInputs.length > 0,
        hasActionBtn: !!actionBtn,
        actionBtnText: actionBtn?.innerText?.trim() || null,
        questionText,
        done: radios.length === 0 && textInputs.length === 0 && !actionBtn,
      };
    });

    // ── All questions answered — sidebar closed ───────────────────────────────
    if (state.done) {
      console.log("  ✅ No more questions — sidebar closed, all jobs applied!");
      break;
    }

    console.log(`\n  🔄 Round ${round}: Q="${state.questionText || '(reading...)'}"`);

    // ── Handle radio question ─────────────────────────────────────────────────
    if (state.hasRadios && state.radioOptions.length > 0) {
      const options = state.radioOptions.map(r => r.label).filter(Boolean);
      console.log(`    Options: [${options.join(' | ')}]`);

      let answer = "Yes"; // sensible default
      if (state.questionText) {
        answer = await answerQuestion(
          { label: state.questionText, type: "radio", options },
          profile
        );
      }

      // Find the best matching option index
      const ansLower = answer.toLowerCase();
      let bestIdx = 0; // default to first
      for (let i = 0; i < options.length; i++) {
        const optLower = options[i].toLowerCase();
        if (optLower === ansLower || optLower.includes(ansLower) || ansLower.includes(optLower)) {
          bestIdx = i;
          break;
        }
      }

      // Click via JS (bypasses custom styling interception)
      await page.evaluate((idx) => {
        const radios = Array.from(document.querySelectorAll('input[type="radio"]'))
          .filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 || el.offsetParent !== null;
          });
        const radio = radios[idx];
        if (!radio) return;
        // Try label click first (most reliable for custom styled radios)
        const id = radio.id;
        const label = (id && document.querySelector(`label[for="${id}"]`)) || radio.closest('label');
        if (label) label.click();
        else { radio.checked = true; radio.dispatchEvent(new Event('change', {bubbles:true})); }
      }, bestIdx);

      console.log(`    ↪ Selected: "${options[bestIdx]}"`);
    }

    // ── Handle text input ─────────────────────────────────────────────────────
    else if (state.hasTextInput) {
      const answer = state.questionText
        ? await answerQuestion({ label: state.questionText, type: "text", options: [] }, profile)
        : "";

      await page.evaluate((text) => {
        const inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="number"], textarea'))
          .filter(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
          });
        const input = inputs[0];
        if (!input) return;
        input.focus();
        input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, answer);

      console.log(`    ↪ Typed: "${answer}"`);
    }

    // ── Click Save / Next / Apply ─────────────────────────────────────────────
    if (state.hasActionBtn) {
      await page.waitForTimeout(400);
      const clicked = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b =>
          /^(Save|Apply|Submit|Continue|Next|Done)$/i.test(b.innerText.trim()) && !b.disabled
        );
        if (btn) { btn.click(); return true; }
        return false;
      });
      if (clicked) console.log(`    ↪ Clicked "${state.actionBtnText}"`);
      else console.log("    ⚠️  Action button disappeared before click");
    } else {
      console.log("    ⚠️  No Save/Next button visible — waiting...");
      await page.waitForTimeout(1000);
    }
  }

  // ── Log results ──────────────────────────────────────────────────────────────
  const stats = { applied: 0, skipped: 0, errors: 0 };
  for (const job of selectedJobs) {
    await logJob({ ...job, status: "applied", notes: "Applied via multi-apply Q&A" });
    stats.applied++;
  }
  console.log(`\n  🎉 Logged ${stats.applied} jobs as applied`);
  return stats;
}

// ─── CLOSE SIDEBAR ────────────────────────────────────────────────────────────

async function closeSidebar() {
  const closeBtn = page.locator(
    "[role='dialog'] button[aria-label='Close'], " +
    "[class*='applyModal'] .close, " +
    "[class*='closeBtn'], button.close"
  ).first();
  const visible = await closeBtn.isVisible().catch(() => false);
  if (visible) {
    await closeBtn.click();
    await page.waitForTimeout(500);
  }
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────

module.exports = {
  launchBrowser,
  login,
  selectJobs,
  clickApplyButton,
  handleAllApplications,
  getPage: () => page,
  getBrowser: () => browser,
};
