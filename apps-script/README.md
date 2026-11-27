# DPA teacher intake

## Test deployment

1. Upload Code.gs, Email.gs, and appsscript.json to the isolated test Apps Script
   project. Copy data/ontario-schools.js to SchoolDirectory.gs in that project.
   Enable the Advanced Google Sheets service.
2. Set these Apps Script project properties:

   | Property | Test value |
   |---|---|
   | SPREADSHEET_ID | 1xTUHHc0GTANVVAMWRO_jkNOi9vMILgg3NUhpLOkcULU |
   | FREE_RESOURCE_YOUTUBE_URL | Optional override. Leave blank to use https://youtu.be/bgyMPYTSN7Y?feature=shared. |
   | TEST_EMAIL_OVERRIDE | An inbox you control and have authorized for testing |

3. As the deployment owner, authorize Sheets and MailApp. Deploy a new web app
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
Queued rows are retried when MailApp quota is available. The same request key
does not produce duplicate leads or emails. A second request to the same
address for the same interest within 24 hours is saved with email status
Suppressed when the original request already has an email attempt pending or
recorded. A row in Needs review or left in Sending requires checking whether
the email was actually sent before setting it back to Queued.

Apps Script has per-account mail quotas. The trigger uses the same account and
does not bypass that quota. Neither the endpoint nor the site can read or
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
