const FREE_RESOURCES_INTEREST = "Free Online Dance Tutorial";
const DEFAULT_FREE_RESOURCE_YOUTUBE_URL = "https://youtu.be/bgyMPYTSN7Y?feature=shared";
const H4_REPLY_EMAIL = "info@h4community.org";

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
    return submitted instanceof Date && submitted.getTime() >= cutoff &&
      row[headers.indexOf("Interest")] === lead.interest &&
      ["Queued", "Sending", "Sent", "Needs review"].includes(status);
  });
}

function sendQueuedLeadEmail_(leadId, rowHint) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return "Queued";
  let status = "Queued";
  try {
    const context = openLeadSheet_();
    if (!context) return status;
    const { id, tab, headers } = context;
    const row = rowHint || findLeadRow_(tab, headers.indexOf("Lead ID") + 1, tab.getLastRow(), leadId);
    if (!row) return status;
    // Read via Sheets API v4 so rows just written by Values.update are never stale in SpreadsheetApp's cache.
    const values = Sheets.Spreadsheets.Values.get(id, "'Teacher Leads'!" + row + ":" + row).values?.[0] || [];
    const read = (name) => values[headers.indexOf(name)] || "";
    if (read("Lead ID") !== leadId) return status;
    status = read("Email Status");
    if (status !== "Queued") return status;

    const properties = PropertiesService.getScriptProperties();
    const resource = properties.getProperty("FREE_RESOURCE_YOUTUBE_URL") || DEFAULT_FREE_RESOURCE_YOUTUBE_URL;
    const interest = read("Interest");
    if (interest === FREE_RESOURCES_INTEREST && !isYouTubeResourceUrl_(resource)) return status;
    if (MailApp.getRemainingDailyQuota() < 1) return status;

    const to = properties.getProperty("TEST_EMAIL_OVERRIDE") || read("Contact Email");
    const statusCell = tab.getRange(row, headers.indexOf("Email Status") + 1);
    if (!isSingleSignupEmail_(to)) {
      statusCell.setValue("Needs review");
      SpreadsheetApp.flush();
      return "Needs review";
    }

    const message = buildSignupEmail_(to, interest, resource);
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

    tab.getRange(row, headers.indexOf("Email Sent At") + 1).setValue(new Date());
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
  const { tab, headers } = context;
  const total = tab.getLastRow() - 1;
  if (total <= 0) return;
  const rows = tab.getRange(2, 1, total, headers.length).getValues();
  const statusIndex = headers.indexOf("Email Status");
  const interestIndex = headers.indexOf("Interest");
  const leadIndex = headers.indexOf("Lead ID");
  const resource = PropertiesService.getScriptProperties().getProperty("FREE_RESOURCE_YOUTUBE_URL") || DEFAULT_FREE_RESOURCE_YOUTUBE_URL;
  const resourceReady = isYouTubeResourceUrl_(resource);
  const pending = rows.filter((row) => row[statusIndex] === "Queued" &&
    (resourceReady || row[interestIndex] !== FREE_RESOURCES_INTEREST));
  const batchSize = Math.min(20, MailApp.getRemainingDailyQuota());
  pending.slice(0, batchSize).forEach((row) => sendQueuedLeadEmail_(row[leadIndex]));
}

function isYouTubeResourceUrl_(url) {
  return /^https:\/\/(?:(?:www\.|m\.)?youtube\.com\/(?:watch\?v=[\w-]{11}(?:&[\w=&%-]+)?|playlist\?list=[\w-]+(?:&[\w=&%-]+)?|shorts\/[\w-]{11}(?:\?[\w=&%-]+)?)|youtu\.be\/[\w-]{11}(?:\?[\w=&%-]+)?)$/.test(url);
}

function buildSignupEmail_(to, interest, resource) {
  const free = interest === FREE_RESOURCES_INTEREST;
  const workshop = interest === "Full-Day School Workshop";
  const subject = free ? "Your free H4 dance resources"
    : workshop ? "We received your H4 workshop request" : "Thanks for reaching out to H4 Community";
  const intro = free ? "Here’s the free H4 dance resource you requested. Press play to try it at school or at home."
    : workshop ? "Thanks for asking about an H4 school workshop. Our team will follow up about your request, availability, and next steps."
      : "Thanks for your interest in H4 Community. Our team will follow up by email.";
  const body = intro + (free ? "\n\nWatch on YouTube: " + resource : "") +
    "\n\nH4 Community\nHow Hip Hop Helps";
  const button = free ? '<p style="margin:24px 0"><a style="display:inline-block;background:#a3e635;color:#141414;padding:12px 18px;border-radius:8px;font-weight:bold;text-decoration:none" href="' +
    resource.replace(/&/g, "&amp;") + '">Watch on YouTube</a></p>' : "";
  const htmlBody = '<div style="max-width:560px;margin:auto;font-family:Arial,sans-serif;color:#141414;line-height:1.55">' +
    '<div style="background:#141414;color:#a3e635;padding:18px 24px;font-weight:bold">H4 COMMUNITY</div>' +
    '<div style="background:#fffdf7;padding:24px"><h1 style="font-size:23px;margin:0 0 12px">' +
    subject + '</h1><p>' + intro + '</p>' + button +
    '<p style="margin:24px 0 0;font-size:14px">How Hip Hop Helps</p></div></div>';
  return { to, subject, body, htmlBody, name: "H4 Community", replyTo: H4_REPLY_EMAIL };
}
