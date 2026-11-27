import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const load = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const youtubeUrl = "https://youtu.be/bgyMPYTSN7Y?feature=shared";
const freeInterest = "Free Online Dance Tutorial";

function testSheet() {
  const headers = [
    "Notes", "Contact Email", "Full Name", "Lead ID", "School", "School Board", "Submitted At",
    "Phone Number", "Teacher Instagram", "Interest", "Grades", "Preferred Timing", "Status",
    "Next Follow-Up Date", "Role", "Email Status", "Email Sent At"
  ];
  const rows = [];
  const messages = [];
  let quota = 100;
  let mailError = false;
  const properties = {
    SPREADSHEET_ID: "test-sheet"
  };
  const tab = {
    getLastColumn: () => headers.length,
    getLastRow: () => rows.length + 1,
    getMaxRows: () => 1000,
    getRange(startRow, column, count = 1, width = 1) {
      if (startRow === 1) return { getValues: () => [headers] };
      const cell = () => rows[startRow - 2][column - 1];
      return {
        getValue: cell,
        setValue(value) { rows[startRow - 2][column - 1] = value; },
        getValues: () => rows.slice(startRow - 2, startRow - 2 + count)
          .map((row) => row.slice(column - 1, column - 1 + width)),
        createTextFinder(value) {
          let exactCase = true;
          const findAll = () => rows.slice(startRow - 2, startRow - 2 + count)
            .map((row, i) => [row[column - 1], i + startRow])
            .filter(([current]) => exactCase ? current === value : current.toLowerCase() === value.toLowerCase())
            .map(([, row]) => ({ getRow: () => row }));
          return {
            matchEntireCell() { return this; },
            matchCase(match) { exactCase = match; return this; },
            findNext: () => findAll()[0],
            findAll
          };
        }
      };
    }
  };
  let locked = false;
  const context = vm.createContext({
    LockService: { getScriptLock: () => ({
      tryLock() { assert.equal(locked, false); locked = true; return true; },
      releaseLock() { assert.equal(locked, true); locked = false; }
    }) },
    Date,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => properties[key] }) },
    SpreadsheetApp: {
      flush() {},
      openById: () => ({ getSheetByName: () => tab, getSpreadsheetTimeZone: () => "America/Toronto" })
    },
    Utilities: { formatDate: (date) => date.toISOString().slice(0, 19) },
    MailApp: {
      getRemainingDailyQuota: () => quota,
      sendEmail(message) {
        assert.equal(locked, true);
        assert.equal(rows.find((row) => row[headers.indexOf("Email Status")] === "Sending")?.length, headers.length);
        if (mailError) throw new Error("Uncertain outcome");
        messages.push(message);
        quota -= 1;
      }
    },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput(value) { return { setMimeType: () => value }; }
    },
    Sheets: { Spreadsheets: { Values: {
      get(id, range) {
        assert.equal(id, "test-sheet");
        const match = /^'Teacher Leads'!(\d+):\1$/.exec(range);
        assert.ok(match, `Unexpected range: ${range}`);
        const row = rows[Number(match[1]) - 2];
        return { values: row ? [row] : [] };
      },
      update({ values: [row] }, id, range, options) {
        assert.equal(locked, true);
        assert.equal(id, "test-sheet");
        assert.equal(range, "'Teacher Leads'!A" + (rows.length + 2));
        assert.equal(options.valueInputOption, "RAW");
        const copy = [...row];
        const dateIndex = headers.indexOf("Submitted At");
        copy[dateIndex] = new Date((copy[dateIndex] - 25569) * 86400000);
        rows.push(copy);
      }
    } } }
  });
  vm.runInContext(load("../data/ontario-schools.js") + load("../apps-script/Code.gs") + load("../apps-script/Email.gs"), context);
  const payload = {
    submissionKey: randomUUID(), fullName: "=Test Teacher", email: "teacher@example.org", role: "Teacher",
    boardId: "B67059", schoolId: "733024", schoolName: "", phone: "+1 416 555 0100",
    instagram: "@example", interest: "Full-Day School Workshop", grades: ["7", "6"],
    preferredTiming: "February 2027", website: ""
  };
  return {
    headers, rows, payload, messages, properties,
    setQuota(value) { quota = value; },
    setMailError(value) { mailError = value; },
    process() { context.processQueuedEmails(); },
    send(changes = {}) {
      return JSON.parse(context.doPost({ postData: { contents: JSON.stringify({ ...payload, ...changes }) } }));
    },
    get(column) { return rows.at(-1)?.[headers.indexOf(column)]; }
  };
}

