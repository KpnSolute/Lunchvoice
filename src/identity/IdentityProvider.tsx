import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { LvApi } from "../lib/lvApi";
import { createApi, usingMock } from "../lib/transport";

// The identity key is (issuer, subject) and it is derived server-side from a
// verified KpnIdentity token; the browser only holds the token. Until the
// issuer exists, a simulated session is available in mock mode only.
interface Session {
  token: string;
  name: string;
}

interface Identity {
  session: Session | null;
  api: LvApi;
  issuerConfigured: boolean;
  canSimulate: boolean;
  signInSimulated: (name: string) => void;
  signOut: () => void;
}

const STORE = "lv.session";
const Ctx = createContext<Identity | null>(null);
const issuer = import.meta.env.VITE_KPNIDENTITY_ISSUER;

function load(): Session | null {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function IdentityProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(load);
  const value = useMemo<Identity>(() => {
    const persist = (s: Session | null) => {
      setSession(s);
      try {
        if (s) localStorage.setItem(STORE, JSON.stringify(s));
        else localStorage.removeItem(STORE);
      } catch {
        /* storage unavailable: session lasts for this page only */
      }
    };
    return {
      session,
      api: createApi(() => session?.token ?? null, session?.name),
      issuerConfigured: Boolean(issuer),
      canSimulate: usingMock,
      signInSimulated: (name) => persist({ token: "simulated", name: name || "Dana" }),
      signOut: () => persist(null),
    };
  }, [session]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useIdentity(): Identity {
  const v = useContext(Ctx);
  if (!v) throw new Error("useIdentity outside IdentityProvider");
  return v;
}
