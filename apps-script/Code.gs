const LEAD_HEADERS = [
  "Lead ID", "Submitted At", "Full Name", "School Board", "School", "Contact Email",
  "Phone Number", "Teacher Instagram", "Interest", "Grades", "Preferred Timing",
  "Status", "Next Follow-Up Date", "Notes", "Role", "Email Status", "Email Sent At"
];

const STAFF_STATUS_HEADER = "Staff Notification Status";
const STAFF_SENT_AT_HEADER = "Staff Notification Sent At";

function doPost(event) {
  const content = event?.postData?.contents || "";
  let lead;
  try {
    if (!content || content.length > 4000) throw new Error("Invalid request");
    lead = validateTeacherLead_(JSON.parse(content));
  } catch {
    return teacherLeadResponse_({ ok: false, code: "INVALID_REQUEST" });
  }

  const saved = saveTeacherLead_(lead);
  const rowHint = saved.row;
  delete saved.row;
  if (saved.saved && saved.emailStatus === "Queued") {
    saved.emailStatus = sendQueuedLeadEmail_(lead.id, rowHint);
  }
  if (saved.saved && rowHint && !isFreeResourceInterest_(lead.interest)) {
    // The saved row is the source of truth. A staff alert failure must not affect the response.
    try {
      sendQueuedLeadEmail_(lead.id, rowHint, true);
    } catch {
      // The trigger retries queued rows. Ambiguous attempts remain available for manual review.
    }
  }
  return teacherLeadResponse_(saved);
}

function openLeadSheet_() {
  const properties = PropertiesService.getScriptProperties();
  const id = properties.getProperty("SPREADSHEET_ID");
  const spreadsheet = SpreadsheetApp.openById(id);
  const tab = spreadsheet.getSheetByName("Teacher Leads");
  const lastColumn = tab.getLastColumn();
  const headers = lastColumn ? tab.getRange(1, 1, 1, lastColumn).getValues()[0] : [];
  if (!LEAD_HEADERS.every((header) => headers.filter((cell) => cell === header).length === 1)) {
    return null;
  }
  const staffReady = [STAFF_STATUS_HEADER, STAFF_SENT_AT_HEADER]
    .every((header) => headers.filter((cell) => cell === header).length === 1);
  return { id, spreadsheet, tab, headers, staffReady };
}

function findLeadRow_(tab, column, lastRow, leadId) {
  if (lastRow < 2) return 0;
  const match = tab.getRange(2, column, lastRow - 1, 1)
    .createTextFinder(leadId).matchEntireCell(true).matchCase(true).findNext();
  return match ? match.getRow() : 0;
}

function saveTeacherLead_(lead) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return { ok: false, code: "BUSY" };

  try {
    const context = openLeadSheet_();
    if (!context) return { ok: false, code: "SCHEMA_ERROR" };
    const { id, spreadsheet, tab, headers } = context;
    const lastRow = tab.getLastRow();
    const found = findLeadRow_(tab, headers.indexOf("Lead ID") + 1, lastRow, lead.id);
    if (found) {
      const emailStatus = tab.getRange(found, headers.indexOf("Email Status") + 1).getValue();
      return { ok: true, saved: true, leadId: lead.id, emailStatus };
    }

    const emailStatus = hasRecentMatchingEmail_(tab, headers, lastRow, lead) ? "Suppressed" : "Queued";
    const newRow = lastRow + 1;
    if (newRow > tab.getMaxRows()) {
      tab.insertRowsAfter(tab.getMaxRows(), 100);
      SpreadsheetApp.flush();
    }

    const now = Utilities.formatDate(new Date(), spreadsheet.getSpreadsheetTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
    const values = {
      "Lead ID": lead.id,
      "Submitted At": Date.parse(now + "Z") / 86400000 + 25569,
      "Full Name": lead.fullName,
      "School Board": lead.board,
      "School": lead.school,
      "Contact Email": lead.email,
      "Phone Number": lead.phone,
      "Teacher Instagram": lead.instagram,
      "Interest": lead.interest,
      "Grades": lead.grades,
      "Preferred Timing": lead.timing,
      "Status": "New",
      "Next Follow-Up Date": "",
      "Notes": "",
      "Role": lead.role,
      "Email Status": emailStatus,
      "Email Sent At": "",
      [STAFF_STATUS_HEADER]: isFreeResourceInterest_(lead.interest) ? "" : "Queued",
      [STAFF_SENT_AT_HEADER]: ""
    };
    // RAW stores user input without formula evaluation or numeric conversion.
    Sheets.Spreadsheets.Values.update({
      values: [headers.map((header) => Object.prototype.hasOwnProperty.call(values, header) ? values[header] : "")]
    }, id, "'Teacher Leads'!A" + newRow, { valueInputOption: "RAW" });
    return { ok: true, saved: true, leadId: lead.id, emailStatus, row: newRow };
  } catch {
    return { ok: false, code: "SAVE_FAILED" };
  } finally {
    lock.releaseLock();
  }
}

