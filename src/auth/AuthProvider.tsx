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

export function AuthProvider({ children }: { children: ReactNode }) {
  const { org } = useOrg();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();

    // Org mismatch guard: stale bookmark or shared-device loading wrong org
    if (data && org && data.org_id !== org.id) {
      await supabase.auth.signOut();
      setProfile(null);
      return;
    }

    if (data?.is_staff) {
      const stillStaff = await verifyStaffAccess();
      if (!stillStaff) {
        await supabase.auth.signOut();
        setProfile(null);
        return;
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

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
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
