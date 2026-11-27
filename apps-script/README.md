# DPA teacher intake

## Test deployment

1. Upload Code.gs, Email.gs, and appsscript.json to the isolated test Apps Script
   project. Copy data/ontario-schools.js to SchoolDirectory.gs in that project.
   Enable the Advanced Google Sheets and Gmail services.
2. Set these Apps Script project properties:

   | Property | Test value |
   |---|---|
   | SPREADSHEET_ID | 1xTUHHc0GTANVVAMWRO_jkNOi9vMILgg3NUhpLOkcULU |
   | FREE_RESOURCE_YOUTUBE_URL | Optional override. Leave blank to use https://youtu.be/bgyMPYTSN7Y?feature=shared. |
   | TEST_EMAIL_OVERRIDE | An inbox you control and have authorized for testing |

3. As the deployment owner, authorize Sheets, the existing MailApp quota check,
   and Gmail's **send-only** scope (`gmail.send`). Deploy a new web app
   version that runs as the owner and allows signed-out form submissions. Set
   the local test page's workshopForm data-endpoint to that deployment's /exec
   URL. Keep the Sheet itself private.
4. From a signed-out browser, submit one parent free-resource request and one
   staff workshop request using synthetic details. Verify both rows and both
   H4-branded emails in the authorized test inbox. Retry with the original
   submission key and verify the same Lead ID, one row, and one email.
   Confirm that the YouTube button resolves to the approved resource.
5. In Apps Script, add one time-driven trigger for processQueuedEmails, every
   15 minutes, under the same account that owns the deployment.

## Production setup

Use a separate Apps Script project for production. Deployments in the same project share script properties.
Deploy this version against the production Sheet ID
1b1Zt_Km3ibBFX6U-1YnaIiA0442rho5o2g7pbMFiNsk. Leave FREE_RESOURCE_YOUTUBE_URL
blank to use the link above, or set it to an approved replacement. Clear TEST_EMAIL_OVERRIDE in production. Deploy
from the Google account that should send on behalf of H4 Community. The display
name is H4 Community and replies go to info@h4community.org. Set only the
production /exec URL in the live form after the test passes.

The confirmation email is transactional. A request is saved before the email
attempt. The Email Status and Email Sent At columns track the send attempt.
`Sent` means Gmail returned a message ID, not that the recipient received it.
Check Google Workspace Email Log Search when investigating missing delivery.
Queued rows are retried when MailApp quota is available. The same request key
does not produce duplicate leads or emails. A second request to the same
address for the same interest within 24 hours is saved with email status
Suppressed when the original request already has an email attempt pending or
recorded. A row in Needs review or left in Sending requires checking whether
the email was actually sent before setting it back to Queued.

Sending uses `Gmail.Users.Messages.send` through the Advanced Gmail service.
The explicit `gmail.send` scope permits sending only; the application does not
request mailbox read, modify, or full-mail access. Plain-text and HTML bodies
are preserved as UTF-8 MIME parts. There is no fallback to `MailApp.sendEmail`.

Apps Script and Gmail have per-account mail quotas. The existing MailApp
remaining-quota check is retained as a conservative guard; it does not measure
Gmail API quota. Gmail enforces its own limits, and an unconfirmed send remains
`Needs review` for manual investigation rather than being retried blindly.
The trigger uses the same account and does not bypass quotas.
Neither the endpoint nor the site can read or
return lead details. Archiving a web app deployment disables its endpoint.
Remove its time-driven trigger separately if retiring the deployment.

## Deploying an Apps Script update before a frontend release

When a PR relaxes server validation (for example allowing blank `fullName` or
omitted school details on `Free Online Dance Tutorial` and `Learn More`
requests while keeping full validation for `Full-Day School Workshop` and
legacy live-form payloads), deploy the Apps Script update **before** merging
the frontend changes:

1. Push the updated `apps-script/Code.gs` and `apps-script/Email.gs` to the
   production Apps Script project under `info@h4community.org` (using `clasp`
   or the Apps Script editor).
2. Update the existing Web App deployment (`redeploy` / **Deploy → Manage
   deployments → Edit → New version**) so the live `/exec` URL stays unchanged.
3. Verify the currently live frontend still submits cleanly, then merge the
   frontend PR.

## Refresh the directory

