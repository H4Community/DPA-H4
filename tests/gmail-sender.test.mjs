import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { gmailUtilities, readGmailMessage } from "./gmail-test-helpers.mjs";

const source = readFileSync(new URL("../apps-script/Email.gs", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../apps-script/appsscript.json", import.meta.url), "utf8"));

function runtime(send = () => ({ id: "accepted-message-id" })) {
  const context = vm.createContext({ Utilities: gmailUtilities, Gmail: { Users: { Messages: { send } } } });
  vm.runInContext(source, context);
  return context;
}

test("Gmail receives one recipient and preserves complete UTF-8 HTML and plain-text templates", () => {
  const context = runtime((request, user) => {
    assert.equal(user, "me");
    assert.match(request.raw, /^[A-Za-z0-9_=-]+$/);
    const { message, mime, headers } = readGmailMessage(request.raw);
    assert.deepEqual(message, expected);
    assert.match(headers.from, /<info@h4community\.org>$/);
    assert.ok(!headers.cc && !headers.bcc);
    assert.ok(mime.split("\r\n").every((line) => line.length <= 998));
    return { id: "gmail-message-id" };
  });
  const expected = {
    to: "teacher@example.org",
    name: "H4 Community",
    subject: "New H4 School Inquiry — " + "École confiance 🎵 ".repeat(12),
    body: "Hello Élodie,\n\nLet's move. 🎵\n".repeat(10),
    htmlBody: '<p>Hello Élodie,</p><a href="https://youtu.be/bgyMPYTSN7Y?feature=shared">Let’s move 🎵</a>',
    replyTo: "info@h4community.org"
  };
  assert.equal(context.sendSignupMessage_(expected), "gmail-message-id");
});

test("plain-text staff notification remains plain text", () => {
  const context = runtime();
  const expected = { to: "staff@example.org", subject: "New inquiry", body: "School: Example\nGrades: 6, 7", name: "H4 Community" };
  const { message, headers } = readGmailMessage(context.buildGmailRawMessage_(expected));
  assert.deepEqual(message, expected);
  assert.equal(headers["content-type"], "text/plain; charset=UTF-8");
});

test("recipient lists and header injection fail before calling Gmail", () => {
  let calls = 0;
  const context = runtime(() => { calls++; return { id: "unexpected" }; });
  const valid = { to: "teacher@example.org", subject: "H4 resources", body: "Test" };
  for (const change of [
    { to: "a@example.org,b@example.org" },
    { to: "teacher@example.org\r\nBcc: another@example.org" },
    { replyTo: "a@example.org,b@example.org" },
    { subject: "H4\r\nBcc: another@example.org" },
    { name: "H4\r\nBcc: another@example.org" }
  ]) assert.throws(() => context.sendSignupMessage_({ ...valid, ...change }));
  assert.equal(calls, 0);
});

test("manifest requests send-only Gmail access with no mailbox read, modify, or full-mail scope", () => {
  assert.ok(manifest.oauthScopes.includes("https://www.googleapis.com/auth/gmail.send"));
  assert.ok(!manifest.oauthScopes.some((scope) => /mail\.google\.com|gmail\.(readonly|modify|compose)/.test(scope)));
  assert.ok(manifest.dependencies.enabledAdvancedServices.some((service) => service.userSymbol === "Gmail" && service.serviceId === "gmail" && service.version === "v1"));
});
