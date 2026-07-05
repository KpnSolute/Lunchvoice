// send-email: Supabase Auth "Send Email" hook.
//
// Supabase generates the OTP/token and calls this function instead of sending
// its own email. We deliver via AWS SES. The token stays inside Supabase Auth
// so verifyOtp() and all RLS are unchanged.
//
// Secrets required:
//   SEND_EMAIL_HOOK_SECRET  v1,whsec_... (from Supabase Auth hook config)
//   AWS_REGION              us-east-1
//   AWS_ACCESS_KEY_ID
//   AWS_SECRET_ACCESS_KEY
//   MAIL_FROM               noreply@lunchvoice.com
//   MAIL_FROM_NAME          Lunch Voice
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const hookSecret = (Deno.env.get("SEND_EMAIL_HOOK_SECRET") ?? "").replace("v1,whsec_", "");
const awsRegion = Deno.env.get("AWS_REGION") ?? "us-east-1";
const awsKeyId = Deno.env.get("AWS_ACCESS_KEY_ID") ?? "";
const awsSecret = Deno.env.get("AWS_SECRET_ACCESS_KEY") ?? "";
const fromEmail = Deno.env.get("MAIL_FROM") ?? "";
const fromName = Deno.env.get("MAIL_FROM_NAME") ?? "Lunch Voice";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function codeEmail(code: string, action: string): { subject: string; html: string; text: string } {
  const verb = action === "signup" ? "Confirm your sign-up" : "Sign in";
  const subject = `${code} is your Lunch Voice code`;
  const text = `Your Lunch Voice verification code is ${code}. It expires shortly. If you didn't request this, ignore this email.`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:440px;margin:0 auto;padding:24px;color:#2B2622">
      <p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#E8A33D;margin:0">Lunch Voice</p>
      <h2 style="margin:8px 0 4px">${verb}</h2>
      <p style="color:#7A7264;margin:0 0 16px">Enter this code to continue. It expires shortly.</p>
      <div style="font-size:34px;font-weight:700;letter-spacing:.24em;background:#FBF3E4;border:1px solid #E4D9C3;border-radius:10px;padding:16px;text-align:center">${code}</div>
      <p style="color:#8B8272;font-size:12px;margin-top:16px">If you didn't request this, you can ignore this email.</p>
    </div>`;
  return { subject, html, text };
}

// AWS Signature V4 — minimal implementation for SES SendEmail only.
async function hmac(key: ArrayBuffer | Uint8Array, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
}

async function sha256hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sigV4(method: string, path: string, body: string): Promise<Record<string, string>> {
  const now = new Date();
  const datestamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amzdate = now.toISOString().replace(/[:\-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const service = "ses";
  const host = `email.${awsRegion}.amazonaws.com`;
  const contentType = "application/json";
  const payloadHash = await sha256hex(body);

  const canonicalHeaders =
    `content-type:${contentType}\nhost:${host}\nx-amz-date:${amzdate}\n`;
  const signedHeaders = "content-type;host;x-amz-date";
  const canonicalRequest = [method, path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");

  const credScope = `${datestamp}/${awsRegion}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzdate, credScope, await sha256hex(canonicalRequest)].join("\n");

  const enc = new TextEncoder();
  const kDate = await hmac(enc.encode("AWS4" + awsSecret), datestamp);
  const kRegion = await hmac(kDate, awsRegion);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  const sigBuf = await hmac(kSigning, stringToSign);
  const signature = Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");

  return {
    "Content-Type": contentType,
    "X-Amz-Date": amzdate,
    Authorization: `AWS4-HMAC-SHA256 Credential=${awsKeyId}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("not allowed", { status: 405 });

  if (!hookSecret || !awsKeyId || !awsSecret || !fromEmail) {
    console.error(JSON.stringify({
      event: "send_email_missing_config",
      hasHookSecret: Boolean(hookSecret),
      hasAwsKey: Boolean(awsKeyId),
      hasAwsSecret: Boolean(awsSecret),
      hasFromEmail: Boolean(fromEmail),
    }));
    return json({ error: "Email service is not configured" }, 500);
  }

  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);

  let user: { email: string };
  let email_data: { token: string; email_action_type: string };
  try {
    const wh = new Webhook(hookSecret);
    ({ user, email_data } = wh.verify(payload, headers) as {
      user: { email: string };
      email_data: { token: string; email_action_type: string };
    });
  } catch (_e) {
    return json({ error: "Invalid signature" }, 401);
  }

  const { subject, html, text } = codeEmail(email_data.token, email_data.email_action_type);

  const sesPath = "/v2/email/outbound-emails";
  const sesBody = JSON.stringify({
    FromEmailAddress: `${fromName} <${fromEmail}>`,
    Destination: { ToAddresses: [user.email] },
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: html, Charset: "UTF-8" },
          Text: { Data: text, Charset: "UTF-8" },
        },
      },
    },
  });

  const sigHeaders = await sigV4("POST", sesPath, sesBody);
  const res = await fetch(`https://email.${awsRegion}.amazonaws.com${sesPath}`, {
    method: "POST",
    headers: sigHeaders,
    body: sesBody,
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error(JSON.stringify({
      event: "ses_send_failed",
      status: res.status,
      detail: detail.slice(0, 2000),
    }));
    return json({ error: "Email provider rejected the message" }, 500);
  }

  return json({});
});
