// send-email: Supabase Auth "Send Email" hook.
//
// Supabase generates the OTP/token and calls this function instead of sending
// its own email. We deliver via Azure Communication Services Email. The token
// stays inside Supabase Auth so verifyOtp() and all RLS are unchanged.
//
// Secrets required:
//   SEND_EMAIL_HOOK_SECRET                  v1,whsec_... (from Supabase Auth hook config)
//   ACS_ENDPOINT + ACS_ACCESS_KEY           Azure Communication Services endpoint/key
//     or AZURE_COMMUNICATION_CONNECTION_STRING endpoint=https://...;accesskey=...
//   MAIL_FROM or AZURE_EMAIL_SENDER         sender from the verified Azure email domain
//   MAIL_FROM_NAME                          Lunch Voice
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const hookSecret = (Deno.env.get("SEND_EMAIL_HOOK_SECRET") ?? "").replace("v1,whsec_", "");
const azureConnectionString = Deno.env.get("AZURE_COMMUNICATION_CONNECTION_STRING") ?? "";
const acsEndpoint = Deno.env.get("ACS_ENDPOINT") ?? "";
const acsAccessKey = Deno.env.get("ACS_ACCESS_KEY") ?? "";
const azureSender = Deno.env.get("MAIL_FROM") ?? Deno.env.get("AZURE_EMAIL_SENDER") ?? "";
const fromName = Deno.env.get("MAIL_FROM_NAME") ?? "Lunch Voice";
const azureApiVersion = "2025-09-01";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Supabase Auth hooks expect errors as { error: { http_code, message } }.
function errorJson(message: string, status: number): Response {
  return json({ error: { http_code: status, message } }, status);
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

function azureCredentials(): { endpoint: URL; accessKey: string } | null {
  if (acsEndpoint && acsAccessKey) {
    try {
      return { endpoint: new URL(acsEndpoint), accessKey: acsAccessKey };
    } catch (_e) {
      return null;
    }
  }

  const parts = new Map(
    azureConnectionString
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const idx = part.indexOf("=");
        return idx === -1 ? ["", ""] : [part.slice(0, idx).toLowerCase(), part.slice(idx + 1)];
      }),
  );

  const endpoint = parts.get("endpoint");
  const accessKey = parts.get("accesskey");
  if (!endpoint || !accessKey) return null;

  try {
    return { endpoint: new URL(endpoint), accessKey };
  } catch (_e) {
    return null;
  }
}

function base64(bytes: ArrayBuffer | Uint8Array): string {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function sha256base64(data: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return base64(buf);
}

async function hmacBase64(base64Key: string, msg: string): Promise<string> {
  const rawKey = Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", rawKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return base64(signature);
}

async function azureHeaders(endpoint: URL, pathAndQuery: string, body: string, accessKey: string): Promise<Record<string, string>> {
  const date = new Date().toUTCString();
  const host = endpoint.host;
  const contentHash = await sha256base64(body);
  const stringToSign = `POST\n${pathAndQuery}\n${date};${host};${contentHash}`;
  const signature = await hmacBase64(accessKey, stringToSign);

  return {
    "Content-Type": "application/json",
    "x-ms-date": date,
    "x-ms-content-sha256": contentHash,
    Authorization: `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${signature}`,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("not allowed", { status: 405 });

  const azure = azureCredentials();
  if (!hookSecret || !azure || !azureSender) {
    console.error(JSON.stringify({
      event: "send_email_missing_config",
      hasHookSecret: Boolean(hookSecret),
      hasAcsEndpoint: Boolean(acsEndpoint),
      hasAcsAccessKey: Boolean(acsAccessKey),
      hasAzureConnectionString: Boolean(azureConnectionString),
      hasSender: Boolean(azureSender),
    }));
    return errorJson("Email service is not configured", 500);
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
    return errorJson("Invalid signature", 401);
  }

  if (!user?.email || !email_data?.token || !email_data?.email_action_type) {
    console.error(JSON.stringify({
      event: "send_email_invalid_payload",
      hasEmail: Boolean(user?.email),
      hasToken: Boolean(email_data?.token),
      hasActionType: Boolean(email_data?.email_action_type),
    }));
    return errorJson("Missing required email fields", 400);
  }

  const { subject, html, text } = codeEmail(email_data.token, email_data.email_action_type);

  const pathAndQuery = `/emails:send?api-version=${azureApiVersion}`;
  const emailBody = JSON.stringify({
    senderAddress: azureSender,
    content: {
      subject,
      plainText: text,
      html,
    },
    recipients: {
      to: [{ address: user.email }],
    },
    headers: {
      "x-lunch-voice-provider": "azure-communication-services",
    },
    replyTo: [{ address: azureSender, displayName: fromName }],
  });

  try {
    const signedHeaders = await azureHeaders(azure.endpoint, pathAndQuery, emailBody, azure.accessKey);
    const res = await fetch(new URL(pathAndQuery, azure.endpoint).toString(), {
      method: "POST",
      headers: signedHeaders,
      body: emailBody,
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error(JSON.stringify({
        event: "azure_email_send_failed",
        status: res.status,
        detail: detail.slice(0, 2000),
      }));
      return errorJson("Email provider rejected the message", 500);
    }
  } catch (e) {
    console.error(JSON.stringify({
      event: "azure_email_send_error",
      message: e instanceof Error ? e.message : String(e),
    }));
    return errorJson("Email provider request failed", 500);
  }

  return json({});
});
