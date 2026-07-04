// send-email: Supabase Auth "Send Email" hook.
//
// Supabase still generates the real OTP/token and calls this function instead of sending
// its own email. We deliver the 6-digit code via MailerSend. Because the token stays inside
// Supabase Auth, verifyOtp() and all RLS are unchanged — we only swap the mail transport.
//
// Setup (see README):
//   1. Dashboard → Auth → Hooks → enable "Send Email" hook → point at this function → copy secret.
//   2. supabase secrets set SEND_EMAIL_HOOK_SECRET='v1,whsec_...' MAILERSEND_API_KEY='...' \
//        MAIL_FROM='no-reply@lunchvoice.com' MAIL_FROM_NAME='Lunch Voice' \
//        --project-ref qprfonxvthmaoxfixigk
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const hookSecret = (Deno.env.get("SEND_EMAIL_HOOK_SECRET") ?? "").replace("v1,whsec_", "");
const apiKey = Deno.env.get("MAILERSEND_API_KEY") ?? "";
const fromEmail = Deno.env.get("MAIL_FROM") ?? "";
const fromName = Deno.env.get("MAIL_FROM_NAME") ?? "Lunch Voice";

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

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("not allowed", { status: 405 });

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
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { subject, html, text } = codeEmail(email_data.token, email_data.email_action_type);

  const res = await fetch("https://api.mailersend.com/v1/email", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: { email: fromEmail, name: fromName },
      to: [{ email: user.email }],
      subject,
      html,
      text,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    // Surface the error to Supabase so the sign-in reports failure instead of silently
    // "succeeding" with no email. MailerSend 202 = accepted.
    return new Response(JSON.stringify({ error: { http_code: res.status, message: detail } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
});
