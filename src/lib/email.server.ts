import { Resend } from "resend";

const FROM = process.env.RESEND_FROM_EMAIL || "Kaupet.no <ikkesvar@varsel.kaupet.no>";

export async function sendNotificationEmail(params: {
  to: string;
  subject: string;
  body: string;
  url: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("Missing RESEND_API_KEY, skipping email");
    return;
  }

  const resend = new Resend(apiKey);
  const fullUrl = params.url.startsWith("http") ? params.url : `https://kaupet.no${params.url}`;

  await resend.emails.send({
    from: FROM,
    to: params.to,
    subject: params.subject,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <p style="font-size: 16px; color: #111;">${escapeHtml(params.body)}</p>
        <p>
          <a href="${fullUrl}" style="display: inline-block; margin-top: 12px; padding: 10px 16px; background: #111; color: #fff; text-decoration: none; border-radius: 6px;">
            Se på Kaupet.no
          </a>
        </p>
      </div>
    `,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
