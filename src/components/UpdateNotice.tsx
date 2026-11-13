import { Component, useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import { StateScreen } from "@/ui/StateScreen";
import { Button } from "@/components/shadcn/button";
import { isBusy, onBusyChange } from "@/lib/busy";
import { isChunkLoadError, isNewer, nextDelay, parseVersion } from "@/lib/updateCheck";

// "A new version of LunchVoice is ready." A calm toast with Refresh, shown when a newer deploy is live. It never
// reloads by itself, waits while someone is answering or typing (src/lib/busy.ts), polls only while the tab is
// visible, and also covers lazy route chunks that vanished in a deploy.
const TOAST_ID = "update-ready";
const reload = () => window.location.reload();

function showUpdateToast() {
  toast("A new version of LunchVoice is ready.", {
    id: TOAST_ID,
    duration: Infinity,
    closeButton: true,
    action: { label: "Refresh", onClick: reload },
  });
}

export function UpdateNotice() {
  useEffect(() => {
    let failures = 0;
    let found = false;
    let timer: number | undefined;
    let stopped = false;
    let unbusy: (() => void) | undefined;

    // Show now, or as soon as the person stops being busy.
    const announce = () => {
      if (!isBusy()) { showUpdateToast(); return; }
      unbusy ??= onBusyChange(() => { if (!isBusy()) { unbusy?.(); unbusy = undefined; showUpdateToast(); } });
      // Typing in a field is not a registry entry: re-check when focus leaves.
      const onOut = () => window.setTimeout(() => { if (found && !isBusy()) { showUpdateToast(); document.removeEventListener("focusout", onOut); } }, 50);
      document.addEventListener("focusout", onOut);
    };

    const check = async () => {
      if (stopped || found || document.hidden) return;
      try {
        const r = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store", headers: { accept: "application/json" } });
        if (!r.ok) throw new Error(String(r.status));
        const latest = parseVersion(await r.json().catch(() => null));
        failures = 0;
        if (isNewer(__LV_BUILD_ID__, latest)) { found = true; announce(); return; }
      } catch { failures += 1; }
      schedule();
    };
    const schedule = () => {
      window.clearTimeout(timer);
      if (stopped || found || document.hidden) return; // no polling while hidden
      timer = window.setTimeout(check, nextDelay(failures));
    };
    const wake = () => { if (!document.hidden) void check(); };

    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    schedule();

    // A lazy route chunk that no longer exists means the site was redeployed under this tab.
    const chunkFailed = (e: Event) => { e.preventDefault?.(); found = true; showUpdateToast(); };
    const rejected = (e: PromiseRejectionEvent) => { if (isChunkLoadError(e.reason)) chunkFailed(e); };
    window.addEventListener("vite:preloadError", chunkFailed);
    window.addEventListener("unhandledrejection", rejected);

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      unbusy?.();
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("vite:preloadError", chunkFailed);
      window.removeEventListener("unhandledrejection", rejected);
    };
  }, []);
  return null;
}

/** Catches a lazy route that failed to load after a deploy and offers a refresh instead of a blank page. */
export class ChunkErrorBoundary extends Component<{ children: ReactNode }, { error: unknown; failed: boolean }> {
  state = { error: null as unknown, failed: false };
  static getDerivedStateFromError(error: unknown) { return { error, failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    if (!isChunkLoadError(this.state.error)) throw this.state.error; // not ours: the app's normal crash handling
    return (
      <StateScreen
        kind="empty"
        title="A new version of LunchVoice is ready."
        detail="This page changed while you had it open. Refresh to load the latest version."
        action={<Button variant="primary" onClick={reload}>Refresh</Button>}
      />
    );
  }
}
