import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { gmailUtilities, readGmailMessage } from "./gmail-test-helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

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
  ".webp": "image/webp",
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
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (req.method === "POST" && urlPath === "/__mock_ux_submit") {
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", () => {
        const parsed = JSON.parse(body || "{}");
        receivedRequests.push(parsed);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, saved: true, leadId: `DPA-${parsed.submissionKey}`, emailStatus: "Sent" }));
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
      resolve({ server, baseUrl: `http://127.0.0.1:${port}`, receivedRequests });
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
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Timed out waiting for Chrome DevTools endpoint");
}

function createCdpClient(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map();
    ws.addEventListener("open", () => {
      resolve({
        send(method, params = {}) {
          const id = nextId++;
          return new Promise((res, rej) => {
            pending.set(id, { res, rej });
            ws.send(JSON.stringify({ id, method, params }));
          });
        },
        close() { ws.close(); }
      });
    });
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
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

function createAppsScriptHarness() {
  const headers = [
    "Lead ID", "Submitted At", "Full Name", "School Board", "School", "Contact Email",
    "Phone Number", "Teacher Instagram", "Interest", "Grades", "Preferred Timing",
    "Status", "Next Follow-Up Date", "Notes", "Role", "Email Status", "Email Sent At",
    "Staff Notification Status", "Staff Notification Sent At"
  ];
  const rows = [];
  const messages = [];
  const properties = {
    SPREADSHEET_ID: "ux-test-sheet",
    H4_LEAD_NOTIFICATION_EMAIL: "staff@example.org"
  };
  const tab = {
    getLastColumn: () => headers.length,
    getLastRow: () => rows.length + 1,
    getMaxRows: () => 1000,
    getRange(startRow, column, count = 1, width = 1) {
      if (startRow === 1) return { getValues: () => [headers] };
      return {
        getValue: () => rows[startRow - 2][column - 1],
        setValue(value) { rows[startRow - 2][column - 1] = value; },
        getValues: () => rows.slice(startRow - 2, startRow - 2 + count)
          .map((r) => r.slice(column - 1, column - 1 + width)),
        createTextFinder(value) {
          let exactCase = true;
          const findAll = () => rows.slice(startRow - 2, startRow - 2 + count)
            .map((r, i) => [r[column - 1], i + startRow])
            .filter(([cur]) => exactCase ? cur === value : String(cur).toLowerCase() === String(value).toLowerCase())
            .map(([, row]) => ({ getRow: () => row }));
          return {
            matchEntireCell() { return this; },
            matchCase(m) { exactCase = m; return this; },
            findNext: () => findAll()[0],
            findAll
          };
        }
      };
    }
  };
  const context = vm.createContext({
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Date,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => properties[k] }) },
    SpreadsheetApp: {
      flush() {},
      openById: () => ({ getSheetByName: () => tab, getSpreadsheetTimeZone: () => "America/Toronto" })
    },
    Utilities: { ...gmailUtilities, formatDate: (d) => d.toISOString().slice(0, 19) },
    MailApp: { getRemainingDailyQuota: () => 100 },
    Gmail: { Users: { Messages: {
      send({ raw }) {
        const { message } = readGmailMessage(raw);
        messages.push(message);
        return { id: "gmail-" + messages.length };
      }
    } } },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput(value) { return { setMimeType: () => value }; }
    },
    Sheets: { Spreadsheets: { Values: {
      get(_id, range) {
        const match = /^'Teacher Leads'!(\d+):\1$/.exec(range);
        const row = rows[Number(match[1]) - 2];
        return { values: row ? [row] : [] };
      },
      update({ values: [row] }) {
        const copy = [...row];
        const dateIdx = headers.indexOf("Submitted At");
        copy[dateIdx] = new Date((copy[dateIdx] - 25569) * 86400000);
        rows.push(copy);
      }
    } } }
  });
  const load = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
  vm.runInContext(
    load("data/ontario-schools.js") + "\n" + load("apps-script/Code.gs") + "\n" + load("apps-script/Email.gs"),
    context
  );
  return {
    headers,
    rows,
    messages,
    post(payload) {
      return JSON.parse(context.doPost({ postData: { contents: JSON.stringify(payload) } }));
    }
  };
}

