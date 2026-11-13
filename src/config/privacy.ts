// The anonymity minimum the database enforces (policy `campaign.min_cohort`, set in
// supabase/migrations/000014_v2_entitlements.sql). The server decides what is withheld; this number is only used to
// explain that decision in plain words. If the policy changes, change it here in the same commit.
export const ANON_MIN_ANSWERS = 5;
