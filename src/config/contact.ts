// The single public contact channel (compliance LC-08). Every mailto in the app is built from this constant.
// Mail for lunchvoice.com is handled by Microsoft 365 (MX lunchvoice-com.mail.protection.outlook.com). The founder has to
// confirm admin@ is monitored before launch. Do not add other addresses.
export const SUPPORT_EMAIL = "admin@lunchvoice.com";
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;

/** A mailto link with a prefilled subject, so every message arrives labelled with where the person was. */
export const supportMailto = (subject?: string) => (subject ? `${SUPPORT_MAILTO}?subject=${encodeURIComponent(subject)}` : SUPPORT_MAILTO);

/**
 * LunchVoice's own community Hub (lunchvoice.com/kitchen), where LunchVoice is built in the open. It is created by
 * the founder through the same lv_hub_create flow as any Hub: nothing is seeded, reserved or special-cased. The site
 * only links to it, and the home page shows its card only while lv_hub_get returns it as a public Hub.
 */
export const COMMUNITY_HUB_SLUG = "kitchen";
