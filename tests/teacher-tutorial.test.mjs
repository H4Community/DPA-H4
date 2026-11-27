import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const INDEX_HTML_PATH = path.join(REPO_ROOT, "index.html");
const SCREENSHOT_DIR = process.env.H4_SCREENSHOT_DIR
  ? path.resolve(process.env.H4_SCREENSHOT_DIR)
  : path.join(os.tmpdir(), "h4-dpa-tutorial-screenshots");

const CHROME_CANDIDATES = [
  process.env.H4_CHROME_BIN,
  "/usr/bin/chromium",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
];

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function findChromeBinary() {
  for (const p of CHROME_CANDIDATES) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function startLocalServer() {
  const receivedRequests = [];
  let endpointMode = "fail-network"; // fail-network | fail-500 | timeout | ok | ok-queued

  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (req.method === "POST" && urlPath === "/__mock_teacher_submit") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        const parsed = JSON.parse(body || "{}");
        receivedRequests.push({ mode: endpointMode, payload: parsed });
        if (endpointMode === "fail-network") {
          req.socket.destroy();
          return;
        }
        if (endpointMode === "timeout") {
          setTimeout(() => {
            if (!res.writableEnded) res.destroy();
          }, 1000);
          return;
        }
        if (endpointMode === "fail-500") {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Temporary server issue. Please try again." }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        const emailStatus = endpointMode === "ok-queued" ? "Queued" : "Sent";
        res.end(JSON.stringify({ ok: true, saved: true, leadId: "TEST-TUTORIAL-001", emailStatus }));
      });
      return;
    }

    const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
    const abs = path.resolve(REPO_ROOT, rel);
    if (!abs.startsWith(REPO_ROOT) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    const ext = path.extname(abs).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    fs.createReadStream(abs).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${port}`,
        receivedRequests,
        setMode(mode) { endpointMode = mode; }
      });
    });
  });
}

async function waitForDevToolsJson(port, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (resp.ok) {
        const list = await resp.json();
        const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
        if (page) return page.webSocketDebuggerUrl;
      }
    } catch (_) {
      // retry
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Timed out waiting for Chrome DevTools endpoint");
}

function createCdpClient(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map();
    const listeners = new Map();

    ws.addEventListener("open", () => {
      resolve({
        send(method, params = {}) {
          const id = nextId++;
          return new Promise((res, rej) => {
            pending.set(id, { res, rej });
            ws.send(JSON.stringify({ id, method, params }));
          });
        },
        on(event, fn) {
          if (!listeners.has(event)) listeners.set(event, []);
          listeners.get(event).push(fn);
        },
        close() {
          ws.close();
        }
      });
    });

    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message || JSON.stringify(msg.error)));
        else res(msg.result);
      } else if (msg.method && listeners.has(msg.method)) {
        for (const fn of listeners.get(msg.method)) fn(msg.params);
      }
    });

    ws.addEventListener("error", reject);
  });
}

async function evalInPage(cdp, expression) {
  const res = await cdp.send("Runtime.evaluate", {
    expression: `(async () => { ${expression} })()`,
    awaitPromise: true,
    returnByValue: true
  });
  if (res.exceptionDetails) {
    throw new Error(`Page eval error: ${JSON.stringify(res.exceptionDetails)}`);
  }
  return res.result?.value;
}

test("Inline JavaScript in index.html parses cleanly with zero syntax errors", () => {
  const html = fs.readFileSync(INDEX_HTML_PATH, "utf8");
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length >= 1, "Expected inline script in index.html");
  for (const [, code] of scripts) {
    if (!code.trim()) continue;
    assert.doesNotThrow(() => new vm.Script(code, { filename: "index.html" }));
  }
});

test("Free Teacher Tutorial card, layout, CTA, form preselection, payload, failure/retry, and screenshots pass in headless Chrome", async (t) => {
  const chromeBin = findChromeBinary();
  assert.ok(chromeBin, "Chrome or Edge binary is required for browser verification");

  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const srv = await startLocalServer();
  const debugPort = 9333 + Math.floor(Math.random() * 400);
  const userDataDir = path.join(SCREENSHOT_DIR, `chrome-profile-${Date.now()}`);
  const chrome = spawn(
    chromeBin,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      "about:blank"
    ],
    { stdio: "ignore" }
  );

  t.after(() => {
    try { chrome.kill(); } catch (_) {}
    try { srv.server.close(); } catch (_) {}
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
  });

  const wsUrl = await waitForDevToolsJson(debugPort);
  const cdp = await createCdpClient(wsUrl);
  t.after(() => cdp.close());

  const consoleErrors = [];
  const pageErrors = [];
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Console.enable");
  cdp.on("Runtime.exceptionThrown", (p) => pageErrors.push(p.exceptionDetails?.text || JSON.stringify(p)));
  cdp.on("Runtime.consoleAPICalled", (p) => {
    if (p.type === "error") consoleErrors.push(p.args.map((a) => a.value || a.description).join(" "));
  });

  // 1. Desktop 1440x900 hard-refresh load
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });
  await cdp.send("Page.navigate", { url: `${srv.baseUrl}/` });
  await new Promise((r) => setTimeout(r, 1200));

  const gridAudit = await evalInPage(cdp, `
    const grid = document.getElementById("groovesGrid");
    const children = Array.from(grid.children);
    const grooveCards = children.filter((el) => el.classList.contains("groove-card"));
    const promoCards = children.filter((el) => el.classList.contains("promo-card"));
    const titles = children.map((el) => el.querySelector(".groove-title")?.textContent.trim());
    const lastFourRects = children.slice(-4).map((el) => {
      const r = el.getBoundingClientRect();
      return {
        id: el.id || el.querySelector(".groove-title")?.textContent.trim(),
        top: Math.round(r.top),
        left: Math.round(r.left),
        width: Math.round(r.width),
        height: Math.round(r.height),
        artHeight: Math.round((el.querySelector(".groove-art, .promo-art"))?.getBoundingClientRect().height || 0),
        ctaBottom: Math.round((el.querySelector(".groove-btn"))?.getBoundingClientRect().bottom || 0)
      };
    });
    const tutorialCard = document.getElementById("teacherTutorialPromoCard");
    const dancestashCard = document.getElementById("dancestashPromoCard");
    const dancestashLink = dancestashCard.querySelector("a");
    const tutorialCta = document.getElementById("requestTutorialPromoCta");
    const svg = tutorialCard.querySelector("svg.promo-tutorial-svg");
    return {
      total: children.length,
      grooveCount: grooveCards.length,
      promoCount: promoCards.length,
      titles,
      lastFourRects,
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
      badges: Array.from(tutorialCard.querySelectorAll(".groove-num, .groove-tag")).map((e) => e.textContent.trim()),
      artLabel: tutorialCard.querySelector(".promo-brand-tutorial")?.textContent.trim(),
      desc: tutorialCard.querySelector(".groove-desc")?.textContent.replace(/\\s+/g, " ").trim(),
      ctaText: tutorialCta.textContent.replace(/\\s+/g, " ").trim(),
      ctaHeight: Math.round(tutorialCta.getBoundingClientRect().height),
      hasSoloIdxOnPromo: Boolean(tutorialCard.querySelector("[data-solo-idx]") || dancestashCard.querySelector("[data-solo-idx]")),
      svgAriaHidden: svg?.getAttribute("aria-hidden"),
      svgWidth: Math.round(svg?.getBoundingClientRect().width || 0),
      svgHeight: Math.round(svg?.getBoundingClientRect().height || 0),
      dancestashHref: dancestashLink?.getAttribute("href"),
      dancestashTarget: dancestashLink?.getAttribute("target")
    };
  `);

  assert.equal(gridAudit.total, 12, "Grid must have 12 total cards");
  assert.equal(gridAudit.grooveCount, 10, "Grid must have exactly 10 dance move cards");
  assert.equal(gridAudit.promoCount, 2, "Grid must have exactly 2 promotional cards");
  assert.deepEqual(gridAudit.titles.slice(-4), ["Roll", "Wave", "Need More Moves?", "Need a Little Help?"]);
  assert.equal(gridAudit.overflowX, false, "No horizontal overflow on desktop");
  assert.deepEqual(gridAudit.badges, ["BONUS", "For Teachers"]);
  assert.equal(gridAudit.artLabel, "FREE ONLINE TUTORIAL");
  assert.equal(
    gridAudit.desc,
    "Teachers! Need help leading the dance warm-up? We'll help you learn the moves, step by step."
  );
  assert.equal(gridAudit.ctaText, "Request a Free Tutorial ↓");
  assert.ok(gridAudit.ctaHeight >= 44, `Expected CTA height >= 44px, got ${gridAudit.ctaHeight}`);
  assert.equal(gridAudit.hasSoloIdxOnPromo, false, "Promo cards must be excluded from solo dance triggers");
  assert.equal(gridAudit.svgAriaHidden, "true", "Decorative SVG must have aria-hidden='true'");
  assert.ok(gridAudit.svgWidth > 100 && gridAudit.svgHeight > 80, "SVG illustration must render visibly");
  assert.equal(gridAudit.dancestashHref, "https://dancestash.space/");
  assert.equal(gridAudit.dancestashTarget, "_blank");

  // Confirm final row sits on one horizontal row with aligned card/media/CTA heights
  const tops = new Set(gridAudit.lastFourRects.map((r) => r.top));
  assert.equal(tops.size, 1, `Final 4 cards must align on one desktop row: ${JSON.stringify(gridAudit.lastFourRects)}`);
  const artHeights = new Set(gridAudit.lastFourRects.map((r) => r.artHeight));
  assert.equal(artHeights.size, 1, `Media heights must match: ${JSON.stringify(gridAudit.lastFourRects)}`);
  const cardHeights = new Set(gridAudit.lastFourRects.map((r) => r.height));
  assert.equal(cardHeights.size, 1, `Card heights must match: ${JSON.stringify(gridAudit.lastFourRects)}`);
  const ctaBottoms = new Set(gridAudit.lastFourRects.map((r) => r.ctaBottom));
  assert.equal(ctaBottoms.size, 1, `CTA bottoms must align: ${JSON.stringify(gridAudit.lastFourRects)}`);

  // Capture Desktop Grid Row screenshot (scroll to show last row with Roll, Wave, DanceStash, Free Online Tutorial)
  await evalInPage(cdp, `
    document.getElementById("teacherTutorialPromoCard").scrollIntoView({ block: "center", behavior: "instant" });
  `);
  await new Promise((r) => setTimeout(r, 250));
  const deskGridShot = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, "desktop-grid-promos.png"), Buffer.from(deskGridShot.data, "base64"));

  // 2. Direct visit starts with no choice selected; topbar & tutorial CTAs open matching paths directly
  const directState = await evalInPage(cdp, `
    const form = document.getElementById("workshopForm");
    const configuredEndpoint = (form.getAttribute("data-endpoint") || "").trim();
    return {
      configuredEndpoint,
      selectedInterest: window.__h4TeacherForm.getSelectedInquiryType(),
      chooserVisible: !document.getElementById("signupChooser").hidden,
      formHidden: form.hidden,
      choiceTexts: [...document.querySelectorAll("#signupChooser [data-interest-choice]")].map((b) => b.textContent.trim())
    };
  `);
  assert.match(directState.configuredEndpoint, /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/);
  assert.equal(directState.selectedInterest, "", "Direct visit must start with no choice selected");
  assert.equal(directState.chooserVisible, true, "Three choices must show up front on direct visit");
  assert.equal(directState.formHidden, true, "Form fields must stay hidden until a choice is selected");
  assert.deepEqual(directState.choiceTexts, [
    "Email Me the Free Videos",
    "Request Workshop Dates",
    "Learn more"
  ]);

  // Topbar workshop CTA opens Request Workshop Dates directly
  const topCtaResult = await evalInPage(cdp, `
    document.body.classList.add("calm-motion");
    document.getElementById("bookWorkshopTopCta").click();
    await new Promise((r) => setTimeout(r, 150));
    document.body.classList.remove("calm-motion");
    return {
      selectedInterest: window.__h4TeacherForm.getSelectedInquiryType(),
      heading: document.getElementById("bookingFormHeading").textContent.trim(),
      submitText: document.getElementById("workshopSubmitBtn").textContent.trim(),
      schoolDisabledInitially: document.getElementById("schoolSearch").disabled,
      optionalClosed: !document.getElementById("optionalWorkshopDetails").open
    };
  `);
  assert.equal(topCtaResult.selectedInterest, "Full-Day School Workshop");
  assert.equal(topCtaResult.heading, "Request Workshop Dates");
  assert.equal(topCtaResult.submitText, "Request Workshop Dates");
  assert.equal(topCtaResult.schoolDisabledInitially, true, "School picker must be disabled until board is selected");
  assert.equal(topCtaResult.optionalClosed, true, "Optional workshop details must start collapsed");

  // Fill workshop fields (name, email, role, TCDSB board, school, optional details), then click Free Tutorial CTA
  const navResult = await evalInPage(cdp, `
    const update = (el, type, val) => {
      el.value = val;
      el.dispatchEvent(new Event(type, { bubbles: true }));
    };
    update(document.getElementById("teacherName"), "input", "Ms. Maya Chen");
    update(document.getElementById("teacherEmail"), "input", "maya@example.org");
    update(document.getElementById("signupRole"), "change", "Teacher");
    window.__h4TeacherForm.selectBoardById("B67059");
    window.__h4TeacherForm.selectSchoolById("733024");
    document.querySelector('[name=grades][value="6"]').checked = true;
    document.getElementById("targetMonth").value = "March 2027";
    document.getElementById("teacherPhone").value = "416-555-0199";
    document.getElementById("teacherInstagram").value = "@h4dance";
    document.body.classList.add("calm-motion");
    document.getElementById("requestTutorialPromoCta").click();
    await new Promise((r) => setTimeout(r, 200));
    const topbarBottom = document.querySelector(".topbar").getBoundingClientRect().bottom;
    const formHeading = document.getElementById("bookingFormHeading");
    const headingRect = formHeading.getBoundingClientRect();
    const activeId = document.activeElement?.id || "";
    const workshopBoardDidNotCarryOver = document.getElementById("boardId").value === "" &&
      document.getElementById("schoolId").value === "";
    document.body.classList.remove("calm-motion");
    return {
      selectedInterest: window.__h4TeacherForm.getSelectedInquiryType(),
      teacherNameValuePreserved: document.getElementById("teacherName").value,
      fullNameHidden: document.getElementById("fullNameField").hidden,
      emailPreserved: document.getElementById("teacherEmail").value,
      rolePreserved: document.getElementById("signupRole").value,
      optionalSchoolVisible: !document.getElementById("optionalSchoolDetails").hidden,
      optionalSchoolCollapsed: !document.getElementById("optionalSchoolDetails").open,
      optionalWorkshopHidden: document.getElementById("optionalWorkshopDetails").hidden,
      workshopBoardDidNotCarryOver,
      formHeadingFocused: activeId === "bookingFormHeading",
      headingVisibleBelowTopbar: headingRect.top >= topbarBottom - 2 && headingRect.bottom <= window.innerHeight,
      formHeadingText: formHeading.textContent.trim(),
      explainerText: document.getElementById("teacher-tutorial-section").textContent.replace(/\\s+/g, " ").trim(),
      submitText: document.getElementById("workshopSubmitBtn").textContent.trim()
    };
  `);

  assert.equal(navResult.selectedInterest, "Free Online Dance Tutorial");
  assert.equal(navResult.teacherNameValuePreserved, "Ms. Maya Chen", "Entered name must be preserved in memory when switching");
  assert.equal(navResult.fullNameHidden, true, "Full name field must be hidden on Free Videos");
  assert.equal(navResult.emailPreserved, "maya@example.org");
  assert.equal(navResult.rolePreserved, "Teacher");
  assert.equal(navResult.optionalSchoolVisible, true, "Staff must see collapsed Add your school (optional)");
  assert.equal(navResult.optionalSchoolCollapsed, true, "Add your school (optional) must start collapsed");
  assert.equal(navResult.optionalWorkshopHidden, true);
  assert.equal(navResult.workshopBoardDidNotCarryOver, true, "Workshop school must not carry over to Free Videos");
  assert.equal(navResult.formHeadingFocused, true, "Free tutorial CTA must focus the form heading");
  assert.equal(navResult.headingVisibleBelowTopbar, true, "Form heading must land visibly below sticky header");
  assert.equal(navResult.formHeadingText, "Get the Free Dance Videos");
  assert.ok(navResult.explainerText.includes("Teachers, We've Got You!"));
  assert.ok(navResult.explainerText.includes("Learn the 10 foundational hip-hop moves."));
  assert.ok(navResult.explainerText.includes("Request Your Free Teacher Tutorial"));
  assert.equal(navResult.submitText, "Email Me the Free Videos");

  // Capture Desktop Tutorial Explanation + Preselected Form screenshot
  const deskFormShot = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, "desktop-tutorial-section.png"), Buffer.from(deskFormShot.data, "base64"));

  // 3. Verify single searchable pickers (TCDSB, acronym aliases, keyboard selection, no-results, board change clears school, manual entry, unconfigured endpoint)
  const pickerCheck = await evalInPage(cdp, `
    const update = (element, type, value) => {
      element.value = value;
      element.dispatchEvent(new Event(type, { bubbles: true }));
    };
    const form = document.getElementById("workshopForm");
    form.setAttribute("data-endpoint", "");
    const boardSearch = document.getElementById("boardSearch");
    const boardId = document.getElementById("boardId");
    const boardListbox = document.getElementById("boardListbox");
    const schoolSearch = document.getElementById("schoolSearch");
    const schoolId = document.getElementById("schoolId");
    const schoolListbox = document.getElementById("schoolListbox");
    const role = document.getElementById("signupRole");
    const message = document.getElementById("formError");

    // Parent on Free Videos sees ONLY email & role (Add your school hidden)
    update(role, "change", "Parent / Caregiver");
    const parentNoSchool = document.getElementById("optionalSchoolDetails").hidden &&
      document.getElementById("signupSchoolDetails").hidden;

    // Switch via Change choice -> Request Workshop Dates (name/email/role preserved!)
    document.getElementById("changeChoiceBtn").click();
    document.getElementById("choiceWorkshopBtn").click();
    const preservedOnSwitch = document.getElementById("teacherName").value === "Ms. Maya Chen" &&
      document.getElementById("teacherEmail").value === "maya@example.org" &&
      role.value === "Parent / Caregiver";
    update(role, "change", "Teacher");

    // Search aliases PDSB, YCDSB, YRDSB, DDSB
    const aliasMatches = {};
    for (const alias of ["PDSB", "YCDSB", "YRDSB", "DDSB"]) {
      update(boardSearch, "input", alias);
      aliasMatches[alias] = [...boardListbox.querySelectorAll('[role="option"]')].map((o) => o.dataset.value);
    }

    // No-results message for gibberish board query
    update(boardSearch, "input", "zzzznotaboard");
    const boardNoResults = boardListbox.textContent.includes("No matching school boards found.");

    // Search TCDSB and pick via keyboard Enter
    update(boardSearch, "input", "TCDSB");
    const tcdsbOptions = [...boardListbox.querySelectorAll('[role="option"]')].map((o) => o.dataset.value);
    boardSearch.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    const tcdsbSelected = boardId.value === "B67059" && !schoolSearch.disabled;

    // Search Saint Mother Teresa inside TCDSB only, then pick via click
    update(schoolSearch, "input", "Saint Mother Teresa");
    const matchingSchools = [...schoolListbox.querySelectorAll('[role="option"]')].map((o) => o.dataset.value);
    schoolListbox.querySelector('[data-value="733024"]').click();
    const schoolSelected = schoolId.value === "733024";

    // Change board to TDSB -> must clear selected school & only list TDSB schools
    update(boardSearch, "input", "TDSB");
    boardSearch.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    const boardChangeClearedSchool = !schoolId.value && !schoolSearch.value;
    update(schoolSearch, "input", "Mother Teresa");
    const schoolNoResults = schoolListbox.textContent.includes("No matching schools found.") &&
      ![...schoolListbox.querySelectorAll('[role="option"]')].some((o) => o.dataset.value === "733024");

    // Manual school entry via My school isn't listed and Independent school / Other
    schoolListbox.querySelector('[data-value="manual"]').click();
    const manualRequired = !document.getElementById("manualSchoolField").hidden && document.getElementById("schoolName").required;
    window.__h4TeacherForm.selectBoardById("other");
    const otherHidesSchoolPicker = document.getElementById("schoolPicker").hidden && document.getElementById("schoolName").required;
    update(document.getElementById("schoolName"), "input", "St. Custom Academy");
    // Switch Workshop -> Learn More -> Workshop: manual school name must be preserved
    document.getElementById("changeChoiceBtn").click();
    document.getElementById("choiceLearnMoreBtn").click();
    document.getElementById("changeChoiceBtn").click();
    document.getElementById("choiceWorkshopBtn").click();
    const manualPreservedAcrossLearnMore = document.getElementById("boardId").value === "other" &&
      !document.getElementById("manualSchoolField").hidden &&
      document.getElementById("schoolName").value === "St. Custom Academy";
    // Switch Workshop -> Free Videos: manual school must NOT carry over to Free Videos
    document.getElementById("changeChoiceBtn").click();
    document.getElementById("choiceFreeVideosBtn").click();
    const manualIsolatedFromFreeVideos = document.getElementById("boardId").value === "" &&
      document.getElementById("schoolName").value === "";
    // Switch back to Workshop: manual school still intact
    document.getElementById("changeChoiceBtn").click();
    document.getElementById("choiceWorkshopBtn").click();
    const manualStillIntactOnWorkshop = document.getElementById("schoolName").value === "St. Custom Academy";

    // Re-select TCDSB + St Mother Teresa and verify validation & unconfigured endpoint message
    window.__h4TeacherForm.selectBoardById("B67059");
    window.__h4TeacherForm.selectSchoolById("733024");
    document.getElementById("teacherName").value = "";
    form.requestSubmit();
    const requiredName = !message.hidden && document.getElementById("teacherName").getAttribute("aria-invalid") === "true";
    update(document.getElementById("teacherName"), "input", "Ms. Maya Chen");
    form.requestSubmit();
    return {
      parentNoSchool, preservedOnSwitch, aliasMatches, boardNoResults, tcdsbOptions, tcdsbSelected,
      matchingSchools, schoolSelected, boardChangeClearedSchool, schoolNoResults,
      manualRequired, otherHidesSchoolPicker, manualPreservedAcrossLearnMore,
      manualIsolatedFromFreeVideos, manualStillIntactOnWorkshop, requiredName,
      unavailable: message.textContent.includes("temporarily unavailable"),
      successHidden: document.getElementById("formReadyPanel").hidden
    };
  `);
  assert.equal(pickerCheck.parentNoSchool, true);
  assert.equal(pickerCheck.preservedOnSwitch, true);
  assert.ok(pickerCheck.aliasMatches.PDSB.includes("B66125"), "PDSB alias must match Peel DSB");
  assert.ok(pickerCheck.aliasMatches.YCDSB.includes("B67075"), "YCDSB alias must match York CDSB");
  assert.ok(pickerCheck.aliasMatches.YRDSB.includes("B66095"), "YRDSB alias must match York Region DSB");
  assert.ok(pickerCheck.aliasMatches.DDSB.includes("B66060"), "DDSB alias must match Durham DSB");
  assert.equal(pickerCheck.boardNoResults, true);
  assert.deepEqual(pickerCheck.tcdsbOptions, ["B67059", "other"]);
  assert.equal(pickerCheck.tcdsbSelected, true);
  assert.deepEqual(pickerCheck.matchingSchools, ["733024", "manual"]);
  assert.equal(pickerCheck.schoolSelected, true);
  assert.equal(pickerCheck.boardChangeClearedSchool, true, "Changing board must clear selected school");
  assert.equal(pickerCheck.schoolNoResults, true);
  assert.equal(pickerCheck.manualRequired, true);
  assert.equal(pickerCheck.otherHidesSchoolPicker, true);
  assert.equal(pickerCheck.manualPreservedAcrossLearnMore, true, "Manual school name must survive Workshop -> Learn More -> Workshop");
  assert.equal(pickerCheck.manualIsolatedFromFreeVideos, true, "Workshop manual school must not carry over to Free Videos");
  assert.equal(pickerCheck.manualStillIntactOnWorkshop, true, "Workshop manual school must remain intact after visiting Free Videos");
  assert.equal(pickerCheck.requiredName, true);
  assert.equal(pickerCheck.unavailable, true);
  assert.equal(pickerCheck.successHidden, true);

  // 4. Test all 3 live-mocked submission paths, hidden-field isolation, queued vs sent copy, and retry deduplication
  await evalInPage(cdp, `
    document.getElementById("workshopForm").setAttribute("data-endpoint", "${srv.baseUrl}/__mock_teacher_submit");
  `);

  // 4a. Switching from Workshop (with school/grades/phone/name filled) to Free Videos (collapsed optional school)
  // must NOT submit hidden fields, and retry flow (fail-network -> fail-500 -> timeout -> ok) must reuse same submissionKey
  await evalInPage(cdp, `
    document.getElementById("changeChoiceBtn").click();
    document.getElementById("choiceFreeVideosBtn").click();
  `);
  srv.setMode("fail-network");
  const failNet = await evalInPage(cdp, `
    document.getElementById("workshopForm").requestSubmit();
    await new Promise((r) => setTimeout(r, 200));
    return {
      successHidden: document.getElementById("formReadyPanel").hidden,
      errorVisible: !document.getElementById("formError").hidden,
      emailKept: document.getElementById("teacherEmail").value
    };
  `);
  assert.equal(failNet.successHidden, true);
  assert.equal(failNet.errorVisible, true);
  assert.equal(failNet.emailKept, "maya@example.org");

  srv.setMode("fail-500");
  const fail500 = await evalInPage(cdp, `
    document.getElementById("workshopForm").requestSubmit();
    await new Promise((r) => setTimeout(r, 200));
    return {
      successHidden: document.getElementById("formReadyPanel").hidden,
      errorText: document.getElementById("formError").textContent
    };
  `);
  assert.equal(fail500.successHidden, true);
  assert.ok(fail500.errorText.includes("Please try again"));

  srv.setMode("timeout");
  const failTimeout = await evalInPage(cdp, `
    window.H4_TEACHER_FORM_CONFIG = { timeoutMs: 120 };
    document.getElementById("workshopForm").requestSubmit();
    await new Promise((r) => setTimeout(r, 250));
    delete window.H4_TEACHER_FORM_CONFIG;
    return {
      successHidden: document.getElementById("formReadyPanel").hidden,
      errorVisible: !document.getElementById("formError").hidden,
      errorText: document.getElementById("formError").textContent,
      emailKept: document.getElementById("teacherEmail").value
    };
  `);
  assert.equal(failTimeout.successHidden, true);
  assert.equal(failTimeout.errorVisible, true);
  assert.ok(failTimeout.errorText.includes("timed out"));
  assert.equal(failTimeout.emailKept, "maya@example.org");

  srv.setMode("ok");
  const teacherFreeSave = await evalInPage(cdp, `
    document.getElementById("workshopForm").requestSubmit();
    await new Promise((r) => setTimeout(r, 200));
    return {
      successVisible: !document.getElementById("formReadyPanel").hidden,
      body: document.getElementById("formReadyBody").textContent
    };
  `);
  assert.equal(teacherFreeSave.successVisible, true);
  assert.equal(teacherFreeSave.body, "Thanks! Check your inbox for an email from H4 Community.");

  const retryAttempts = srv.receivedRequests.slice();
  assert.ok(retryAttempts.length >= 4, "Expected network, 500, timeout, and ok attempts");
  assert.equal(new Set(retryAttempts.map((r) => r.payload.submissionKey)).size, 1, "Retries must reuse the exact same submissionKey");
  const teacherFreePayload = retryAttempts.at(-1).payload;
  assert.equal(teacherFreePayload.interest, "Free Online Dance Tutorial");
  assert.equal(teacherFreePayload.role, "Teacher");
  assert.equal(teacherFreePayload.email, "maya@example.org");
  assert.equal(teacherFreePayload.fullName, "", "Hidden fullName from Workshop must NOT leak into Free Videos");
  assert.equal(teacherFreePayload.boardId, "", "Collapsed school from Workshop must NOT leak into Free Videos");
  assert.equal(teacherFreePayload.schoolId, "");
  assert.deepEqual(teacherFreePayload.grades, [], "Hidden grades from Workshop must NOT leak into Free Videos");
  assert.equal(teacherFreePayload.phone, "");
  assert.equal(teacherFreePayload.instagram, "");

  // 4b. Parent Free Videos with only email + role and Queued email response (must NOT say "Check your inbox")
  srv.setMode("ok-queued");
  const parentQueued = await evalInPage(cdp, `
    const update = (el, type, val) => { el.value = val; el.dispatchEvent(new Event(type, { bubbles: true })); };
    document.getElementById("formEditBtn").click();
    document.getElementById("choiceFreeVideosBtn").click();
    update(document.getElementById("teacherEmail"), "input", "parent@example.org");
    update(document.getElementById("signupRole"), "change", "Parent / Caregiver");
    const onlyTwoFieldsVisible = document.getElementById("fullNameField").hidden &&
      document.getElementById("optionalSchoolDetails").hidden &&
      document.getElementById("signupSchoolDetails").hidden;
    document.getElementById("workshopForm").requestSubmit();
    await new Promise((r) => setTimeout(r, 200));
    return {
      onlyTwoFieldsVisible,
      body: document.getElementById("formReadyBody").textContent
    };
  `);
  assert.equal(parentQueued.onlyTwoFieldsVisible, true);
  assert.ok(!parentQueued.body.includes("Check your inbox"), "Queued email must not claim Check your inbox");
  assert.ok(parentQueued.body.includes("saved") && parentQueued.body.includes("queued"));
  const parentPayload = srv.receivedRequests.at(-1).payload;
  assert.equal(parentPayload.interest, "Free Online Dance Tutorial");
  assert.equal(parentPayload.role, "Parent / Caregiver");
  assert.equal(parentPayload.fullName, "");
  assert.equal(parentPayload.boardId, "");

  // 4c. Workshop with TCDSB + St Mother Teresa + optional details, then switch to Learn More -> zero hidden fields submitted
  srv.setMode("ok");
  const learnMoreRes = await evalInPage(cdp, `
    const update = (el, type, val) => { el.value = val; el.dispatchEvent(new Event(type, { bubbles: true })); };
    document.getElementById("formEditBtn").click();
    document.getElementById("choiceWorkshopBtn").click();
    update(document.getElementById("teacherName"), "input", "Mr. Alex Patel");
    update(document.getElementById("teacherEmail"), "input", "alex@example.org");
    update(document.getElementById("signupRole"), "change", "Principal");
    window.__h4TeacherForm.selectBoardById("B67059");
    window.__h4TeacherForm.selectSchoolById("733024");
    document.getElementById("optionalWorkshopDetails").open = true;
    document.querySelector('[name=grades][value="7"]').checked = true;
    document.getElementById("teacherPhone").value = "416-555-0111";
    // Switch to Learn More without losing name, email, role
    document.getElementById("changeChoiceBtn").click();
    document.getElementById("choiceLearnMoreBtn").click();
    const submitLabel = document.getElementById("workshopSubmitBtn").textContent.trim();
    const preserved = document.getElementById("teacherName").value === "Mr. Alex Patel" &&
      document.getElementById("teacherEmail").value === "alex@example.org" &&
      document.getElementById("signupRole").value === "Principal";
    document.getElementById("workshopForm").requestSubmit();
    await new Promise((r) => setTimeout(r, 200));
    return { submitLabel, preserved, body: document.getElementById("formReadyBody").textContent };
  `);
  assert.equal(learnMoreRes.submitLabel, "Send My Request");
  assert.equal(learnMoreRes.preserved, true);
  assert.equal(learnMoreRes.body, "Thanks! Check your inbox for an email from H4 Community.");
  const learnMorePayload = srv.receivedRequests.at(-1).payload;
  assert.equal(learnMorePayload.interest, "Learn More");
  assert.equal(learnMorePayload.fullName, "Mr. Alex Patel");
  assert.equal(learnMorePayload.role, "Principal");
  assert.equal(learnMorePayload.boardId, "");
  assert.equal(learnMorePayload.schoolId, "");
  assert.deepEqual(learnMorePayload.grades, []);
  assert.equal(learnMorePayload.phone, "");

  // 4d. Full Workshop submit using TCDSB
  const workshopSubmitRes = await evalInPage(cdp, `
    const update = (el, type, val) => { el.value = val; el.dispatchEvent(new Event(type, { bubbles: true })); };
    document.getElementById("formEditBtn").click();
    document.getElementById("choiceWorkshopBtn").click();
    update(document.getElementById("teacherName"), "input", "Ms. Jordan Lee");
    update(document.getElementById("teacherEmail"), "input", "jordan@example.org");
    update(document.getElementById("signupRole"), "change", "Teacher");
    window.__h4TeacherForm.selectBoardById("B67059");
    window.__h4TeacherForm.selectSchoolById("733024");
    document.getElementById("workshopForm").requestSubmit();
    await new Promise((r) => setTimeout(r, 200));
    return { successVisible: !document.getElementById("formReadyPanel").hidden };
  `);
  assert.equal(workshopSubmitRes.successVisible, true);
  const workshopPayload = srv.receivedRequests.at(-1).payload;
  assert.equal(workshopPayload.interest, "Full-Day School Workshop");
  assert.equal(workshopPayload.boardId, "B67059");
  assert.equal(workshopPayload.schoolId, "733024");

  // Reset form back to default chooser state for tablet & mobile screenshots
  await evalInPage(cdp, `
    document.getElementById("workshopForm").setAttribute("data-endpoint", "");
    document.getElementById("formEditBtn").click();
  `);

  // 5. Verify Practice mode still opens cleanly for groove #10 (Wave) without promo interference
  const practiceCheck = await evalInPage(cdp, `
    document.querySelector('[data-solo-idx="9"]').click();
    await new Promise((r) => setTimeout(r, 150));
    const open = document.getElementById("playerModal").classList.contains("is-open");
    const title = document.getElementById("playerMoveTitle").textContent.trim();
    document.getElementById("closeModalBtn").click();
    return { open, title };
  `);
  assert.equal(practiceCheck.open, true, "Practice mode must open for Wave");
  assert.ok(practiceCheck.title.includes("WAVE"));

  // 6. Tablet 768x1024 layout check
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 768,
    height: 1024,
    deviceScaleFactor: 1,
    mobile: false
  });
  await new Promise((r) => setTimeout(r, 250));
  const tabletOverflow = await evalInPage(cdp, `return document.documentElement.scrollWidth > window.innerWidth;`);
  assert.equal(tabletOverflow, false, "No horizontal overflow at tablet 768x1024");

  // 7. Mobile 390x844 layout check & screenshots
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });
  await new Promise((r) => setTimeout(r, 300));
  const mobileAudit = await evalInPage(cdp, `
    const ds = document.getElementById("dancestashPromoCard").getBoundingClientRect();
    const tut = document.getElementById("teacherTutorialPromoCard").getBoundingClientRect();
    const cta = document.getElementById("requestTutorialPromoCta").getBoundingClientRect();
    return {
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
      tutorialAfterDanceStash: tut.top > ds.top,
      ctaHeight: Math.round(cta.height)
    };
  `);
  assert.equal(mobileAudit.overflowX, false, "No horizontal overflow at mobile 390x844");
  assert.equal(mobileAudit.tutorialAfterDanceStash, true, "Tutorial card must appear immediately after DanceStash on mobile");
  assert.ok(mobileAudit.ctaHeight >= 44, `Mobile CTA height must be >= 44px, got ${mobileAudit.ctaHeight}`);

  await evalInPage(cdp, `
    document.getElementById("dancestashPromoCard").scrollIntoView({ block: "start", behavior: "instant" });
    window.scrollBy(0, -140);
  `);
  await new Promise((r) => setTimeout(r, 250));
  const mobPromosShot = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, "mobile-promos.png"), Buffer.from(mobPromosShot.data, "base64"));

  // Tap actual Free Tutorial promo button on mobile and capture screenshot IMMEDIATELY before any manual scrolling
  const mobileTutorialLanding = await evalInPage(cdp, `
    document.body.classList.add("calm-motion");
    document.getElementById("requestTutorialPromoCta").click();
    await new Promise((r) => setTimeout(r, 200));
    const topbarBottom = document.querySelector(".topbar").getBoundingClientRect().bottom;
    const heading = document.getElementById("bookingFormHeading");
    const rect = heading.getBoundingClientRect();
    const activeId = document.activeElement?.id || "";
    document.body.classList.remove("calm-motion");
    return {
      interest: window.__h4TeacherForm.getSelectedInquiryType(),
      headingText: heading.textContent.trim(),
      focused: activeId === "bookingFormHeading",
      visibleBelowTopbar: rect.top >= topbarBottom - 2 && rect.bottom <= window.innerHeight,
      rectTop: Math.round(rect.top),
      topbarBottom: Math.round(topbarBottom)
    };
  `);
  const mobTutorialLandingShot = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, "mobile-tutorial-cta-landing.png"), Buffer.from(mobTutorialLandingShot.data, "base64"));
  assert.equal(mobileTutorialLanding.interest, "Free Online Dance Tutorial");
  assert.equal(mobileTutorialLanding.headingText, "Get the Free Dance Videos");
  assert.equal(mobileTutorialLanding.focused, true, "Mobile free tutorial button must focus the form heading");
  assert.equal(
    mobileTutorialLanding.visibleBelowTopbar,
    true,
    `Mobile Free Videos heading must be visible below sticky header (top=${mobileTutorialLanding.rectTop}, topbarBottom=${mobileTutorialLanding.topbarBottom})`
  );

  // Tap actual Workshop button in topbar on mobile and verify heading visibility + keyboard focus
  const mobileWorkshopLanding = await evalInPage(cdp, `
    window.scrollTo({ top: 0, behavior: "instant" });
    document.body.classList.add("calm-motion");
    document.getElementById("bookWorkshopTopCta").click();
    await new Promise((r) => setTimeout(r, 200));
    const topbarBottom = document.querySelector(".topbar").getBoundingClientRect().bottom;
    const heading = document.getElementById("bookingFormHeading");
    const rect = heading.getBoundingClientRect();
    const activeId = document.activeElement?.id || "";
    document.body.classList.remove("calm-motion");
    return {
      interest: window.__h4TeacherForm.getSelectedInquiryType(),
      headingText: heading.textContent.trim(),
      focused: activeId === "bookingFormHeading",
      visibleBelowTopbar: rect.top >= topbarBottom - 2 && rect.bottom <= window.innerHeight,
      rectTop: Math.round(rect.top),
      topbarBottom: Math.round(topbarBottom)
    };
  `);
  assert.equal(mobileWorkshopLanding.interest, "Full-Day School Workshop");
  assert.equal(mobileWorkshopLanding.headingText, "Request Workshop Dates");
  assert.equal(mobileWorkshopLanding.focused, true, "Mobile workshop button must focus the form heading");
  assert.equal(
    mobileWorkshopLanding.visibleBelowTopbar,
    true,
    `Mobile Workshop heading must be visible below sticky header (top=${mobileWorkshopLanding.rectTop}, topbarBottom=${mobileWorkshopLanding.topbarBottom})`
  );

  // Mobile optional-school regressions using mocked endpoint:
  // (a) Workshop school must NOT carry over to Free Videos
  // (b) Teacher with ONLY a board selected in optional school can still submit (incomplete school omitted)
  // (c) Teacher with a COMPLETE board+school selected on Free Videos submits it even after collapsing the section
  srv.setMode("ok");
  const mobileOptionalRes = await evalInPage(cdp, `
    const update = (el, type, val) => { el.value = val; el.dispatchEvent(new Event(type, { bubbles: true })); };
    const form = document.getElementById("workshopForm");
    form.setAttribute("data-endpoint", "${srv.baseUrl}/__mock_teacher_submit");

    // Put a school in Workshop first, then tap Free Tutorial button
    window.__h4TeacherForm.selectBoardById("B67059");
    window.__h4TeacherForm.selectSchoolById("733024");
    document.body.classList.add("calm-motion");
    document.getElementById("requestTutorialPromoCta").click();
    document.body.classList.remove("calm-motion");

    // Open optional school on Free Videos -> must NOT have Workshop's board/school carried over
    const optDetails = document.getElementById("optionalSchoolDetails");
    optDetails.open = true;
    const noCarryOver = document.getElementById("boardId").value === "" && document.getElementById("schoolId").value === "";

    // Select ONLY a board (no school) and submit with valid email + role
    update(document.getElementById("teacherEmail"), "input", "partial@example.org");
    update(document.getElementById("signupRole"), "change", "Teacher");
    window.__h4TeacherForm.selectBoardById("B67059");
    form.requestSubmit();
    await new Promise((r) => setTimeout(r, 200));
    const partialSaved = !document.getElementById("formReadyPanel").hidden;

    // Now start fresh on Free Videos, select COMPLETE board+school, collapse section, and submit
    document.getElementById("formEditBtn").click();
    document.getElementById("choiceFreeVideosBtn").click();
    update(document.getElementById("teacherEmail"), "input", "complete@example.org");
    update(document.getElementById("signupRole"), "change", "Teacher");
    optDetails.open = true;
    window.__h4TeacherForm.selectBoardById("B67059");
    window.__h4TeacherForm.selectSchoolById("733024");
    optDetails.open = false;
    form.requestSubmit();
    await new Promise((r) => setTimeout(r, 200));
    const collapsedCompleteSaved = !document.getElementById("formReadyPanel").hidden;

    form.setAttribute("data-endpoint", "");
    document.getElementById("formEditBtn").click();
    return { noCarryOver, partialSaved, collapsedCompleteSaved };
  `);
  assert.equal(mobileOptionalRes.noCarryOver, true, "Workshop school must not carry over into Free Videos optional section");
  assert.equal(mobileOptionalRes.partialSaved, true, "Teacher with only a board selected in optional school must succeed");
  assert.equal(mobileOptionalRes.collapsedCompleteSaved, true, "Complete Free Videos school selection must submit after collapsing");
  const mobileCompletePayload = srv.receivedRequests.at(-1).payload;
  const mobilePartialPayload = srv.receivedRequests.at(-2).payload;
  assert.equal(mobilePartialPayload.interest, "Free Online Dance Tutorial");
  assert.equal(mobilePartialPayload.email, "partial@example.org");
  assert.equal(mobilePartialPayload.boardId, "", "Incomplete optional school (board only) must be omitted");
  assert.equal(mobilePartialPayload.schoolId, "");
  assert.equal(mobilePartialPayload.schoolName, "");
  assert.equal(mobileCompletePayload.interest, "Free Online Dance Tutorial");
  assert.equal(mobileCompletePayload.email, "complete@example.org");
  assert.equal(mobileCompletePayload.boardId, "B67059", "Complete school entered on Free Videos must be included even after collapsing");
  assert.equal(mobileCompletePayload.schoolId, "733024");
  assert.equal(mobileCompletePayload.schoolName, "");

  // Capture mobile screenshots of Chooser, Free Videos, Workshop, and Learn More
  await evalInPage(cdp, `
    window.__h4TeacherForm.returnToChooser();
    document.getElementById("bookingCard").scrollIntoView({ block: "start", behavior: "instant" });
    window.scrollBy({ top: -155, behavior: "instant" });
  `);
  await new Promise((r) => setTimeout(r, 200));
  const mobChooserShot = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, "mobile-chooser.png"), Buffer.from(mobChooserShot.data, "base64"));

  await evalInPage(cdp, `
    document.getElementById("choiceFreeVideosBtn").click();
    document.getElementById("bookingCard").scrollIntoView({ block: "start", behavior: "instant" });
    window.scrollBy({ top: -155, behavior: "instant" });
  `);
  await new Promise((r) => setTimeout(r, 200));
  const mobFreeShot = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, "mobile-free-videos.png"), Buffer.from(mobFreeShot.data, "base64"));

  const mobileFormAudit = await evalInPage(cdp, `
    document.getElementById("changeChoiceBtn").click();
    document.getElementById("choiceWorkshopBtn").click();
    const card = document.getElementById("bookingCard");
    card.scrollIntoView({ block: "start", behavior: "instant" });
    window.scrollBy({ top: -155, behavior: "instant" });
    const form = document.getElementById("workshopForm");
    const inputs = [...form.querySelectorAll('#teacherName, #teacherEmail, #signupRole, #boardSearch, #schoolSearch')];
    return {
      fits: form.scrollWidth <= form.clientWidth && document.documentElement.scrollWidth <= window.innerWidth,
      heights: inputs.map((input) => input.offsetHeight)
    };
  `);
  assert.equal(mobileFormAudit.fits, true, "Mobile workshop form must have zero horizontal overflow");
  assert.ok(mobileFormAudit.heights.every((height) => height >= 48), `Expected mobile inputs >= 48px, got ${JSON.stringify(mobileFormAudit.heights)}`);
  await new Promise((r) => setTimeout(r, 200));
  const mobWorkshopShot = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, "mobile-workshop.png"), Buffer.from(mobWorkshopShot.data, "base64"));

  await evalInPage(cdp, `
    document.getElementById("changeChoiceBtn").click();
    document.getElementById("choiceLearnMoreBtn").click();
    document.getElementById("bookingCard").scrollIntoView({ block: "start", behavior: "instant" });
    window.scrollBy({ top: -155, behavior: "instant" });
  `);
  await new Promise((r) => setTimeout(r, 200));
  const mobLearnShot = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, "mobile-learn-more.png"), Buffer.from(mobLearnShot.data, "base64"));

  assert.deepEqual(pageErrors, [], `Unexpected page errors: ${JSON.stringify(pageErrors)}`);
  // Ignore expected simulated network error console entry from our fail-network test
  const unexpectedConsoleErrors = consoleErrors.filter(
    (msg) => !msg.includes("Failed to load resource") && !msg.includes("500")
  );
  assert.deepEqual(unexpectedConsoleErrors, [], `Unexpected console errors: ${JSON.stringify(unexpectedConsoleErrors)}`);
});
