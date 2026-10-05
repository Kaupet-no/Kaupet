import { Resend } from "resend";

import { renderNotificationEmail, type NotificationEmailType } from "@/lib/email-templates";

const FROM = process.env.RESEND_FROM_EMAIL || "Kaupet.no <ikkesvar@varsel.kaupet.no>";

/**
 * Plain-text email to a Kaupet inbox (sales, ops). Deliberately not routed through
 * renderNotificationEmail: those templates are the customer-facing notification design.
 */
export async function sendInternalEmail(params: {
  to: string | string[];
  subject: string;
  text: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY");
  }

  const { error } = await new Resend(apiKey).emails.send({
    from: FROM,
    to: params.to,
    subject: params.subject,
    text: params.text,
  });
  if (error) throw new Error(`Resend email failed: ${error.message}`);
}

/** Kvittering til en bedriftskonto (business-email-templates.ts). Svar går til Proff-teamet. */
export async function sendBusinessEmail(params: {
  to: string[];
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY");
  }

  const { error } = await new Resend(apiKey).emails.send({
    from: FROM,
    replyTo: "Kaupet Proff <proff@kaupet.no>",
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });
  if (error) throw new Error(`Resend email failed: ${error.message}`);
}

export async function sendNotificationEmail(params: {
  to: string;
  type: NotificationEmailType;
  subject: string;
  body: string;
  url: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY");
  }

  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
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
  if (error) throw new Error(`Resend email failed: ${error.message}`);
}
