// The single public contact channel (compliance LC-08). Every mailto in the app is built from this constant.
// Mail for lunchvoice.com is handled by Microsoft 365 (MX lunchvoice-com.mail.protection.outlook.com). The founder has to
// confirm the support@ mailbox is monitored before launch. Do not add other addresses.
export const SUPPORT_EMAIL = "support@lunchvoice.com";
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;

/** A mailto link with a prefilled subject, so every message arrives labelled with where the person was. */
export const supportMailto = (subject?: string) => (subject ? `${SUPPORT_MAILTO}?subject=${encodeURIComponent(subject)}` : SUPPORT_MAILTO);