test("Mobile form UX: popular boards, alphabetical rest, school search, pathways, inline validation, multi-viewport, and Apps Script compatibility", async (t) => {
  const chromeBin = findChromeBinary();
  assert.ok(chromeBin, "Chrome or Edge binary is required");

  const srv = await startLocalServer();
  const debugPort = 9555 + Math.floor(Math.random() * 200);
  const userDataDir = path.join(os.tmpdir(), `h4-ux-test-${Date.now()}`);
  const chrome = spawn(chromeBin, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${userDataDir}`, "about:blank"
  ], { stdio: "ignore" });

  t.after(() => {
    try { chrome.kill(); } catch {}
    try { srv.server.close(); } catch {}
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  });

  const wsUrl = await waitForDevToolsJson(debugPort);
  const cdp = await createCdpClient(wsUrl);
  t.after(() => cdp.close());

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true
  });
  await cdp.send("Page.navigate", { url: `${srv.baseUrl}/` });
  await new Promise((r) => setTimeout(r, 1200));

  // 1. Popular boards ordering, no duplicates, alphabetical remaining boards, no auto-selection
  const boardAudit = await evalInPage(cdp, `
    document.getElementById("workshopForm").setAttribute("data-endpoint", "${srv.baseUrl}/__mock_ux_submit");
    document.getElementById("choiceWorkshopBtn").click();
    const boardSearch = document.getElementById("boardSearch");
    const boardListbox = document.getElementById("boardListbox");
    const initialBoardId = document.getElementById("boardId").value;
    const boardPlaceholder = boardSearch.placeholder;
    boardSearch.focus();
    boardSearch.click();

    const children = [...boardListbox.children];
    const groupLabels = children
      .filter((el) => el.classList.contains("combobox-group-label"))
      .map((el) => el.textContent.trim());
    const options = [...boardListbox.querySelectorAll('[role="option"]')];
    const optionValues = options.map((el) => el.dataset.value);
    const optionTexts = options.map((el) => el.textContent.trim());
    const popularIdx = children.findIndex((el) => el.textContent.trim() === "Popular school boards");
    const otherIdx = children.findIndex((el) => el.textContent.trim() === "All other school boards");
    const popularSlice = children.slice(popularIdx + 1, otherIdx).map((el) => el.dataset.value);
    const otherSlice = children
      .slice(otherIdx + 1)
      .filter((el) => el.getAttribute("role") === "option" && el.dataset.value !== "other")
      .map((el) => ({ id: el.dataset.value, name: H4_SCHOOL_DIRECTORY[el.dataset.value][0] }));
    const optionHeights = options.slice(0, 8).map((el) => Math.round(el.getBoundingClientRect().height));
    const listboxRect = boardListbox.getBoundingClientRect();

    return {
      initialBoardId,
      boardPlaceholder,
      groupLabels,
      popularSlice,
      otherSlice,
      optionValues,
      fallbackText: optionTexts.at(-1),
      fallbackId: optionValues.at(-1),
      optionHeights,
      listboxHeight: Math.round(listboxRect.height),
      viewportHeight: window.innerHeight
    };
  `);

  assert.equal(boardAudit.initialBoardId, "", "Must not auto-select any school board");
  assert.equal(boardAudit.boardPlaceholder, "Search board name or acronym...");
  assert.deepEqual(boardAudit.groupLabels, ["Popular school boards", "All other school boards"]);
  assert.deepEqual(boardAudit.popularSlice, [
    "B67059", // TCDSB
    "B66052", // TDSB
    "B66095", // YRDSB
    "B67075", // YCDSB
    "B66060", // DDSB
    "B67105"  // DCDSB
  ], "Popular boards must appear in exact required order");

  // No duplicates across popular + other
  const allDirectoryIds = boardAudit.optionValues.filter((id) => id !== "other");
  assert.equal(new Set(allDirectoryIds).size, allDirectoryIds.length, "No duplicate boards allowed");
  assert.equal(allDirectoryIds.length, 85, "All 85 Ontario school boards must remain accessible");
  assert.equal(boardAudit.otherSlice.length, 79, "Remaining 79 boards must be in All other school boards");

  // Verify remaining 79 boards are alphabetically sorted
  const otherNames = boardAudit.otherSlice.map((b) => b.name);
  const sortedOtherNames = [...otherNames].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  assert.deepEqual(otherNames, sortedOtherNames, "Remaining boards must be sorted alphabetically");

  assert.equal(boardAudit.fallbackId, "other");
  assert.ok(boardAudit.fallbackText.includes("Other / Not listed"));
  assert.ok(boardAudit.optionHeights.every((h) => h >= 48), `Board options should be >= 48px, got ${JSON.stringify(boardAudit.optionHeights)}`);
  assert.ok(
    boardAudit.listboxHeight <= Math.ceil(boardAudit.viewportHeight * 0.46),
    `Listbox height (${boardAudit.listboxHeight}px) must stay within ~45% of viewport (${boardAudit.viewportHeight}px)`
  );

  // 2. Select popular board WITHOUT typing, verify selected highlight, school search variations, and board change clearing
  const searchAndSelectAudit = await evalInPage(cdp, `
    const boardSearch = document.getElementById("boardSearch");
    const boardListbox = document.getElementById("boardListbox");
    const schoolSearch = document.getElementById("schoolSearch");
    const schoolListbox = document.getElementById("schoolListbox");

    // Tap first popular board (TCDSB) without typing
    boardListbox.querySelector('[data-value="B67059"]').click();
    const tcdsbPicked = document.getElementById("boardId").value === "B67059";
    const schoolPlaceholder = schoolSearch.placeholder;

    // Reopen board selector to confirm aria-selected="true" highlight
    boardSearch.focus();
    boardSearch.click();
    const highlightedSelected = boardListbox.querySelector('[data-value="B67059"]')?.getAttribute("aria-selected") === "true";
    boardSearch.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    // Search school with St., St, Saint variations
    const searchSchool = (q) => {
      schoolSearch.focus();
      schoolSearch.value = q;
      schoolSearch.dispatchEvent(new Event("input", { bubbles: true }));
      return [...schoolListbox.querySelectorAll('[role="option"]')].map((o) => ({ id: o.dataset.value, text: o.textContent.trim() }));
    };
    const stDotResults = searchSchool("St. Mother Teresa");
    const stPlainResults = searchSchool("St Mother Teresa");
    const saintResults = searchSchool("Saint Mother Teresa");
    const schoolFallback = saintResults.at(-1);

    // Pick school then change board to DDSB via acronym search -> must clear school
    schoolListbox.querySelector('[data-value="733024"]').click();
    const pickedSchoolId = document.getElementById("schoolId").value;

    boardSearch.focus();
    boardSearch.value = "dcdsb";
    boardSearch.dispatchEvent(new Event("input", { bubbles: true }));
    const dcdsbSearchIds = [...boardListbox.querySelectorAll('[role="option"]')].map((o) => o.dataset.value);
    boardSearch.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    const clearedAfterBoardChange = document.getElementById("boardId").value === "B67105" &&
      document.getElementById("schoolId").value === "" &&
      schoolSearch.value === "";

    // Search across non-popular board by partial name and punctuation
    boardSearch.focus();
    boardSearch.value = "ottawa-carleton";
    boardSearch.dispatchEvent(new Event("input", { bubbles: true }));
    const ottawaMatches = [...boardListbox.querySelectorAll('[role="option"]')].map((o) => o.dataset.value);

    return {
      tcdsbPicked,
      schoolPlaceholder,
      highlightedSelected,
      stDotHas: stDotResults.some((r) => r.id === "733024"),
      stPlainHas: stPlainResults.some((r) => r.id === "733024"),
      saintHas: saintResults.some((r) => r.id === "733024"),
      schoolFallback,
      pickedSchoolId,
      dcdsbSearchIds,
      clearedAfterBoardChange,
      ottawaMatches
    };
  `);

  assert.equal(searchAndSelectAudit.tcdsbPicked, true, "Must select popular board without typing");
  assert.equal(searchAndSelectAudit.schoolPlaceholder, "Start typing your school name...");
  assert.equal(searchAndSelectAudit.highlightedSelected, true, "Selected board must be highlighted with aria-selected=true");
  assert.equal(searchAndSelectAudit.stDotHas, true, "St. variation must match");
  assert.equal(searchAndSelectAudit.stPlainHas, true, "St variation must match");
  assert.equal(searchAndSelectAudit.saintHas, true, "Saint variation must match");
  assert.equal(searchAndSelectAudit.schoolFallback.id, "manual");
  assert.equal(searchAndSelectAudit.schoolFallback.text, "Can't find your school? Enter it manually.");
  assert.equal(searchAndSelectAudit.pickedSchoolId, "733024");
  assert.deepEqual(searchAndSelectAudit.dcdsbSearchIds, ["B67105", "other"]);
  assert.equal(searchAndSelectAudit.clearedAfterBoardChange, true, "Changing board must clear school selection");
  assert.ok(searchAndSelectAudit.ottawaMatches.includes("B66184"), "Case/punctuation-insensitive search across all boards must find OCDSB");

  // 3. Pathway simplification, Instagram hidden, 3 required fields on Free Tutorial, inline validation, and Apps Script payload compatibility
  const pathwayAudit = await evalInPage(cdp, `
    const get = (id) => document.getElementById(id);
    const setVal = (id, ev, val) => {
      const el = get(id);
      el.value = val;
      el.dispatchEvent(new Event(ev, { bubbles: true }));
    };

    // Pathway B: verify Instagram is hidden & disabled, Flexible / Anytime timing exists
    const workshopInstagramHidden = get("instagramFieldWrap").hidden && get("teacherInstagram").disabled;
    const hasFlexibleTiming = [...get("targetMonth").options].some((o) => o.textContent.trim() === "Flexible / Anytime");
    const workshopRequiredIds = [...get("workshopForm").querySelectorAll("input[required], select[required]")]
      .filter((el) => !el.disabled && !el.closest("[hidden]"))
      .map((el) => el.id);

    // Trigger inline validation on empty name
    setVal("teacherName", "input", "");
    get("workshopForm").requestSubmit();
    const inlineNameErrorVisible = !get("teacherNameError").hidden && get("teacherNameError").textContent.includes("full name");

    // Fill name, email, role, then switch to Free Tutorial -> verify preserved & exactly 3 required fields
    setVal("teacherName", "input", "Ms. Sarah Kim");
    setVal("teacherEmail", "input", "sarah.kim@example.org");
    setVal("signupRole", "change", "Teacher");
    get("changeChoiceBtn").click();
    get("choiceFreeVideosBtn").click();

    const freeRequiredIds = [...get("workshopForm").querySelectorAll("input[required], select[required]")]
      .filter((el) => !el.disabled && !el.closest("[hidden]"))
      .map((el) => el.id);
    const freeHiddenBooking = get("optionalWorkshopDetails").hidden && get("instagramFieldWrap").hidden;
    const freePreserved = get("teacherName").value === "Ms. Sarah Kim" &&
      get("teacherEmail").value === "sarah.kim@example.org" &&
      get("signupRole").value === "Teacher";

    // Submit Pathway A (Free Tutorial) with ONLY the 3 required fields
    get("workshopForm").requestSubmit();
    await new Promise((r) => setTimeout(r, 200));
    const freeSubmitted = !get("formReadyPanel").hidden;

    // Submit Pathway B (School Programming) with manual/unlisted school (Parent user!)
    get("formEditBtn").click();
    get("choiceWorkshopBtn").click();
    setVal("teacherName", "input", "Alex Parent");
    setVal("teacherEmail", "input", "alex.parent@example.org");
    setVal("signupRole", "change", "Parent / Caregiver");
    window.__h4TeacherForm.selectBoardById("other");
    setVal("schoolName", "input", "Independent Montessori Academy");
    setVal("targetMonth", "change", "Flexible / Anytime");
    get("workshopForm").requestSubmit();
    await new Promise((r) => setTimeout(r, 200));
    const workshopParentSubmitted = !get("formReadyPanel").hidden;

    return {
      workshopInstagramHidden,
      hasFlexibleTiming,
      workshopRequiredIds,
      inlineNameErrorVisible,
      freeRequiredIds,
      freeHiddenBooking,
      freePreserved,
      freeSubmitted,
      workshopParentSubmitted
    };
  `);

  assert.equal(pathwayAudit.workshopInstagramHidden, true, "Instagram must be hidden on Pathway B");
  assert.equal(pathwayAudit.hasFlexibleTiming, true, "Flexible / Anytime timing option must be preserved");
  assert.equal(pathwayAudit.inlineNameErrorVisible, true, "Inline field error must appear beneath invalid input");
  assert.deepEqual(pathwayAudit.freeRequiredIds, ["teacherName", "teacherEmail", "signupRole"], "Free Tutorial must have exactly 3 required fields");
  assert.equal(pathwayAudit.freeHiddenBooking, true, "Booking fields and Instagram must be hidden on Free Tutorial");
  assert.equal(pathwayAudit.freePreserved, true, "Compatible fields must be preserved when switching pathways");
  assert.equal(pathwayAudit.freeSubmitted, true, "Free Tutorial must submit with only 3 required fields");
  assert.equal(pathwayAudit.workshopParentSubmitted, true, "Parent with unlisted/independent school must be able to submit Pathway B");

  // 4. Feed the actual frontend payloads into Apps Script Code.gs + Email.gs harness
  assert.equal(srv.receivedRequests.length, 2);
  const [freePayload, workshopPayload] = srv.receivedRequests;
  assert.equal(freePayload.instagram, "");
  assert.equal(workshopPayload.instagram, "");

  const scriptHarness = createAppsScriptHarness();
  const freeBackendRes = scriptHarness.post(freePayload);
  assert.equal(freeBackendRes.ok, true);
  assert.equal(freeBackendRes.saved, true);
  assert.equal(freeBackendRes.emailStatus, "Sent");

  const workshopBackendRes = scriptHarness.post(workshopPayload);
  assert.equal(workshopBackendRes.ok, true);
  assert.equal(workshopBackendRes.saved, true);
  assert.equal(workshopBackendRes.emailStatus, "Sent");
  assert.equal(scriptHarness.rows.length, 2, "Both submissions must save cleanly to Google Sheets");
  assert.equal(scriptHarness.messages.length, 3, "Free tutorial sends 1 email; workshop sends confirmation + staff alert");

  // 5. Multi-viewport responsiveness & mobile keyboard height simulation (320, 375, 390, 390x420 keyboard, 768, 1440)
  const viewports = [
    { name: "mobile-320", width: 320, height: 568, mobile: true },
    { name: "mobile-375", width: 375, height: 667, mobile: true },
    { name: "mobile-390", width: 390, height: 844, mobile: true },
    { name: "mobile-390-keyboard", width: 390, height: 420, mobile: true },
    { name: "tablet-768", width: 768, height: 1024, mobile: false },
    { name: "desktop-1440", width: 1440, height: 900, mobile: false }
  ];

  for (const vp of viewports) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: vp.mobile ? 2 : 1,
      mobile: vp.mobile
    });
    await new Promise((r) => setTimeout(r, 150));
    const check = await evalInPage(cdp, `
      const get = (id) => document.getElementById(id);
      if (!get("formReadyPanel").hidden) get("formEditBtn").click();
      if (!get("signupChooser").hidden) get("choiceWorkshopBtn").click();
      const boardSearch = get("boardSearch");
      boardSearch.focus();
      boardSearch.click();
      const listbox = get("boardListbox");
      const lbRect = listbox.getBoundingClientRect();
      const overflowX = document.documentElement.scrollWidth > window.innerWidth;
      const formOverflowX = get("workshopForm").scrollWidth > get("workshopForm").clientWidth;
      boardSearch.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return {
        overflowX,
        formOverflowX,
        listboxHeight: Math.round(lbRect.height),
        viewportHeight: window.innerHeight
      };
    `);
    assert.equal(check.overflowX, false, `No page horizontal overflow at ${vp.name}`);
    assert.equal(check.formOverflowX, false, `No form horizontal overflow at ${vp.name}`);
    assert.ok(
      check.listboxHeight <= Math.ceil(check.viewportHeight * 0.46) + 2,
      `At ${vp.name}, listbox height (${check.listboxHeight}px) must stay within ~45% of viewport (${check.viewportHeight}px)`
    );
  }
});
