import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { Session as AuthSession } from "@supabase/supabase-js";
import { supabase, verifyStaffAccess } from "../lib/supabase";
import { useOrg } from "../org/OrgProvider";
import type { Profile } from "../types/db";

type Ctx = {
  session: AuthSession | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  org_id: string;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthCtx = createContext<Ctx | undefined>(undefined);
const STAFF_IDLE_TIMEOUT_MS = 60 * 60 * 1000;
const STAFF_ACTIVITY_EVENTS = ["pointerdown", "keydown", "touchstart", "scroll"] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const { org } = useOrg();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();

    // Org mismatch guard: stale bookmark or shared-device loading wrong org
    if (data && org && data.org_id !== org.id) {
      await supabase.auth.signOut({ scope: "local" });
      setProfile(null);
      return;
    }

    if (data?.is_staff) {
      const staffAccess = await verifyStaffAccess();
      if (staffAccess === "revoked") {
        await supabase.auth.signOut({ scope: "local" });
        setProfile(null);
        return;
      }
      if (staffAccess === "unavailable") {
        console.warn("Staff status could not be revalidated; keeping the current local session and retrying on the next profile refresh.");
      }
    }
    setProfile(data ?? null);
  }, [org]);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) loadProfile(session.user.id);
    else setProfile(null);
  }, [session, loadProfile]);

  useEffect(() => {
    if (!session?.user || !profile?.is_staff) return;

    const activityKey = `lunchvoice:staff-last-activity:${session.user.id}`;
    let timer: number | undefined;
    let signingOut = false;
    let lastWrite = 0;

    const readLastActivity = () => {
      const stored = Number(window.localStorage.getItem(activityKey));
      return Number.isFinite(stored) && stored > 0 ? stored : 0;
    };

    const schedule = () => {
      window.clearTimeout(timer);
      const remaining = STAFF_IDLE_TIMEOUT_MS - (Date.now() - readLastActivity());
      timer = window.setTimeout(expireIfIdle, Math.max(0, remaining));
    };

    const markActivity = () => {
      const now = Date.now();
      if (now - lastWrite < 1000) return;
      lastWrite = now;
      window.localStorage.setItem(activityKey, String(now));
      schedule();
    };

    const expireIfIdle = async () => {
      if (signingOut) return;
      if (Date.now() - readLastActivity() < STAFF_IDLE_TIMEOUT_MS) {
        schedule();
        return;
      }
      signingOut = true;
      window.localStorage.removeItem(activityKey);
      await supabase.auth.signOut({ scope: "local" });
      setProfile(null);
      window.location.replace(`/${encodeURIComponent(org.slug)}/login?mode=staff&reason=inactive`);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - readLastActivity() >= STAFF_IDLE_TIMEOUT_MS) void expireIfIdle();
      else markActivity();
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === activityKey && event.newValue) schedule();
    };

    if (!readLastActivity()) markActivity();
    else schedule();
    for (const event of STAFF_ACTIVITY_EVENTS) {
      window.addEventListener(event, markActivity, { passive: true, capture: true });
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("storage", onStorage);

    return () => {
      window.clearTimeout(timer);
      for (const event of STAFF_ACTIVITY_EVENTS) {
        window.removeEventListener(event, markActivity, { capture: true });
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [session?.user, profile?.is_staff, org.slug]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut({ scope: "local" });
    setProfile(null);
  }, []);

  return (
    <AuthCtx.Provider
      value={{
        session,
        profile,
        loading,
        isAdmin: profile?.role === "admin",
        org_id: profile?.org_id ?? org?.id ?? "",
        refreshProfile,
        signOut,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