Download the pipe-separated English Publicly Funded Schools export from the
[Ontario Data Catalogue](https://data.ontario.ca/dataset/ontario-public-school-contact-information).

Run `python scripts/refresh_ontario_schools.py path/to/export.txt` and deploy the
same generated directory to the site and Apps Script.

## Release procedure with staff lead notifications

1. Prepare a separate Apps Script project and private test spreadsheet as
   described above. In the test sheet, add the optional headers
   `Staff Notification Status` and `Staff Notification Sent At` to row 1 of
   `Teacher Leads`, exactly once each. Format both timestamp columns as
   date/time. Set `TEST_EMAIL_OVERRIDE` and `H4_LEAD_NOTIFICATION_EMAIL` to an
   authorized test inbox before enabling the test endpoint. The override
   takes precedence for both kinds of email. Use the test `/exec` URL in a
   local or staging copy only.
2. After approval, test the candidate from a signed-out browser against that
   test endpoint. Verify a programming request and an Other inquiry produce
   separate requester and staff messages, and a free tutorial sends only the
   requester resource. Check actual Sheet rows, both status columns, correct
   timing and timestamps, and retrying with the same submission key.
   Verify a queued alert by running the configured `processQueuedEmails`
   trigger under the test owner. Verify the old frontend against this test
   deployment as well.
3. After production authorization, record the current production deployment
   version, `/exec` URL and frontend commit. Add the same two headers and
   date/time formats to the production Sheet without editing historical
   rows. The handler accepts the old sheet layout, but staff alerts require
   both headers. Records with blank staff status are not backfilled. Monitor
   the Sheet during rollout to catch any submissions handled by the old
   deployment before the update.
4. Set `H4_LEAD_NOTIFICATION_EMAIL` to the approved staff inbox (proposed:
   `info@h4community.org`). Confirm `TEST_EMAIL_OVERRIDE` is cleared in
   production. Upload `Code.gs` and `Email.gs` to the existing Apps Script
   project under the deployment owner. Check private Sheet access, Advanced
   Sheets and Gmail services, sender authorization and that exactly one scheduled
   `processQueuedEmails` trigger exists. Edit the existing deployment and
   choose **New version**. Confirm the public `/exec` URL stays the same.
5. With authorization, check the current live form against the updated
   backend before publishing the frontend. After publishing, verify one paid
   inquiry and one tutorial using the approved production smoke process.
   Inspect requester delivery and staff handoff, including the staff status.
6. For normal rollback, revert the frontend first and keep the compatible
   backend so open tabs still work. If the backend must be rolled back, edit
   the existing deployment to select the old version. Review the current
   project source separately because the scheduled trigger uses it. Keep
   Sheet data and the added headers, and account for any queued rows before
   reverting trigger code.

Staff status is independent of requester mail. Quota exhaustion or missing
recipient configuration leaves alerts queued. `Sending` and `Needs review`
require checking the authorized sender's delivery history before requeuing.
Leave ambiguous attempts alone until that check to avoid duplicate emails.
Staff alerts are skipped for both names of the free tutorial.

## MailApp delivery incident and candidate fix (November 27, 2026)

Production Email Log Search confirmed external tutorial messages bounced with
Google's generic "Message rejected" response while an internal copy delivered.
A separate plain message sent from Gmail reached the external test inbox.
A plain message sent using MailApp, without links or images, also bounced.
This narrows the observed failure to the MailApp sending path; Google did not
expose a more specific cause. After the owner approved `gmail.send`, two plain
messages sent through the candidate Gmail API helper were confirmed in the
approved external inbox. The unchanged full HTML tutorial was then confirmed
in the external inbox at 2:42 p.m. Toronto time, with SPF and DKIM passing.
Python's standard-library email parser independently confirmed the candidate
preserves the original HTML, plain text, subject and recipient.

The owner-authorized production release is **version 6**, deployed at 2:47 p.m.
Toronto time on November 27, 2026. The existing `/exec` URL, deployment account
and public access settings were retained. Temporary diagnostic functions were
removed before deployment. Twenty-two focused automated tests passed.
An idempotent replay of an existing request is used for the post-deploy check;
it does not send another message. A new signup-to-inbox run after publishing
has not been performed. The original bounced records retain their historical
status and are not automatically resent.

Before release, record the existing web-app version and obtain authorization
for the `gmail.send` permission and production deployment. Run the candidate
against the owner's approved external test inbox, first plain text and then
the unchanged HTML tutorial. Require received-message evidence in the external
mailbox and a successful Email Log Search result before updating the existing
web-app deployment. Keep the URL, execution identity and public access settings.
Do not automatically requeue historical `Sent` or `Suppressed` rows: they can
include genuine deliveries. Re-send only the specifically confirmed bounced
requests after authorization. Remove temporary diagnostic functions afterwards.

Rollback: select the recorded previous web-app version and restore its
`Email.gs` and manifest for the scheduled trigger. Keep Sheet records and
existing columns intact. The previous MailApp path has a confirmed external
delivery failure, so reverting code does not resolve that incident.
