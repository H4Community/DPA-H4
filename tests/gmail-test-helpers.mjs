import { randomUUID } from "node:crypto";

export const gmailUtilities = {
  Charset: { UTF_8: "UTF-8" },
  base64Encode: (value) => Buffer.from(value, "utf8").toString("base64"),
  base64EncodeWebSafe: (value) => Buffer.from(value, "utf8").toString("base64url"),
  getUuid: randomUUID
};

export function readGmailMessage(raw) {
  const mime = Buffer.from(raw, "base64url").toString("utf8");
  const split = mime.indexOf("\r\n\r\n");
  const headers = Object.fromEntries(mime.slice(0, split).replace(/\r\n[ \t]+/g, " ")
    .split("\r\n").map((line) => {
      const colon = line.indexOf(":");
      return [line.slice(0, colon).toLowerCase(), line.slice(colon + 1).trim()];
    }));
  const decodeHeader = (value) => value.replace(/\?=\s+=\?/g, "?==?")
    .replace(/=\?UTF-8\?B\?([^?]*)\?=/gi, (_, encoded) => Buffer.from(encoded, "base64").toString("utf8"));
  const payload = mime.slice(split + 4);
  const message = {
    to: headers.to,
    name: decodeHeader(headers.from.replace(/ <[^>]+>$/, "")),
    subject: decodeHeader(headers.subject)
  };
  if (headers["reply-to"]) message.replyTo = headers["reply-to"];
  const boundary = /boundary="([^"]+)"/.exec(headers["content-type"])?.[1];
  if (boundary) {
    for (const part of payload.split("--" + boundary).slice(1, -1)) {
      const offset = part.indexOf("\r\n\r\n");
      const body = Buffer.from(part.slice(offset + 4).trim(), "base64").toString("utf8");
      if (/Content-Type: text\/html/i.test(part.slice(0, offset))) message.htmlBody = body;
      else message.body = body;
    }
  } else message.body = Buffer.from(payload.trim(), "base64").toString("utf8");
  return { message, mime, headers };
}