test("write maps reordered headers, uses literal values, and deduplicates retries", () => {
  const sheet = testSheet();
  const first = sheet.send();
  const retry = sheet.send();
  assert.equal(first.saved, true);
  assert.equal(first.leadId, retry.leadId);
  assert.equal(sheet.rows.length, 1);
  assert.equal(sheet.get("School"), "St Mother Teresa Catholic Academy");
  assert.equal(sheet.get("Full Name"), "=Test Teacher");
  assert.equal(sheet.get("Phone Number"), "+1 416 555 0100");
  assert.equal(sheet.get("Status"), "New");
  assert.equal(sheet.get("Grades"), "6, 7");
  assert.equal(sheet.get("Preferred Timing"), "February 2027");
  assert.ok(sheet.get("Submitted At") instanceof Date);
  assert.equal(sheet.get("Role"), "Teacher");
  assert.equal(sheet.get("Email Status"), "Sent");
  assert.equal(sheet.messages.length, 1);
  assert.equal(sheet.messages[0].subject, "We received your H4 workshop request");
  assert.ok(!sheet.messages[0].htmlBody.includes(youtubeUrl));
});

test("rejects a school outside its board and a mismatched header schema", () => {
  const sheet = testSheet();
  assert.equal(sheet.send({ boardId: "B66052" }).code, "INVALID_REQUEST");
  sheet.headers[0] = "School";
  assert.equal(sheet.send().code, "SCHEMA_ERROR");
  assert.equal(sheet.rows.length, 0);
});

test("allows independent school entry and clears workshop-only data for a tutorial", () => {
  const sheet = testSheet();
  assert.equal(sheet.send({
    boardId: "other", schoolId: "", schoolName: "Example School", interest: "Free Online Dance Tutorial"
  }).saved, true);
  assert.equal(sheet.get("School"), "Example School");
  assert.equal(sheet.get("Grades"), "");
  assert.equal(sheet.get("Preferred Timing"), "");
});


test("parent free resource request sends the branded YouTube link immediately without school details", () => {
  const sheet = testSheet();
  const lead = { role: "Parent / Caregiver", interest: freeInterest, boardId: "", schoolId: "", schoolName: "" };
  assert.equal(sheet.send(lead).emailStatus, "Sent");
  assert.equal(sheet.get("School"), "");
  assert.equal(sheet.get("School Board"), "");
  assert.equal(sheet.get("Teacher Instagram"), "");
  assert.ok(sheet.get("Email Sent At") instanceof Date);
  assert.equal(sheet.messages[0].to, "teacher@example.org");
  assert.ok(sheet.messages[0].body.includes(youtubeUrl));
  assert.ok(sheet.messages[0].htmlBody.includes(`href="${youtubeUrl}"`));
  assert.ok(sheet.messages[0].htmlBody.includes("H4 COMMUNITY"));
  assert.equal(sheet.send({ ...lead, submissionKey: randomUUID(), email: "Teacher@example.org" }).emailStatus, "Suppressed");
  assert.equal(sheet.messages.length, 1);
  assert.equal(sheet.rows.length, 2);
});

test("a principal stays queued at zero quota and the trigger sends once when quota returns", () => {
  const sheet = testSheet();
  sheet.properties.TEST_EMAIL_OVERRIDE = "test-inbox@example.org";
  sheet.setQuota(0);
  assert.equal(sheet.send({ role: "Principal" }).emailStatus, "Queued");
  assert.equal(sheet.messages.length, 0);
  assert.equal(sheet.get("Role"), "Principal");
  sheet.setQuota(1);
  sheet.process();
  sheet.process();
  assert.equal(sheet.get("Email Status"), "Sent");
  assert.equal(sheet.messages.length, 1);
  assert.equal(sheet.messages[0].to, "test-inbox@example.org");
});

test("an invalid YouTube override keeps the resource email queued until corrected", () => {
  const sheet = testSheet();
  sheet.properties.FREE_RESOURCE_YOUTUBE_URL = "https://example.org/watch?v=example1234";
  assert.equal(sheet.send({ interest: freeInterest }).emailStatus, "Queued");
  sheet.process();
  assert.equal(sheet.messages.length, 0);
  const replacement = "https://www.youtube.com/watch?v=example1234";
  sheet.properties.FREE_RESOURCE_YOUTUBE_URL = replacement;
  sheet.process();
  assert.equal(sheet.messages.length, 1);
  assert.ok(sheet.messages[0].htmlBody.includes(`href="${replacement}"`));
});

test("ambiguous send needs manual review and the trigger does not resend it", () => {
  const sheet = testSheet();
  sheet.setMailError(true);
  assert.equal(sheet.send().emailStatus, "Needs review");
  sheet.setMailError(false);
  sheet.process();
  assert.equal(sheet.messages.length, 0);
});

test("recipient lists are rejected before a Sheet write or email send", () => {
  const sheet = testSheet();
  assert.equal(sheet.send({ email: "one,two@example.org" }).code, "INVALID_REQUEST");
  assert.equal(sheet.rows.length, 0);
  assert.equal(sheet.messages.length, 0);
});
