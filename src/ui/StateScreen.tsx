import type { ReactNode } from "react";
import { Icon, type IconName } from "../components/Icon";

export type StateKind = "notfound" | "error" | "closed" | "scheduled" | "ineligible" | "offline" | "empty" | "loading";

const COPY: Record<StateKind, { icon: IconName; title: string; body: string }> = {
  notfound: { icon: "lock", title: "We can't find that.", body: "The link may be wrong, or it may be private. Check it and try again." },
  error: { icon: "bulb", title: "Something went wrong on our side.", body: "Nothing you did caused this. Try again in a moment." },
  closed: { icon: "lock", title: "This Campaign isn't taking answers.", body: "It has closed." },
  scheduled: { icon: "clock", title: "Not open yet.", body: "It hasn't opened yet." },
  ineligible: { icon: "lock", title: "You can't answer this one.", body: "It isn't available to you right now." },
  offline: { icon: "globe", title: "You're offline.", body: "Your answers are saved on this device. They send when you're back online." },
  empty: { icon: "survey", title: "Nothing here yet.", body: "When there's something to show, it appears here." },
  loading: { icon: "clock", title: "Loading", body: "One moment." },
};

/** L11: one calm state. It says what happened and what to do next, in plain words. */
export function StateScreen({ kind, title, detail, action }: { kind: StateKind; title?: string; detail?: string; action?: ReactNode }) {
  const c = COPY[kind];
  return (
    <div className="lv-state" role={kind === "error" ? "alert" : "status"} aria-live="polite">
      <span className="lv-state-icon" aria-hidden="true"><Icon name={c.icon} size={28} /></span>
      <h1 className="lv-state-title">{title ?? c.title}</h1>
      <p className="lv-state-body">{detail ?? c.body}</p>
      {action && <div className="lv-state-action">{action}</div>}
    </div>
  );
}
