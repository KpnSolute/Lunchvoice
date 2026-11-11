import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { LvApi } from "../lib/lvApi";
import { createApi, usingMock } from "../lib/transport";
import { SESSION_ENDED_FLAG } from "../lib/authFailure";
import { completeSignIn as finishRedirect, readConfig, startSignIn } from "../lib/kpnIdentity";

// The identity key is (issuer, subject) and it is derived server-side from a
// verified KpnIdentity token; the browser only holds the token. Until the
// issuer exists, a simulated session is available in mock mode only.
interface Session {
  token: string;
  name: string;
  /** Epoch ms. Sessions are short; after this the person signs in again. */
  expiresAt?: number;
}

interface Identity {
  session: Session | null;
  api: LvApi;
  issuerConfigured: boolean;
  canSimulate: boolean;
  signInSimulated: (name: string) => void;
  /** Redirect to KpnIdentity. Resolves only if the redirect could not start. */
  signIn: (returnTo?: string) => Promise<void>;
  /** Finish the KpnIdentity redirect on /auth/callback; returns where to go next. */
  completeSignIn: (search: string) => Promise<string>;
  signOut: () => void;
}

const STORE = "lv.session";
const Ctx = createContext<Identity | null>(null);
const issuer = import.meta.env.VITE_KPNIDENTITY_ISSUER;
const kpnConfig = typeof window === "undefined" ? null : readConfig(import.meta.env as Record<string, string | undefined>, window.location.origin);

function load(): Session | null {
  try {
    const raw = localStorage.getItem(STORE);
    const stored = raw ? (JSON.parse(raw) as Session) : null;
    // An expired session is dropped at load rather than sent and refused.
    if (stored?.expiresAt && stored.expiresAt <= Date.now()) {
      localStorage.removeItem(STORE);
      return null;
    }
    return stored;
  } catch {
    return null;
  }
}

export function IdentityProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(load);

  const persist = useCallback((s: Session | null) => {
    setSession(s);
    try {
      if (s) localStorage.setItem(STORE, JSON.stringify(s));
      else localStorage.removeItem(STORE);
    } catch {
      /* storage unavailable: session lasts for this page only */
    }
  }, []);

  // The session ended on its own (its hour ran out, or the server refused the token). Sign the person out locally,
  // say so, and leave a flag for the sign-in page. Idempotent: several calls can fail at once.
  const endSession = useCallback(() => {
    persist(null);
    try { sessionStorage.setItem(SESSION_ENDED_FLAG, "1"); } catch { /* the toast still tells them */ }
    toast.warning("Your session ended, so you've been signed out. Sign in again to carry on.", { id: "session-ended", duration: 12_000 });
  }, [persist]);

  // Sessions last up to an hour. A tab left open past that used to keep showing the person as signed in while every
  // call failed. End the session at its expiry, and re-check when the tab wakes (background timers are throttled).
  useEffect(() => {
    const expiresAt = session?.expiresAt;
    if (!expiresAt) return;
    const check = () => { if (Date.now() >= expiresAt) endSession(); };
    const timer = window.setTimeout(check, Math.min(Math.max(expiresAt - Date.now(), 0), 2_000_000_000));
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, [session, endSession]);

  const value = useMemo<Identity>(() => {
    return {
      session,
      api: createApi(() => session?.token ?? null, session?.name, endSession),
      issuerConfigured: Boolean(issuer && kpnConfig),
      canSimulate: import.meta.env.DEV && usingMock,
      signInSimulated: import.meta.env.DEV
        ? (name) => persist({ token: "simulated", name: name || "Dana" })
        : () => {},
      signIn: async (returnTo) => {
        if (!kpnConfig) throw new Error("KpnIdentity is not configured for this build.");
        window.location.assign(await startSignIn(kpnConfig, returnTo ?? "/me"));
      },
      completeSignIn: async (search) => {
        if (!kpnConfig) throw new Error("KpnIdentity is not configured for this build.");
        const { session: next, returnTo } = await finishRedirect(kpnConfig, search);
        persist(next);
        return returnTo;
      },
      signOut: () => persist(null),
    };
  }, [session, persist, endSession]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useIdentity(): Identity {
  const v = useContext(Ctx);
  if (!v) throw new Error("useIdentity outside IdentityProvider");
  return v;
}
