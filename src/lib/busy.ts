// A tiny "the person is in the middle of something" registry. The update notice (UpdateNotice.tsx) waits until
// nothing is busy before it appears, and it never reloads the page by itself. Hook-ins are one line:
//   useBusy("player", true)   // while answering a survey
import { useEffect } from "react";

const holders = new Map<string, number>();
const listeners = new Set<() => void>();

export function setBusy(key: string, on: boolean) {
  const n = (holders.get(key) ?? 0) + (on ? 1 : -1);
  if (n <= 0) holders.delete(key); else holders.set(key, n);
  listeners.forEach((l) => l());
}

export function isBusy(): boolean {
  if (holders.size > 0) return true;
  // Any focused text field counts: someone is typing (builder text, a form, an answer).
  const a = typeof document === "undefined" ? null : document.activeElement;
  if (!a) return false;
  const tag = a.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return !["button", "checkbox", "radio", "submit"].includes((a as HTMLInputElement).type);
  return (a as HTMLElement).isContentEditable === true;
}

export function onBusyChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function useBusy(key: string, on: boolean) {
  useEffect(() => {
    if (!on) return;
    setBusy(key, true);
    return () => setBusy(key, false);
  }, [key, on]);
}
