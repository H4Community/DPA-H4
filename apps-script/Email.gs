const FREE_RESOURCES_INTERESTS = ["Free Teacher Tutorial", "Free Online Dance Tutorial"];
const SCHOOL_PROGRAM_INTERESTS = [
  "Hip-Hop & Breaking Workshops",
  "DPA & Classroom Dance",
  "Multi-Session Dance Programs",
  "School-Wide Events & Celebrations",
  "Full-Day School Workshop"
];
const DEFAULT_FREE_RESOURCE_YOUTUBE_URL = "https://youtu.be/bgyMPYTSN7Y?feature=shared";
const H4_REPLY_EMAIL = "info@h4community.org";

function isFreeResourceInterest_(interest) {
  return FREE_RESOURCES_INTERESTS.includes(interest);
}

function isSingleSignupEmail_(email) {
  // MailApp accepts recipient lists, so only pass one literal address.
  return typeof email === "string" && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(email);
}

function hasRecentMatchingEmail_(tab, headers, lastRow, lead) {
  if (lastRow < 2) return false;
  const matches = tab.getRange(2, headers.indexOf("Contact Email") + 1, lastRow - 1, 1)
    .createTextFinder(lead.email).matchEntireCell(true).matchCase(false).findAll();
  const cutoff = Date.now() - 86400000;
  return matches.some((match) => {
    const row = tab.getRange(match.getRow(), 1, 1, headers.length).getValues()[0];
    const submitted = row[headers.indexOf("Submitted At")];
    const status = row[headers.indexOf("Email Status")];
    const interest = row[headers.indexOf("Interest")];
    const sameInterest = interest === lead.interest ||
      (isFreeResourceInterest_(interest) && isFreeResourceInterest_(lead.interest));
    return submitted instanceof Date && submitted.getTime() >= cutoff &&
      sameInterest &&
      ["Queued", "Sending", "Sent", "Needs review"].includes(status);
  });
}

function sendQueuedLeadEmail_(leadId, rowHint, staff = false) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return "Queued";
  let status = "Queued";
  try {
    const context = openLeadSheet_();
    if (!context || (staff && !context.staffReady)) return status;
    const { id, tab, headers } = context;
    const statusHeader = staff ? STAFF_STATUS_HEADER : "Email Status";
    const sentAtHeader = staff ? STAFF_SENT_AT_HEADER : "Email Sent At";
    const row = rowHint || findLeadRow_(tab, headers.indexOf("Lead ID") + 1, tab.getLastRow(), leadId);
    if (!row) return status;
    // Read via Sheets API v4 so rows just written by Values.update are never stale in SpreadsheetApp's cache.
    const values = Sheets.Spreadsheets.Values.get(id, "'Teacher Leads'!" + row + ":" + row).values?.[0] || [];
    const read = (name) => values[headers.indexOf(name)] || "";
    if (read("Lead ID") !== leadId) return status;
    status = read(statusHeader);
    if (status !== "Queued") return status;

    const properties = PropertiesService.getScriptProperties();
    const resource = properties.getProperty("FREE_RESOURCE_YOUTUBE_URL") || DEFAULT_FREE_RESOURCE_YOUTUBE_URL;
    const interest = read("Interest");
    const staffRecipient = properties.getProperty("H4_LEAD_NOTIFICATION_EMAIL");
    if (staff && (!staffRecipient || isFreeResourceInterest_(interest))) return status;
    if (!staff && isFreeResourceInterest_(interest) && !isYouTubeResourceUrl_(resource)) return status;
    if (MailApp.getRemainingDailyQuota() < 1) return status;

    const to = properties.getProperty("TEST_EMAIL_OVERRIDE") || (staff ? staffRecipient : read("Contact Email"));
    const statusCell = tab.getRange(row, headers.indexOf(statusHeader) + 1);
    if (!isSingleSignupEmail_(to)) {
      statusCell.setValue("Needs review");
      SpreadsheetApp.flush();
      return "Needs review";
    }

    const message = staff
      ? buildStaffLeadEmail_(to, read)
      : buildSignupEmail_(to, interest, resource, read("Full Name"));
    // Record the in-flight attempt first. An ambiguous outcome requires review,
    // since sending and recording an email cannot share a transaction.
    statusCell.setValue("Sending");
    SpreadsheetApp.flush();
    status = "Sending";
    try {
      MailApp.sendEmail(message);
    } catch {
      statusCell.setValue("Needs review");
      SpreadsheetApp.flush();
      return "Needs review";
    }

    tab.getRange(row, headers.indexOf(sentAtHeader) + 1).setValue(new Date());
    statusCell.setValue("Sent");
    SpreadsheetApp.flush();
    return "Sent";
  } catch {
    return status;
  } finally {
    lock.releaseLock();
  }
}

