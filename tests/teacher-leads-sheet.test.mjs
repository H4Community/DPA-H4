import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { gmailUtilities, readGmailMessage } from "./gmail-test-helpers.mjs";

const load = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const youtubeUrl = "https://youtu.be/bgyMPYTSN7Y?feature=shared";
const freeInterest = "Free Online Dance Tutorial";

function testSheet({ staff = false } = {}) {
  const headers = [
    "Notes", "Contact Email", "Full Name", "Lead ID", "School", "School Board", "Submitted At",
    "Phone Number", "Teacher Instagram", "Interest", "Grades", "Preferred Timing", "Status",
    "Next Follow-Up Date", "Role", "Email Status", "Email Sent At"
  ];
  if (staff) headers.push("Staff Notification Status", "Staff Notification Sent At");
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
    Utilities: { ...gmailUtilities, formatDate: (date) => date.toISOString().slice(0, 19) },
    MailApp: {
      getRemainingDailyQuota: () => quota,
      sendEmail() { assert.fail("MailApp must not send confirmations or staff alerts"); }
    },
    Gmail: { Users: { Messages: {
      send({ raw }, userId) {
        assert.equal(userId, "me");
        const { message } = readGmailMessage(raw);
        assert.equal(locked, true);
        assert.ok(rows.some((row) => ["Email Status", "Staff Notification Status"]
          .some((column) => row[headers.indexOf(column)] === "Sending")));
        if (mailError === true || mailError === message.to) throw new Error("Uncertain outcome");
        messages.push(message);
        quota -= 1;
        return mailError === "missing-id" ? {} : { id: "gmail-" + messages.length };
      }
    } } },
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
  assert.equal(sheet.messages[0].subject, "Let's get your school movin'! | H4 Community");
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

test("a Gmail response without a message ID never records Sent or retries automatically", () => {
  const sheet = testSheet();
  sheet.setMailError("missing-id");
  assert.equal(sheet.send().emailStatus, "Needs review");
  assert.equal(sheet.get("Email Sent At"), "");
  sheet.process();
  assert.equal(sheet.messages.length, 1);
});

test("recipient lists are rejected before a Sheet write or email send", () => {
  const sheet = testSheet();
  assert.equal(sheet.send({ email: "one,two@example.org" }).code, "INVALID_REQUEST");
  assert.equal(sheet.rows.length, 0);
  assert.equal(sheet.messages.length, 0);
});

test("teacher and principal free-video requests succeed with only email and role and use natural greeting", () => {
  const sheet = testSheet();
  const teacherRes = sheet.send({
    role: "Teacher", interest: freeInterest, fullName: "",
    boardId: "", schoolId: "", schoolName: "", phone: "", instagram: "", grades: [], preferredTiming: ""
  });
  assert.equal(teacherRes.saved, true);
  assert.equal(teacherRes.emailStatus, "Sent");
  assert.equal(sheet.get("Full Name"), "");
  assert.equal(sheet.get("School Board"), "");
  assert.equal(sheet.get("School"), "");
  assert.equal(sheet.get("Role"), "Teacher");
  assert.ok(sheet.messages[0].body.includes("Hey there,\n\n"));
  assert.ok(sheet.messages[0].htmlBody.includes("Hey there,</p>"));
  assert.ok(sheet.messages[0].htmlBody.includes(`href="${youtubeUrl}"`));

  const principalRes = sheet.send({
    submissionKey: randomUUID(), email: "principal@example.org", role: "Principal",
    interest: freeInterest, fullName: "", boardId: "", schoolId: "", schoolName: "",
    phone: "", instagram: "", grades: [], preferredTiming: ""
  });
  assert.equal(principalRes.saved, true);
  assert.equal(principalRes.emailStatus, "Sent");
  assert.equal(sheet.get("Full Name"), "");
  assert.equal(sheet.get("Role"), "Principal");
  assert.ok(sheet.messages[1].body.includes("Hey there,\n\n"));
});

test("learn more succeeds without school for staff, requires name, and greets safely", () => {
  const sheet = testSheet();
  assert.equal(sheet.send({
    interest: "Learn More", fullName: "", boardId: "", schoolId: "", schoolName: ""
  }).code, "INVALID_REQUEST");
  assert.equal(sheet.send({
    interest: "Full-Day School Workshop", fullName: ""
  }).code, "INVALID_REQUEST");
  assert.equal(sheet.send({
    interest: "Full-Day School Workshop", boardId: "", schoolId: "", schoolName: ""
  }).code, "INVALID_REQUEST");

  const res = sheet.send({
    interest: "Learn More", role: "Teacher", fullName: "A&<B> Teacher",
    boardId: "", schoolId: "", schoolName: "", phone: "", instagram: "", grades: [], preferredTiming: ""
  });
  assert.equal(res.saved, true);
  assert.equal(res.emailStatus, "Sent");
  assert.equal(sheet.get("School Board"), "");
  assert.equal(sheet.get("School"), "");
  assert.ok(sheet.messages[0].body.startsWith("Hi A&<B>,\n\n"));
  assert.ok(sheet.messages[0].htmlBody.includes("Hi A&amp;&lt;B&gt;,</p>"));
  assert.ok(!sheet.messages[0].htmlBody.includes(youtubeUrl));
});

test("remains backwards compatible with live form payloads and rejects mismatched board/school on free videos", () => {
  const sheet = testSheet();
  // Currently live PR #4 form sends fullName + board + school + phone + instagram on Free Tutorial
  const legacyFree = sheet.send({
    interest: freeInterest, role: "Teacher", fullName: "Ms. Jordan Lee",
    boardId: "B67059", schoolId: "733024", schoolName: "", phone: "416-555-0199", instagram: "@h4"
  });
  assert.equal(legacyFree.saved, true);
  assert.equal(legacyFree.emailStatus, "Sent");
  assert.equal(sheet.get("Full Name"), "Ms. Jordan Lee");
  assert.equal(sheet.get("School"), "St Mother Teresa Catholic Academy");
  assert.ok(sheet.messages[0].body.includes("Hey there,\n\n"));

  // Mismatched school outside selected board must still be rejected on Free Videos
  assert.equal(sheet.send({
    submissionKey: randomUUID(), email: "other@example.org", interest: freeInterest,
    role: "Teacher", fullName: "", boardId: "B66052", schoolId: "733024", schoolName: ""
  }).code, "INVALID_REQUEST");
});

const QUICK_CALL_MAILTO =
  "mailto:glen@h4community.org?subject=H4%20School%20Workshops%20-%20Quick%20Call" +
  "&body=Hi%20Glen%2C%0D%0A%0D%0A" +
  "I%27d%20love%20to%20schedule%20a%20quick%20call%20about%20bringing%20H4%20to%20our%20school.%0D%0A%0D%0A" +
  "My%20availability%3A%20%0D%0A" +
  "Best%20phone%20number%3A%20%0D%0A%0D%0A" +
  "Thanks!";
const QUICK_CALL_MAILTO_HTML = QUICK_CALL_MAILTO.replace(/&/g, "&amp;");

function assertProgrammingEmailContent(msg, expectedGreeting) {
  assert.equal(msg.subject, "Let's get your school movin'! | H4 Community");
  assert.equal(msg.replyTo, "info@h4community.org");
  assert.ok(msg.body.startsWith(expectedGreeting + "\n\n"));
  assert.ok(!msg.body.includes("—"), "Plain-text programming email must not include em dashes");
  assert.ok(!msg.htmlBody.includes("—") && !msg.htmlBody.includes("&mdash;"), "HTML programming email must not include em dashes");

  const sharedPhrases = [
    "Thanks for reaching out! From classroom DPA to dance curriculum and school performances, we've got you covered.",
    "THE H4 ONE FAMILY FEE",
    "One charge. All their kids get to dance.",
    "When families pay for an H4 program, siblings participating in the same program at your school dance at no extra charge.",
    "What fits your school best?",
    "ONE WORKSHOP",
    "From $10/student*",
    "Get your students moving!",
    "Perfect for DPA, wellness days and school spirit events.",
    "Minimum: 3 classes · 50+ students",
    "BEST VALUE",
    "THREE WORKSHOPS",
    "From $20/student*",
    "Includes all three visits.",
    "Let us help teach your dance curriculum!",
    "Less planning for you. More learning for your students. Explore dance foundations, musicality and creative movement.",
    "MULTIPLE SESSIONS",
    "Customized Pricing",
    "Let's get stage ready!",
    "Spring concerts, choreography and showcases. We'll build a program around your school's needs and budget.",
    "We can get you movin'!",
    "Let's jump on a quick 10-minute call to find what works for your school.",
    "LET'S BOOK A QUICK CALL",
    "Just let me know when you're available and the best number to reach you.",
    "free 5-minute classroom DPA",
    "Looking forward to connecting!",
    "Glen Reyes",
    "Founder, H4 Community (How Hip Hop Helps)",
    "glen@h4community.org",
    "Starting rates are plus HST. Minimum group sizes apply. Final pricing depends on participation and programming needs. One Family Fee applies to siblings participating in the same parent-funded program at the same school.",
    "HOW HIP HOP HELPS.",
    "Confidence in Motion."
  ];
  const decodedHtml = msg.htmlBody.replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  for (const phrase of sharedPhrases) {
    assert.ok(msg.body.includes(phrase), `Plain-text email missing: ${phrase}`);
    assert.ok(decodedHtml.includes(phrase), `HTML email missing: ${phrase}`);
  }

  // Disclosures must appear below the signature in both HTML and plain text
  const disclosureText = "Starting rates are plus HST. Minimum group sizes apply.";
  assert.ok(
    msg.body.indexOf(disclosureText) > msg.body.indexOf("Glen Reyes"),
    "Plain-text disclosures must appear below the signature"
  );
  assert.ok(
    decodedHtml.indexOf(disclosureText) > decodedHtml.indexOf("Glen Reyes"),
    "HTML disclosures must appear below the signature"
  );

  // Removed legacy pricing, visit counts, survey questions, and promotional boxes must not reappear
  for (const removed of [
    "$35",
    "6 to 8 Visits",
    "CONCERT & SHOWCASE",
    "Small Moves. Big Impact.",
    "Something Else Entirely?",
    "not a fixed package",
    "What grades you're thinking of.",
    "Roughly how many classes or students.",
    "Want to get your classroom moving today?",
    "TRY H4'S FREE CLASSROOM DPA"
  ]) {
    assert.ok(!msg.body.includes(removed), `Plain-text email should not include: ${removed}`);
    assert.ok(!decodedHtml.includes(removed), `HTML email should not include: ${removed}`);
  }

  // Preheader, CTA destinations, logo, and clickable signature links
  assert.ok(msg.htmlBody.includes("Flexible dance workshops, family-friendly pricing and less lesson planning for you."));
  assert.ok(msg.body.includes(QUICK_CALL_MAILTO));
  assert.ok(msg.htmlBody.includes(`href="${QUICK_CALL_MAILTO_HTML}"`));
  assert.ok(msg.body.includes("https://dance.h4community.org/"));
  assert.ok(msg.htmlBody.includes('href="https://dance.h4community.org/"'));
  assert.ok(msg.htmlBody.includes('href="mailto:glen@h4community.org"'));
  assert.ok(msg.htmlBody.includes('href="https://h4community.org/"'));
  assert.ok(msg.htmlBody.includes('href="https://glenreyes.me/"'));
  assert.ok(msg.htmlBody.includes('href="https://www.instagram.com/h4glen/"'));
  assert.ok(msg.htmlBody.includes("https://dance.h4community.org/images/h4-logo-mark.png"));
}

test("supports all 6 flexible programming inquiry options in sheet records and email notifications", () => {
  const sheet = testSheet();
  const programOptions = [
    "Hip-Hop & Breaking Workshops",
    "DPA & Classroom Dance",
    "Multi-Session Dance Programs",
    "School-Wide Events & Celebrations",
    "Full-Day School Workshop"
  ];

  programOptions.forEach((interest, idx) => {
    const res = sheet.send({
      submissionKey: randomUUID(),
      email: `program${idx}@example.org`,
      fullName: "Ms. Jordan Lee",
      interest,
      preferredTiming: "Flexible / Anytime"
    });
    assert.equal(res.saved, true);
    assert.equal(res.emailStatus, "Sent");
    assert.equal(sheet.get("Interest"), interest);
    assert.equal(sheet.get("Preferred Timing"), "Flexible / Anytime");
    assertProgrammingEmailContent(sheet.messages.at(-1), "Hi Jordan,");
  });

  const tutorialRes = sheet.send({
    submissionKey: randomUUID(),
    email: "tutorial-new@example.org",
    interest: "Free Teacher Tutorial",
    fullName: "",
    boardId: "",
    schoolId: "",
    schoolName: "",
    grades: [],
    preferredTiming: ""
  });
  assert.equal(tutorialRes.saved, true);
  assert.equal(tutorialRes.emailStatus, "Sent");
  assert.equal(sheet.get("Interest"), "Free Teacher Tutorial");
  const tutorialMsg = sheet.messages.at(-1);
  assert.equal(tutorialMsg.subject, "Let's get your classroom moving! Your free H4 dance tutorial");
  assert.ok(tutorialMsg.htmlBody.includes(`href="${youtubeUrl}"`));
  assert.ok(tutorialMsg.htmlBody.includes("https://i.ytimg.com/vi/bgyMPYTSN7Y/maxresdefault.jpg"));
  assert.ok(tutorialMsg.htmlBody.includes("WATCH THE 10 FOUNDATIONAL HIP-HOP GROOVES"));
  assert.ok(tutorialMsg.htmlBody.includes('href="https://dance.h4community.org/"'));
  assert.ok(tutorialMsg.htmlBody.includes('href="https://dance.h4community.org/#book-workshop"'));
  assert.ok(tutorialMsg.htmlBody.includes('href="https://dancestash.space/"'));

  const exploreRes = sheet.send({
    submissionKey: randomUUID(),
    email: "explore-new@example.org",
    interest: "Other / Let's Explore",
    fullName: "Jordan Principal",
    role: "Principal",
    boardId: "",
    schoolId: "",
    schoolName: "",
    grades: [],
    preferredTiming: ""
  });
  assert.equal(exploreRes.saved, true);
  assert.equal(exploreRes.emailStatus, "Sent");
  assert.equal(sheet.get("Interest"), "Other / Let's Explore");
  const exploreMsg = sheet.messages.at(-1);
  assertProgrammingEmailContent(exploreMsg, "Hi Jordan,");
  assert.ok(!exploreMsg.body.includes("Other / Let's Explore"));
  assert.ok(!exploreMsg.htmlBody.includes("Other / Let's Explore"));

  // Fallback greeting when fullName is blank (direct template invocation)
  const fallbackContext = vm.createContext({ Utilities: gmailUtilities });
  vm.runInContext(load("../apps-script/Email.gs"), fallbackContext);
  const fallbackMsg = fallbackContext.buildProgrammingEmail_("fallback@example.org", "Hip-Hop & Breaking Workshops", "");
  assertProgrammingEmailContent(fallbackMsg, "Hi there,");
});

test("staff alerts are separate from confirmations, deduplicated by lead key and restricted to paid and general inquiries", () => {
  const sheet = testSheet({ staff: true });
  sheet.properties.H4_LEAD_NOTIFICATION_EMAIL = "staff@example.org";
  assert.equal(sheet.send().emailStatus, "Sent");
  assert.equal(sheet.get("Staff Notification Status"), "Sent");
  assert.ok(sheet.get("Staff Notification Sent At") instanceof Date);
  assert.equal(sheet.messages[1].to, "staff@example.org");
  assert.match(sheet.messages[1].subject, /St Mother Teresa Catholic Academy/);
  for (const label of ["Full Name", "School", "School Board", "Contact Email", "Interest",
    "Preferred Timing", "Grades", "Phone Number", "Lead ID", "Submitted At"]) {
    assert.ok(sheet.messages[1].body.includes(label + ": "));
  }
  sheet.send();
  sheet.process();
  assert.equal(sheet.rows.length, 1);
  assert.equal(sheet.messages.length, 2);
  sheet.send({ submissionKey: randomUUID(), interest: "Other / Let's Explore", boardId: "", schoolId: "" });
  assert.equal(sheet.messages.at(-1).subject, "New H4 School Inquiry — Other / Let's Explore");
  sheet.send({ submissionKey: randomUUID(), interest: "Free Teacher Tutorial" });
  assert.equal(sheet.get("Staff Notification Status"), "");
  assert.equal(sheet.messages.filter((mail) => mail.to === "staff@example.org").length, 2);
});

test("staff alert quota retry and ambiguous failure preserve the saved response and requester state", () => {
  const sheet = testSheet({ staff: true });
  sheet.properties.H4_LEAD_NOTIFICATION_EMAIL = "staff@example.org";
  sheet.setQuota(1);
  assert.equal(sheet.send().emailStatus, "Sent");
  assert.equal(sheet.get("Staff Notification Status"), "Queued");
  sheet.setQuota(4);
  sheet.setMailError("staff@example.org");
  sheet.process();
  assert.equal(sheet.get("Staff Notification Status"), "Needs review");
  assert.equal(sheet.get("Email Status"), "Sent");
  sheet.setMailError(false);
  sheet.process();
  assert.equal(sheet.messages.length, 1, "Ambiguous send requires review");
  const row = sheet.rows[0];
  row[sheet.headers.indexOf("Staff Notification Status")] = "Queued";
  sheet.process();
  assert.equal(sheet.get("Staff Notification Status"), "Sent");
  assert.equal(sheet.messages.length, 2);
});

test("test override confines both emails to the authorized test inbox", () => {
  const sheet = testSheet({ staff: true });
  sheet.properties.H4_LEAD_NOTIFICATION_EMAIL = "staff@example.org";
  sheet.properties.TEST_EMAIL_OVERRIDE = "test@example.org";
  assert.equal(sheet.send().saved, true);
  assert.deepEqual(sheet.messages.map((mail) => mail.to), ["test@example.org", "test@example.org"]);
});

test("old sheets accept submissions without staff columns, even with a staff recipient configured", () => {
  const sheet = testSheet();
  sheet.properties.H4_LEAD_NOTIFICATION_EMAIL = "staff@example.org";
  assert.equal(sheet.send().saved, true);
  sheet.process();
  assert.equal(sheet.messages.length, 1);
});

test("both tutorial labels suppress recent confirmations across the rename", () => {
  for (const [first, second] of [[freeInterest, "Free Teacher Tutorial"], ["Free Teacher Tutorial", freeInterest]]) {
    const sheet = testSheet({ staff: true });
    sheet.properties.H4_LEAD_NOTIFICATION_EMAIL = "staff@example.org";
    assert.equal(sheet.send({ interest: first }).emailStatus, "Sent");
    assert.equal(sheet.send({ interest: second, submissionKey: randomUUID() }).emailStatus, "Suppressed");
    assert.equal(sheet.rows[0][sheet.headers.indexOf("Interest")], first);
    assert.equal(sheet.get("Interest"), second);
    assert.equal(sheet.messages.length, 1);
  }
});
