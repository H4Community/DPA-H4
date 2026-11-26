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
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function startLocalServer() {
  const receivedRequests = [];
  let endpointMode = "fail-network"; // fail-network | fail-500 | ok

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
        if (endpointMode === "fail-500") {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Temporary server issue. Please try again." }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, saved: true, leadId: "TEST-TUTORIAL-001" }));
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
      desc: tutorialCard.querySelector(".groove-desc")?.textContent.trim(),
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

  // 2. Test preserving previously entered form values + Tutorial CTA navigation & preselection
  const navResult = await evalInPage(cdp, `
    document.getElementById("teacherName").value = "Ms. Maya Chen";
    document.getElementById("schoolName").value = "Maple Ridge Public School / TDSB";
    document.getElementById("targetMonth").value = "March 2027";
    // Turn on Calm Motion first so scroll is deterministic, then click CTA
    document.body.classList.add("calm-motion");
    document.getElementById("requestTutorialPromoCta").click();
    await new Promise((r) => setTimeout(r, 200));
    const topbarBottom = document.querySelector(".topbar").getBoundingClientRect().bottom;
    const headingRect = document.getElementById("teacher-tutorial-heading").getBoundingClientRect();
    document.body.classList.remove("calm-motion");
    return {
      selectedInterest: window.__h4TeacherForm.getSelectedInquiryType(),
      teacherName: document.getElementById("teacherName").value,
      schoolName: document.getElementById("schoolName").value,
      targetMonth: document.getElementById("targetMonth").value,
      headingVisibleBelowTopbar: headingRect.top >= topbarBottom - 2 && headingRect.top < window.innerHeight,
      headingText: document.getElementById("teacher-tutorial-heading").textContent.trim(),
      explainerText: document.getElementById("teacher-tutorial-section").textContent.replace(/\\s+/g, " ").trim(),
      submitText: document.getElementById("workshopSubmitBtn").textContent.trim()
    };
  `);

  assert.equal(navResult.selectedInterest, "Free Online Dance Tutorial");
  assert.equal(navResult.teacherName, "Ms. Maya Chen", "Previously entered teacher name must be preserved");
  assert.equal(navResult.schoolName, "Maple Ridge Public School / TDSB", "Previously entered school must be preserved");
  assert.equal(navResult.targetMonth, "March 2027", "Previously selected month must be preserved");
  assert.equal(navResult.headingVisibleBelowTopbar, true, "Tutorial heading must remain visible below sticky header");
  assert.equal(navResult.headingText, "Teach Dance with Confidence.");
  assert.ok(navResult.explainerText.includes("No dance experience? No problem!"));
  assert.ok(navResult.explainerText.includes("Learn the 10 foundational dance moves."));
  assert.ok(navResult.explainerText.includes("Designed for educators. No dance experience required."));
  assert.equal(navResult.submitText, "Request Your Free Online Tutorial →");

  // Capture Desktop Tutorial Explanation + Preselected Form screenshot
  const deskFormShot = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, "desktop-tutorial-section.png"), Buffer.from(deskFormShot.data, "base64"));

  // 3. Test default production mailto workflow for both Tutorial and Workshop inquiries + validation
  const mailtoCheck = await evalInPage(cdp, `
    // Clear name to verify validation error & aria-invalid
    document.getElementById("teacherName").value = "";
    document.getElementById("workshopForm").requestSubmit();
    await new Promise((r) => setTimeout(r, 80));
    const errVisible = !document.getElementById("formError").hidden;
    const nameInvalid = document.getElementById("teacherName").getAttribute("aria-invalid");

    // Fill name back and submit Tutorial mailto flow
    document.getElementById("teacherName").value = "Ms. Maya Chen";
    document.getElementById("workshopForm").requestSubmit();
    await new Promise((r) => setTimeout(r, 80));
    const tutorialHref = decodeURIComponent(document.getElementById("formMailtoLink").getAttribute("href"));
    const tutorialReadyBody = document.getElementById("formReadyBody").textContent;

    // Click Edit Request — verify values preserved, switch to Workshop, submit
    document.getElementById("formEditBtn").click();
    const preservedAfterEdit = document.getElementById("teacherName").value === "Ms. Maya Chen" &&
      document.getElementById("schoolName").value === "Maple Ridge Public School / TDSB";
    document.getElementById("interestWorkshop").checked = true;
    document.getElementById("interestWorkshop").dispatchEvent(new Event("change"));
    document.getElementById("workshopForm").requestSubmit();
    await new Promise((r) => setTimeout(r, 80));
    const workshopHref = decodeURIComponent(document.getElementById("formMailtoLink").getAttribute("href"));
    document.getElementById("formEditBtn").click();
    return { errVisible, nameInvalid, tutorialHref, tutorialReadyBody, preservedAfterEdit, workshopHref };
  `);

  assert.equal(mailtoCheck.errVisible, true, "Validation error should show when required field is blank");
  assert.equal(mailtoCheck.nameInvalid, "true", "Invalid field must set aria-invalid='true'");
  assert.ok(mailtoCheck.tutorialHref.includes("H4 Free Online Dance Tutorial Request"), "Tutorial mailto subject must identify tutorial");
  assert.ok(mailtoCheck.tutorialHref.includes("Interest: Free Online Dance Tutorial"), "Tutorial mailto body must include tutorial interest");
  assert.ok(mailtoCheck.tutorialReadyBody.includes("Thanks for reaching out! H4 will be in touch to help you get started with the dance warm-up."));
  assert.equal(mailtoCheck.preservedAfterEdit, true, "Edit Request must preserve entered form values");
  assert.ok(mailtoCheck.workshopHref.includes("H4 Full-Day Dance Workshop Inquiry"), "Workshop inquiry flow must remain intact");
  assert.ok(mailtoCheck.workshopHref.includes("Interest: Full-Day School Workshop"));

  // 4. Test isolated async backend failure -> retry -> confirmed save flow
  await evalInPage(cdp, `
    document.getElementById("requestTutorialPromoCta").click();
    document.getElementById("workshopForm").setAttribute("data-endpoint", "${srv.baseUrl}/__mock_teacher_submit");
  `);
  // 4a. Network failure must NOT show success and must preserve values
  srv.setMode("fail-network");
  const failNet = await evalInPage(cdp, `
    document.getElementById("workshopForm").requestSubmit();
    await new Promise((r) => setTimeout(r, 200));
    return {
      successHidden: document.getElementById("formReadyPanel").hidden,
      errorVisible: !document.getElementById("formError").hidden,
      nameKept: document.getElementById("teacherName").value
    };
  `);
  assert.equal(failNet.successHidden, true, "Network failure must not display success");
  assert.equal(failNet.errorVisible, true, "Network failure must show retryable error");
  assert.equal(failNet.nameKept, "Ms. Maya Chen");

  // 4b. HTTP 500 failure must NOT show success
  srv.setMode("fail-500");
  const fail500 = await evalInPage(cdp, `
    document.getElementById("workshopForm").requestSubmit();
    await new Promise((r) => setTimeout(r, 200));
    return {
      successHidden: document.getElementById("formReadyPanel").hidden,
      errorText: document.getElementById("formError").textContent
    };
  `);
  assert.equal(fail500.successHidden, true, "HTTP 500 must not display success");
  assert.ok(fail500.errorText.includes("Temporary server issue"));

  // 4c. Retry with confirmed 200 { ok: true, saved: true }
  srv.setMode("ok");
  const okSave = await evalInPage(cdp, `
    document.getElementById("workshopForm").requestSubmit();
    await new Promise((r) => setTimeout(r, 200));
    return {
      successVisible: !document.getElementById("formReadyPanel").hidden,
      title: document.getElementById("formReadyTitle").textContent,
      body: document.getElementById("formReadyBody").textContent
    };
  `);
  assert.equal(okSave.successVisible, true, "Confirmed backend save must display success");
  assert.equal(
    okSave.body,
    "Thanks for reaching out! H4 will be in touch to help you get started with the dance warm-up."
  );
  const okReqs = srv.receivedRequests.filter((r) => r.mode === "ok");
  const fail500Reqs = srv.receivedRequests.filter((r) => r.mode === "fail-500");
  const failNetReqs = srv.receivedRequests.filter((r) => r.mode === "fail-network");
  assert.ok(failNetReqs.length >= 1, "Expected at least 1 network-failure attempt");
  assert.equal(fail500Reqs.length, 1, "Expected exactly 1 HTTP 500 attempt");
  assert.equal(okReqs.length, 1, "Expected exactly 1 confirmed OK attempt");
  assert.equal(okReqs[0].payload.interest, "Free Online Dance Tutorial");
  assert.equal(okReqs[0].payload.teacherName, "Ms. Maya Chen");

  // Reset form back to default production state for tablet & mobile screenshots
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

  await evalInPage(cdp, `
    document.body.classList.add("calm-motion");
    document.getElementById("requestTutorialPromoCta").click();
    await new Promise((r) => setTimeout(r, 200));
    document.body.classList.remove("calm-motion");
  `);
  const mobFormShot = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, "mobile-tutorial-section.png"), Buffer.from(mobFormShot.data, "base64"));

  assert.deepEqual(pageErrors, [], `Unexpected page errors: ${JSON.stringify(pageErrors)}`);
  // Ignore expected simulated network error console entry from our fail-network test
  const unexpectedConsoleErrors = consoleErrors.filter(
    (msg) => !msg.includes("Failed to load resource") && !msg.includes("500")
  );
  assert.deepEqual(unexpectedConsoleErrors, [], `Unexpected console errors: ${JSON.stringify(unexpectedConsoleErrors)}`);
});