// Install a time-driven trigger for this function under the deployer's account.
function processQueuedEmails() {
  const context = openLeadSheet_();
  if (!context) throw new Error("Check Teacher Leads headers.");
  const { tab, headers, staffReady } = context;
  const total = tab.getLastRow() - 1;
  if (total <= 0) return;
  const rows = tab.getRange(2, 1, total, headers.length).getValues();
  const statusIndex = headers.indexOf("Email Status");
  const interestIndex = headers.indexOf("Interest");
  const leadIndex = headers.indexOf("Lead ID");
  const resource = PropertiesService.getScriptProperties().getProperty("FREE_RESOURCE_YOUTUBE_URL") || DEFAULT_FREE_RESOURCE_YOUTUBE_URL;
  const resourceReady = isYouTubeResourceUrl_(resource);
  const pending = rows.filter((row) => row[statusIndex] === "Queued" &&
    (resourceReady || !isFreeResourceInterest_(row[interestIndex])));
  const batchSize = Math.min(20, MailApp.getRemainingDailyQuota());
  const staffIndex = headers.indexOf(STAFF_STATUS_HEADER);
  const staffPending = staffReady && PropertiesService.getScriptProperties().getProperty("H4_LEAD_NOTIFICATION_EMAIL")
    ? rows.filter((row) => row[staffIndex] === "Queued" && !isFreeResourceInterest_(row[interestIndex]))
    : [];
  // Give both queues a turn even if one has a backlog.
  const staffFirst = new Date().getMinutes() % 30 >= 15;
  let remaining = batchSize;
  for (let i = 0; remaining > 0 && (i < pending.length || i < staffPending.length); i++) {
    const send = (row, staff) => {
      if (!row || remaining <= 0) return;
      sendQueuedLeadEmail_(row[leadIndex], undefined, staff);
      remaining--;
    };
    if (staffFirst) send(staffPending[i], true);
    send(pending[i], false);
    if (!staffFirst) send(staffPending[i], true);
  }
}

function buildStaffLeadEmail_(to, read) {
  const label = String(read("School") || read("Interest")).replace(/[\r\n]+/g, " ");
  const fields = [
    "Full Name", "School", "School Board", "Contact Email", "Interest",
    "Preferred Timing", "Grades", "Phone Number", "Lead ID", "Submitted At"
  ];
  const body = fields.map((field) => [field, read(field)])
    .filter(([, value]) => value)
    .map(([field, value]) => field + ": " + value)
    .join("\n");
  return { to, subject: "New H4 School Inquiry — " + label, body, name: "H4 Community" };
}

function isYouTubeResourceUrl_(url) {
  return /^https:\/\/(?:(?:www\.|m\.)?youtube\.com\/(?:watch\?v=[\w-]{11}(?:&[\w=&%-]+)?|playlist\?list=[\w-]+(?:&[\w=&%-]+)?|shorts\/[\w-]{11}(?:\?[\w=&%-]+)?)|youtu\.be\/[\w-]{11}(?:\?[\w=&%-]+)?)$/.test(url);
}

function escapeHtml_(value) {
  return String(value).replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch]
  ));
}

function buildSignupEmail_(to, interest, resource, fullName) {
  const free = isFreeResourceInterest_(interest);
  const workshop = SCHOOL_PROGRAM_INTERESTS.includes(interest);
  const cleanName = typeof fullName === "string" ? fullName.trim() : "";
  const greeting = cleanName ? "Hi " + cleanName + "," : "Hi there,";
  const subject = free ? "Your free H4 dance resources"
    : workshop ? "We received your H4 school programming request" : "Thanks for reaching out to H4 Community";
  const programLabel = interest === "Full-Day School Workshop" ? "an H4 school program" : interest;
  const intro = free ? "Here’s the free H4 dance resource you requested. Press play to try it at school or at home."
    : workshop ? "Thanks for asking about " + programLabel + " with H4 Community. Our team will follow up about your request, availability, and next steps."
      : interest === "Other / Let's Explore"
        ? "Thanks for reaching out to H4 Community (Other / Let's Explore). Our team will follow up by email to explore what fits your school best."
        : "Thanks for your interest in H4 Community. Our team will follow up by email.";
  const body = greeting + "\n\n" + intro + (free ? "\n\nWatch on YouTube: " + resource : "") +
    "\n\nH4 Community\nHow Hip Hop Helps";
  const button = free ? '<p style="margin:24px 0"><a style="display:inline-block;background:#a3e635;color:#141414;padding:12px 18px;border-radius:8px;font-weight:bold;text-decoration:none" href="' +
    resource.replace(/&/g, "&amp;") + '">Watch on YouTube</a></p>' : "";
  const htmlBody = '<div style="max-width:560px;margin:auto;font-family:Arial,sans-serif;color:#141414;line-height:1.55">' +
    '<div style="background:#141414;color:#a3e635;padding:18px 24px;font-weight:bold">H4 COMMUNITY</div>' +
    '<div style="background:#fffdf7;padding:24px"><h1 style="font-size:23px;margin:0 0 12px">' +
    subject + '</h1><p>' + escapeHtml_(greeting) + '</p><p>' + intro + '</p>' + button +
    '<p style="margin:24px 0 0;font-size:14px">How Hip Hop Helps</p></div></div>';
  return { to, subject, body, htmlBody, name: "H4 Community", replyTo: H4_REPLY_EMAIL };
}
