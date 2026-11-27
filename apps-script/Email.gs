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
      sendSignupMessage_(message);
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

// Use Gmail's sending API. MailApp accepted sends that subsequently bounced
// externally in production. An API message ID confirms acceptance, not delivery.
function sendSignupMessage_(message) {
  const result = Gmail.Users.Messages.send({ raw: buildGmailRawMessage_(message) }, "me");
  if (!result || typeof result.id !== "string" || !result.id) {
    throw new Error("Gmail did not confirm the send attempt.");
  }
  return result.id;
}

function buildGmailRawMessage_(message) {
  if (!isSingleSignupEmail_(message.to) ||
      (message.replyTo && !isSingleSignupEmail_(message.replyTo))) {
    throw new Error("Invalid email recipient or reply address.");
  }
  const encodeHeader = (value) => {
    if (typeof value !== "string" || /[\r\n]/.test(value) || value.length > 512) {
      throw new Error("Invalid email header.");
    }
    // Keep each RFC 2047 encoded word below 75 characters without splitting
    // a UTF-8 character. Folding also keeps long school names off one line.
    const words = [];
    let chunk = "";
    for (const char of value) {
      if (Utilities.base64Encode(chunk + char, Utilities.Charset.UTF_8).length > 60) {
        words.push("=?UTF-8?B?" + Utilities.base64Encode(chunk, Utilities.Charset.UTF_8) + "?=");
        chunk = "";
      }
      chunk += char;
    }
    words.push("=?UTF-8?B?" + Utilities.base64Encode(chunk, Utilities.Charset.UTF_8) + "?=");
    return words.join("\r\n ");
  };
  const encodeBody = (value) => Utilities.base64Encode(String(value || ""), Utilities.Charset.UTF_8)
    .match(/.{1,76}/g)?.join("\r\n") || "";
  const headers = [
    "From: " + encodeHeader(message.name || "H4 Community") + " <" + H4_REPLY_EMAIL + ">",
    "To: " + message.to,
    "Subject: " + encodeHeader(message.subject),
    "MIME-Version: 1.0"
  ];
  if (message.replyTo) headers.push("Reply-To: " + message.replyTo);
  let mime;
  if (message.htmlBody) {
    const boundary = "h4-" + Utilities.getUuid();
    headers.push('Content-Type: multipart/alternative; boundary="' + boundary + '"');
    const parts = [["text/plain", message.body], ["text/html", message.htmlBody]].map(([type, body]) => (
      "--" + boundary + "\r\nContent-Type: " + type + "; charset=UTF-8\r\n" +
      "Content-Transfer-Encoding: base64\r\n\r\n" + encodeBody(body)
    ));
    mime = headers.join("\r\n") + "\r\n\r\n" + parts.join("\r\n") + "\r\n--" + boundary + "--\r\n";
  } else {
    headers.push("Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64");
    mime = headers.join("\r\n") + "\r\n\r\n" + encodeBody(message.body) + "\r\n";
  }
  return Utilities.base64EncodeWebSafe(mime, Utilities.Charset.UTF_8);
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

const H4_SITE_URL = "https://h4community.org/";
const H4_DPA_URL = "https://dance.h4community.org/";
const H4_WORKSHOP_URL = "https://dance.h4community.org/#book-workshop";
const H4_DANCESTASH_URL = "https://dancestash.space/";
const H4_GLEN_EMAIL = "glen@h4community.org";
const H4_LOGO_PNG_URL = "https://dance.h4community.org/images/h4-logo-mark.png";
const EMAIL_FONT_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function extractYouTubeVideoId_(url) {
  const match = String(url || "").match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return match ? match[1] : "";
}

function extractFirstName_(fullName) {
  const clean = typeof fullName === "string" ? fullName.trim() : "";
  if (!clean) return "";
  const parts = clean.split(/\s+/);
  if (parts.length > 1 && /^(mr|mrs|ms|mx|dr|prof)\.?$/i.test(parts[0])) {
    return parts[1];
  }
  return parts[0];
}

function renderEmailButton_(label, href, bgColor) {
  const safeHref = escapeHtml_(href);
  const safeLabel = escapeHtml_(label);
  return '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:18px 0;max-width:100%">' +
    '<tr><td style="border-radius:14px;background-color:' + bgColor + ';border:2px solid #111111;box-shadow:3px 3px 0 #111111">' +
    '<a class="h4-btn-link" href="' + safeHref + '" target="_blank" rel="noopener noreferrer" ' +
    'style="display:inline-block;padding:13px 22px;font-family:' + EMAIL_FONT_STACK + ';font-size:14px;font-weight:800;line-height:1.25;letter-spacing:0.03em;text-transform:uppercase;color:#111111;text-decoration:none">' +
    safeLabel + '</a></td></tr></table>';
}

function renderEmailShell_(preheader, eyebrow, headline, bodyHtml, footerLinks) {
  const safePreheader = escapeHtml_(preheader);
  const safeHeadline = escapeHtml_(headline);
  const footerNav = footerLinks.map((link) => (
    '<a href="' + escapeHtml_(link.href) + '" target="_blank" rel="noopener noreferrer" ' +
    'style="color:#111111;font-weight:700;text-decoration:underline">' + escapeHtml_(link.label) + '</a>'
  )).join(' &nbsp;|&nbsp; ');

  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="x-apple-disable-message-reformatting">' +
    '<style>@media only screen and (max-width:480px){' +
    '.h4-outer{padding:12px 8px !important;}' +
    '.h4-card-pad{padding:18px 14px !important;}' +
    '.h4-h1{font-size:23px !important;}' +
    '.h4-eyebrow{font-size:10px !important;padding:4px 10px !important;}' +
    '.h4-btn-link{padding:12px 14px !important;font-size:13px !important;}' +
    '.h4-stat-cell{display:block !important;width:100% !important;box-sizing:border-box !important;padding:4px 0 !important;}' +
    '}</style></head>' +
    '<body style="margin:0;padding:0;background-color:#FDF9E7;color:#111111;font-family:' + EMAIL_FONT_STACK + ';-webkit-text-size-adjust:100%">' +
    '<div style="display:none;font-size:1px;color:#FDF9E7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">' +
    safePreheader + '&#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847;</div>' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#FDF9E7;table-layout:fixed">' +
    '<tr><td class="h4-outer" align="center" style="padding:24px 12px">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;margin:0 auto;table-layout:fixed">' +

    // Header
    '<tr><td style="padding:0 0 14px 0">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>' +
    '<td valign="middle">' +
    '<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>' +
    '<td style="background-color:#111111;border:2px solid #111111;border-radius:10px;padding:6px 9px;box-shadow:2px 2px 0 #FB923C" valign="middle">' +
    '<img src="' + H4_LOGO_PNG_URL + '" alt="H4 Community" width="24" height="26" style="display:block;border:0;color:#A3E635;font-family:' + EMAIL_FONT_STACK + ';font-size:11px;font-weight:800">' +
    '</td>' +
    '<td style="padding-left:10px;font-family:' + EMAIL_FONT_STACK + ';font-size:14px;font-weight:800;letter-spacing:0.05em;color:#111111;text-transform:uppercase" valign="middle">' +
    'H4 COMMUNITY &middot; DANCE</td>' +
    '</tr></table></td></tr></table></td></tr>' +

    // Main Card
    '<tr><td class="h4-card-pad" style="background-color:#FFFDF7;border:2px solid #111111;border-radius:18px;box-shadow:4px 4px 0 #111111;padding:28px 26px;overflow-wrap:break-word;word-wrap:break-word">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="table-layout:fixed">' +
    '<tr><td><span class="h4-eyebrow" style="display:inline-block;max-width:100%;box-sizing:border-box;background-color:#FFD426;border:2px solid #111111;border-radius:999px;padding:5px 12px;font-size:11px;font-weight:800;line-height:1.35;letter-spacing:0.04em;color:#111111;text-transform:uppercase">' +
    escapeHtml_(eyebrow) + '</span></td></tr>' +
    '<tr><td style="padding:14px 0 8px 0">' +
    '<h1 class="h4-h1" style="margin:0;font-family:' + EMAIL_FONT_STACK + ';font-size:28px;line-height:1.18;font-weight:800;color:#111111">' +
    safeHeadline + '</h1></td></tr>' +
    '<tr><td style="font-family:' + EMAIL_FONT_STACK + ';font-size:16px;line-height:1.6;color:#111111">' +
    bodyHtml + '</td></tr>' +
    '</table></td></tr>' +

    // Footer
    '<tr><td align="center" style="padding:20px 12px 8px 12px;font-family:' + EMAIL_FONT_STACK + ';font-size:13px;line-height:1.6;color:#111111">' +
    '<p style="margin:0 0 2px 0;font-weight:800;letter-spacing:0.04em;text-transform:uppercase">HOW HIP HOP HELPS.</p>' +
    '<p style="margin:0 0 10px 0;font-weight:600">Confidence in Motion.</p>' +
    '<p style="margin:0;font-size:13px">' + footerNav + '</p>' +
    '</td></tr>' +

    '</table></td></tr></table></body></html>';
}

function renderProgramCard_(badge, accentColor, title, description) {
  return '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 12px 0">' +
    '<tr><td style="background-color:#FFFDF7;border:2px solid #111111;border-left:8px solid ' + accentColor + ';border-radius:14px;padding:14px 16px">' +
    '<span style="display:inline-block;background-color:' + accentColor + ';border:1.5px solid #111111;border-radius:999px;padding:2px 9px;font-size:10px;font-weight:800;letter-spacing:0.05em;color:#111111;text-transform:uppercase">' +
    escapeHtml_(badge) + '</span>' +
    '<p style="margin:8px 0 4px 0;font-size:16px;font-weight:800;line-height:1.3;color:#111111">' + escapeHtml_(title) + '</p>' +
    '<p style="margin:0;font-size:14px;line-height:1.55;color:#111111">' + escapeHtml_(description) + '</p>' +
    '</td></tr></table>';
}

function buildTutorialEmail_(to, resource) {
  const subject = "Let's get your classroom moving! Your free H4 dance tutorial";
  const preheader = "Your free hip-hop tutorial, classroom tips and five minutes of movement—no dance experience required.";
  const videoId = extractYouTubeVideoId_(resource);
  const safeResource = escapeHtml_(resource);

  const thumbnailHtml = videoId
    ? '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:18px 0 4px 0">' +
      '<tr><td style="border:2px solid #111111;border-radius:14px;overflow:hidden;background-color:#111111;box-shadow:3px 3px 0 #111111">' +
      '<a href="' + safeResource + '" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none">' +
      '<img src="https://i.ytimg.com/vi/' + videoId + '/maxresdefault.jpg" alt="Watch the 10 Foundational Hip-Hop Grooves video tutorial on YouTube" width="100%" style="display:block;width:100%;max-width:548px;height:auto;border:0;color:#FFFDF7;font-size:14px;font-weight:700">' +
      '</a></td></tr></table>'
    : "";

  const tips = [
    ["Set up your space:", 'Tuck chairs away and give everyone their own "home base" with enough room to move safely.'],
    ["1. Start with the bounce.", "Catch the groove and feel the music before worrying about the steps."],
    ["2. Count like dancers.", 'Let\'s hear that "5, 6, 7, 8!" Try stomping on the odd numbers and clapping on the even numbers.'],
    ["3. Switch it up.", "Encourage your students to explore different grooves and create some moves of their own. There's no perfect way to dance!"]
  ];
  const tipsHtml = '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:12px 0 22px 0">' +
    '<tr><td style="background-color:#FFF28E;border:2px solid #111111;border-radius:16px;box-shadow:3px 3px 0 #111111;padding:18px 18px 10px 18px">' +
    '<p style="margin:0 0 12px 0;font-size:17px;font-weight:800;line-height:1.3;color:#111111">A few quick tips before you hit play!</p>' +
    tips.map(([heading, detail], idx) => (
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="' +
      (idx < tips.length - 1 ? 'border-bottom:1.5px solid #111111;padding-bottom:10px;margin-bottom:10px;' : 'margin-bottom:4px;') + '">' +
      '<tr><td style="font-size:15px;line-height:1.5;color:#111111">' +
      '<strong>' + escapeHtml_(heading) + '</strong><br>' + escapeHtml_(detail) +
      '</td></tr></table>'
    )).join("") +
    '</td></tr></table>';

  const dpaCardHtml = '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 22px 0">' +
    '<tr><td style="background-color:#FDF9E7;border:2px solid #111111;border-radius:16px;padding:18px">' +
    '<p style="margin:0 0 8px 0;font-size:18px;font-weight:800;line-height:1.3;color:#111111">Five minutes. Every day. Zero prep.</p>' +
    '<p style="margin:0;font-size:15px;line-height:1.55;color:#111111">Keep the momentum going with our free, interactive classroom DPA tool. Ten foundational moves, music and endless combinations&mdash;all at the press of a button.</p>' +
    renderEmailButton_("START YOUR 5-MINUTE DPA", H4_DPA_URL, "#38BDF8") +
    '</td></tr></table>';

  const schoolBullets = [
    "One workshop to introduce hip-hop and get your classroom moving.",
    "Three workshops to support your dance curriculum and build on what students learn.",
    "Multiple sessions to prepare for a spring concert or school performance.",
    "A school-wide experience that gets everyone dancing."
  ];
  const schoolHtml = '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px 0;border-top:2px solid #111111;padding-top:18px">' +
    '<tr><td style="padding-top:18px;font-size:15px;line-height:1.55;color:#111111">' +
    '<p style="margin:0 0 10px 0;font-size:18px;font-weight:800;line-height:1.3">Rather have the pros get things started?</p>' +
    '<p style="margin:0 0 8px 0">Whether you\'re looking for:</p>' +
    '<ul style="margin:0 0 12px 0;padding-left:20px">' +
    schoolBullets.map((item) => '<li style="margin:0 0 6px 0">' + escapeHtml_(item) + '</li>').join("") +
    '</ul>' +
    '<p style="margin:0 0 8px 0;font-weight:700">We can get you movin\'!</p>' +
    '<p style="margin:0 0 8px 0">Every school is different, and we\'d love to create something that works for yours.</p>' +
    '<p style="margin:0">Get in touch with Glen to explore programming options, rates and availability.</p>' +
    renderEmailButton_("LET'S GET YOUR SCHOOL MOVING", H4_WORKSHOP_URL, "#FFD426") +
    '<p style="margin:0;font-size:14px">Or simply reply to this email. We\'re happy to help!</p>' +
    '</td></tr></table>';

  const signoffHtml = '<p style="margin:18px 0 0 0;font-size:15px;line-height:1.55;color:#111111">' +
    'Keep dancing,<br><strong>Glen Reyes</strong><br>Founder, H4 Community (How Hip Hop Helps)<br>' +
    '<a href="mailto:' + H4_GLEN_EMAIL + '" style="color:#111111;font-weight:700;text-decoration:underline">' + H4_GLEN_EMAIL + '</a></p>';

  const bodyHtml = '<p style="margin:0 0 12px 0">Hey there,</p>' +
    '<p style="margin:0 0 12px 0">Here\'s your free H4 dance tutorial, along with a few helpful tips from one of our H4 co-op students!</p>' +
    '<p style="margin:0">No dance experience? No problem! You don\'t have to be a dancer to inspire one. Just press play, find your rhythm and have some fun with your students.</p>' +
    thumbnailHtml +
    renderEmailButton_("WATCH THE 10 FOUNDATIONAL HIP-HOP GROOVES", resource, "#A3E635") +
    tipsHtml +
    dpaCardHtml +
    schoolHtml +
    signoffHtml;

  const htmlBody = renderEmailShell_(
    preheader,
    "FREE · NO LOGIN · ZERO PREP · MADE FOR CLASSROOMS",
    "Ready to get the room moving?",
    bodyHtml,
    [
      { label: "H4 Community", href: H4_SITE_URL },
      { label: "Free Classroom DPA", href: H4_DPA_URL },
      { label: "DanceStash", href: H4_DANCESTASH_URL }
    ]
  );

  const body = [
    "H4 COMMUNITY · DANCE",
    "FREE · NO LOGIN · ZERO PREP · MADE FOR CLASSROOMS",
    "",
    "Ready to get the room moving?",
    "",
    "Hey there,",
    "",
    "Here's your free H4 dance tutorial, along with a few helpful tips from one of our H4 co-op students!",
    "No dance experience? No problem! You don't have to be a dancer to inspire one. Just press play, find your rhythm and have some fun with your students.",
    "",
    "WATCH THE 10 FOUNDATIONAL HIP-HOP GROOVES: " + resource,
    "",
    "A few quick tips before you hit play!",
    '- Set up your space: Tuck chairs away and give everyone their own "home base" with enough room to move safely.',
    "- 1. Start with the bounce. Catch the groove and feel the music before worrying about the steps.",
    '- 2. Count like dancers. Let\'s hear that "5, 6, 7, 8!" Try stomping on the odd numbers and clapping on the even numbers.',
    "- 3. Switch it up. Encourage your students to explore different grooves and create some moves of their own. There's no perfect way to dance!",
    "",
    "Five minutes. Every day. Zero prep.",
    "Keep the momentum going with our free, interactive classroom DPA tool. Ten foundational moves, music and endless combinations—all at the press of a button.",
    "START YOUR 5-MINUTE DPA: " + H4_DPA_URL,
    "",
    "Rather have the pros get things started?",
    "Whether you're looking for:",
    "- One workshop to introduce hip-hop and get your classroom moving.",
    "- Three workshops to support your dance curriculum and build on what students learn.",
    "- Multiple sessions to prepare for a spring concert or school performance.",
    "- A school-wide experience that gets everyone dancing.",
    "",
    "We can get you movin'!",
    "Every school is different, and we'd love to create something that works for yours.",
    "Get in touch with Glen to explore programming options, rates and availability.",
    "LET'S GET YOUR SCHOOL MOVING: " + H4_WORKSHOP_URL,
    "Or simply reply to this email. We're happy to help!",
    "",
    "Keep dancing,",
    "Glen Reyes",
    "Founder, H4 Community (How Hip Hop Helps)",
    H4_GLEN_EMAIL,
    "",
    "HOW HIP HOP HELPS.",
    "Confidence in Motion.",
    "H4 Community: " + H4_SITE_URL,
    "Free Classroom DPA: " + H4_DPA_URL,
    "DanceStash: " + H4_DANCESTASH_URL
  ].join("\n");

  return { to, subject, body, htmlBody, name: "H4 Community", replyTo: H4_REPLY_EMAIL };
}

function buildProgrammingEmail_(to, interest, fullName) {
  const subject = "Let's get your school movin'! | H4 Community";
  const preheader = "One workshop, a dance program or something bigger. Let's create something that works for your school.";
  const firstName = extractFirstName_(fullName);
  const greeting = firstName ? "Hi " + firstName + "," : "Hi there,";
  const isPaidProgram = SCHOOL_PROGRAM_INTERESTS.includes(interest);
  const openingLine = isPaidProgram
    ? "Thanks for reaching out to H4 Community! We're excited to explore how we can bring more music, movement and confidence to your school."
    : "Thanks for reaching out to H4 Community! We'd love to hear what you have in mind and explore how we can bring more music, movement and confidence to your school.";

  const cardsHtml =
    renderProgramCard_(
      "ONE WORKSHOP", "#A3E635",
      "One Workshop. A Great Start.",
      "Introduce your students to hip-hop, get them excited about movement and discover how easy it can be to bring dance into the classroom."
    ) +
    renderProgramCard_(
      "THREE WORKSHOPS", "#38BDF8",
      "Three Workshops. Build Their Skills.",
      "Help your students build on what they've learned, explore dance foundations and develop their creativity while supporting your dance curriculum."
    ) +
    renderProgramCard_(
      "MULTIPLE SESSIONS", "#FFD426",
      "Multiple Sessions. Something Bigger.",
      "Preparing for a spring concert, school showcase or special event? Let's work together to create an experience your students will be proud of."
    );

  const somethingElseHtml = '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px 0">' +
    '<tr><td style="background-color:#FFF28E;border:2px solid #111111;border-radius:14px;padding:14px 16px">' +
    '<p style="margin:0 0 4px 0;font-size:15px;font-weight:800;color:#111111">Something Else Entirely?</p>' +
    '<p style="margin:0;font-size:14px;line-height:1.55;color:#111111">We\'re always open to new ideas. Tell us what you\'re imagining, and let\'s see how we can make it happen!</p>' +
    '</td></tr></table>';

  const stats = [
    ["40+", "Schools Reached"],
    ["1,000+", "Students Dancing"],
    ["40+", "Youth Mentors Trained"]
  ];
  const socialProofHtml = '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px 0">' +
    '<tr><td style="background-color:#FDF9E7;border:2px solid #111111;border-radius:16px;box-shadow:3px 3px 0 #111111;padding:18px">' +
    '<p style="margin:0 0 4px 0;font-size:18px;font-weight:800;color:#111111">Small Moves. Big Impact.</p>' +
    '<p style="margin:0 0 12px 0;font-size:14px;color:#111111">Over the past two years:</p>' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>' +
    stats.map(([num, label]) => (
      '<td class="h4-stat-cell" width="33%" valign="top" style="padding:4px">' +
      '<div style="background-color:#FFFDF7;border:2px solid #111111;border-radius:12px;padding:10px 8px;text-align:center">' +
      '<div style="font-size:20px;font-weight:800;line-height:1.1;color:#111111">' + num + '</div>' +
      '<div style="margin-top:4px;font-size:12px;font-weight:700;line-height:1.3;color:#111111">' + label + '</div>' +
      '</div></td>'
    )).join("") +
    '</tr></table>' +
    '<p style="margin:12px 0 0 0;font-size:14px;line-height:1.5;font-weight:600;color:#111111">We\'re not just teaching dance. We\'re helping young people discover what they\'re capable of.</p>' +
    '</td></tr></table>';

  const ctaSectionHtml = '<p style="margin:0 0 8px 0;font-size:18px;font-weight:800;color:#111111">Let\'s make it happen.</p>' +
    '<p style="margin:0 0 10px 0">I\'ll be following up to learn more about your school, answer your questions and discuss programming options, rates and availability.</p>' +
    '<p style="margin:0">In the meantime, feel free to reply directly to this email. I\'d love to hear what you have in mind!</p>' +
    renderEmailButton_("CONNECT WITH GLEN", "mailto:" + H4_GLEN_EMAIL, "#A3E635");

  const dpaStripHtml = '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:6px 0 18px 0">' +
    '<tr><td style="background-color:#FDF9E7;border:2px solid #111111;border-radius:14px;padding:16px">' +
    '<p style="margin:0;font-size:14px;line-height:1.55;color:#111111">Want to get your students moving today? Our free five-minute classroom DPA resource is always available.</p>' +
    renderEmailButton_("TRY H4'S FREE CLASSROOM DPA", H4_DPA_URL, "#FFD426") +
    '</td></tr></table>';

  const signoffHtml = '<p style="margin:14px 0 0 0;font-size:15px;line-height:1.55;color:#111111">' +
    'Looking forward to connecting!<br><strong>Glen Reyes</strong><br>Founder, H4 Community (How Hip Hop Helps)<br>' +
    '<a href="mailto:' + H4_GLEN_EMAIL + '" style="color:#111111;font-weight:700;text-decoration:underline">' + H4_GLEN_EMAIL + '</a></p>';

  const bodyHtml = '<p style="margin:0 0 12px 0">' + escapeHtml_(greeting) + '</p>' +
    '<p style="margin:0 0 12px 0">' + escapeHtml_(openingLine) + '</p>' +
    '<p style="margin:0 0 18px 0">We know that every school has different needs, schedules and budgets. That\'s why we believe great dance programming should start with a conversation, not a fixed package.</p>' +
    '<p style="margin:0 0 12px 0;font-size:18px;font-weight:800;color:#111111">What do you have in mind?</p>' +
    cardsHtml +
    somethingElseHtml +
    socialProofHtml +
    ctaSectionHtml +
    dpaStripHtml +
    signoffHtml;

  const htmlBody = renderEmailShell_(
    preheader,
    "MOVEMENT · CREATIVITY · CONFIDENCE",
    "Let's get your school movin'!",
    bodyHtml,
    [
      { label: "H4 Community", href: H4_SITE_URL },
      { label: "H4 Dance", href: H4_DPA_URL }
    ]
  );

  const body = [
    greeting,
    "",
    openingLine,
    "We know that every school has different needs, schedules and budgets. That's why we believe great dance programming should start with a conversation, not a fixed package.",
    "",
    "What do you have in mind?",
    "- One Workshop. A Great Start. Introduce your students to hip-hop, get them excited about movement and discover how easy it can be to bring dance into the classroom.",
    "- Three Workshops. Build Their Skills. Help your students build on what they've learned, explore dance foundations and develop their creativity while supporting your dance curriculum.",
    "- Multiple Sessions. Something Bigger. Preparing for a spring concert, school showcase or special event? Let's work together to create an experience your students will be proud of.",
    "- Something Else Entirely? We're always open to new ideas. Tell us what you're imagining, and let's see how we can make it happen!",
    "",
    "Small Moves. Big Impact.",
    "Over the past two years: 40+ Schools Reached | 1,000+ Students Dancing | 40+ Youth Mentors Trained.",
    "We're not just teaching dance. We're helping young people discover what they're capable of.",
    "",
    "Let's make it happen.",
    "I'll be following up to learn more about your school, answer your questions and discuss programming options, rates and availability.",
    "In the meantime, feel free to reply directly to this email. I'd love to hear what you have in mind!",
    "CONNECT WITH GLEN: mailto:" + H4_GLEN_EMAIL,
    "",
    "Want to get your students moving today? Our free five-minute classroom DPA resource is always available.",
    "TRY H4'S FREE CLASSROOM DPA: " + H4_DPA_URL,
    "",
    "Looking forward to connecting!",
    "Glen Reyes",
    "Founder, H4 Community (How Hip Hop Helps)",
    H4_GLEN_EMAIL,
    "",
    "HOW HIP HOP HELPS.",
    "Confidence in Motion.",
    "H4 Community: " + H4_SITE_URL,
    "H4 Dance: " + H4_DPA_URL
  ].join("\n");

  return { to, subject, body, htmlBody, name: "H4 Community", replyTo: H4_REPLY_EMAIL };
}

function buildSignupEmail_(to, interest, resource, fullName) {
  if (isFreeResourceInterest_(interest)) {
    return buildTutorialEmail_(to, resource);
  }
  return buildProgrammingEmail_(to, interest, fullName);
}