function validateTeacherLead_(input) {
  const schoolProgramInterests = [
    "Hip-Hop & Breaking Workshops",
    "DPA & Classroom Dance",
    "Multi-Session Dance Programs",
    "School-Wide Events & Celebrations",
    "Full-Day School Workshop"
  ];
  const freeTutorialInterests = ["Free Teacher Tutorial", "Free Online Dance Tutorial"];
  const exploreInterests = ["Other / Let's Explore", "Learn More"];
  const interests = [...schoolProgramInterests, ...freeTutorialInterests, ...exploreInterests];
  const roles = ["Teacher", "Principal", "Parent / Caregiver"];
  const gradeOptions = ["JK", "SK", ...Array.from({ length: 12 }, (_, i) => String(i + 1))];
  const timingOptions = [
    "",
    "Flexible / Anytime",
    "This Month",
    "Next 1–2 Months",
    "Later This School Year",
    "Next School Year",
    "January 2027",
    "February 2027",
    "March 2027",
    "Spring 2027 (April–June)"
  ];
  const readText = (value, max) => {
    if (typeof value !== "string" || value.length > max) throw new Error("Invalid field");
    return value.trim();
  };
  const fullName = readText(input.fullName, 120);
  const email = readText(input.email, 254);
  const workshop = schoolProgramInterests.includes(input.interest);
  const free = freeTutorialInterests.includes(input.interest);
  if ((!free && !fullName) || !isSingleSignupEmail_(email) ||
      !roles.includes(input.role) || !interests.includes(input.interest) || input.website ||
      typeof input.submissionKey !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input.submissionKey)) {
    throw new Error("Invalid submission");
  }

  const parent = input.role === roles[2];
  const noSchool = input.boardId === "" && input.schoolId === "" && input.schoolName === "";
  const skipSchool = !workshop && noSchool;
  const other = input.boardId === "other";
  const board = /^B\d+$/.test(input.boardId) && H4_SCHOOL_DIRECTORY[input.boardId];
  const manual = other ? input.schoolId === "" : input.schoolId === "manual";
  const school = manual
    ? readText(input.schoolName, 160)
    : (/^\d+$/.test(input.schoolId) && board?.[1]?.[input.schoolId]?.[0]);
  if (!skipSchool && ((!board && !other) || !school || (other && !manual))) throw new Error("Invalid school");
  if (workshop && (!Array.isArray(input.grades) || input.grades.length > gradeOptions.length ||
      input.grades.some((grade) => !gradeOptions.includes(grade)) ||
      !timingOptions.includes(input.preferredTiming))) {
    throw new Error("Invalid workshop details");
  }

  return {
    id: "DPA-" + input.submissionKey,
    board: skipSchool ? "" : (other ? "Independent school / Other" : board[0]),
    school: skipSchool ? "" : school,
    role: input.role,
    fullName,
    email,
    phone: readText(input.phone, 40),
    instagram: parent ? "" : readText(input.instagram, 40),
    interest: input.interest,
    grades: workshop ? gradeOptions.filter((grade) => input.grades.includes(grade)).join(", ") : "",
    timing: workshop ? input.preferredTiming : ""
  };
}

function teacherLeadResponse_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
