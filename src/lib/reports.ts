// Reporting people and Hubs (000029). One list of reasons for every report, so a person never has to guess which box
// to tick. The keys are the database's; the words are ours.
export type ReportReason = "harassment" | "hate" | "threats" | "sexual_content" | "scam" | "impersonation" | "spam" | "privacy" | "other";

export const REPORT_REASONS: { key: ReportReason; label: string; help: string }[] = [
  { key: "harassment", label: "Harassment or bullying", help: "Insults, targeting someone, or repeated unwanted contact." },
  { key: "hate", label: "Hate", help: "Attacking people for who they are." },
  { key: "threats", label: "Threats or self-harm", help: "Threatening someone, or content about hurting themselves." },
  { key: "sexual_content", label: "Sexual content", help: "Sexual content, especially involving minors or someone who didn’t agree." },
  { key: "scam", label: "Scam or phishing", help: "Asking for money, passwords or personal details." },
  { key: "impersonation", label: "Pretending to be someone", help: "Acting as another person, group or LunchVoice." },
  { key: "spam", label: "Spam", help: "Unwanted promotion, fake accounts or vote stuffing." },
  { key: "privacy", label: "Sharing private information", help: "Posting someone’s private details without permission." },
  { key: "other", label: "Something else", help: "Tell us what happened." },
];

export const reasonLabel = (k: string) => REPORT_REASONS.find((r) => r.key === k)?.label ?? k;
