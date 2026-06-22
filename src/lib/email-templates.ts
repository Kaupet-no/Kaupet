// Email-trygge fargeverdier hentet fra src/styles.css (oklch der erstattet
// med nærmeste hex, siden de fleste e-postklienter ikke støtter oklch()).
const COLOR = {
  background: "#fbf9f3",
  card: "#ffffff",
  border: "#e7e1d3",
  text: "#202a22",
  muted: "#6c7868",
  primary: "#2f5d44",
  primaryForeground: "#fbf9f3",
  accent: "#c1693f",
};

export type NotificationEmailType = "message" | "saved_search" | "price_drop" | "sold";

const COPY: Record<NotificationEmailType, { eyebrow: string; intro: string; cta: string }> = {
  message: {
    eyebrow: "Ny melding",
    intro: "Du har fått en ny melding på Kaupet.no.",
    cta: "Svar på meldingen",
  },
  saved_search: {
    eyebrow: "Nytt treff",
    intro: "En ny annonse matcher et av de lagrede søkene dine.",
    cta: "Se annonsen",
  },
  price_drop: {
    eyebrow: "Prisfall",
    intro: "En favoritt-annonse har blitt billigere.",
    cta: "Se annonsen",
  },
  sold: {
    eyebrow: "Solgt",
    intro: "En favoritt-annonse er ikke lenger tilgjengelig.",
    cta: "Se annonsen",
  },
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderNotificationEmail(params: {
  type: NotificationEmailType;
  title: string;
  body: string;
  url: string;
}): string {
  const { eyebrow, intro, cta } = COPY[params.type];
  const fullUrl = params.url.startsWith("http") ? params.url : `https://kaupet.no${params.url}`;

  return `<!DOCTYPE html>
<html lang="no">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(params.title)}</title>
  </head>
  <body style="margin:0; padding:0; background-color:${COLOR.background}; font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLOR.background};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
            <tr>
              <td style="padding-bottom:24px;" align="center">
                <span style="font-family:Georgia,'Fraunces',serif; font-size:20px; font-weight:600; color:${COLOR.primary}; letter-spacing:-0.01em;">
                  Kaupet.no
                </span>
              </td>
            </tr>
            <tr>
              <td style="background-color:${COLOR.card}; border:1px solid ${COLOR.border}; border-radius:16px; padding:32px;">
                <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; color:${COLOR.accent};">
                  ${escapeHtml(eyebrow)}
                </p>
                <h1 style="margin:0 0 16px; font-family:Georgia,'Fraunces',serif; font-size:22px; font-weight:600; color:${COLOR.text}; letter-spacing:-0.01em;">
                  ${escapeHtml(params.title)}
                </h1>
                <p style="margin:0 0 12px; font-size:15px; line-height:1.6; color:${COLOR.muted};">
                  ${escapeHtml(intro)}
                </p>
                <p style="margin:0 0 28px; font-size:15px; line-height:1.6; color:${COLOR.text};">
                  ${escapeHtml(params.body)}
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:10px; background-color:${COLOR.primary};">
                      <a
                        href="${fullUrl}"
                        style="display:inline-block; padding:12px 22px; font-size:14px; font-weight:600; color:${COLOR.primaryForeground}; text-decoration:none; border-radius:10px;"
                      >
                        ${escapeHtml(cta)}
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding-top:24px;" align="center">
                <p style="margin:0; font-size:12px; line-height:1.6; color:${COLOR.muted};">
                  Du får denne e-posten fordi du har aktivert varselet «${escapeHtml(eyebrow)}»
                  på Kaupet.no.
                  <a href="https://kaupet.no/profil" style="color:${COLOR.muted};">Endre varslingsinnstillinger</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
