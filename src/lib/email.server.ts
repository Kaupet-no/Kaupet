import { Resend } from "resend";

import { renderNotificationEmail, type NotificationEmailType } from "@/lib/email-templates";

const FROM = process.env.RESEND_FROM_EMAIL || "Kaupet.no <ikkesvar@varsel.kaupet.no>";

export async function sendNotificationEmail(params: {
  to: string;
  type: NotificationEmailType;
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

  await resend.emails.send({
    from: FROM,
    to: params.to,
    subject: params.subject,
    html: renderNotificationEmail({
      type: params.type,
      title: params.subject,
      body: params.body,
      url: params.url,
    }),
  });
}
