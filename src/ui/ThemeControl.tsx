import { useState } from "react";
import { Segmented } from "@/components/shadcn/blocks";
import { THEME_PREFS, readThemePref, saveThemePref, type ThemePref } from "./theme";

/** Appearance: the shared segmented radiogroup (roving tabindex, arrow keys). The chosen option is pressed amber. */
export function ThemeControl() {
  const [pref, setPref] = useState<ThemePref>(() => readThemePref());
  return (
    <Segmented<ThemePref>
      label="Theme"
      value={pref}
      onValueChange={(next) => { setPref(next); saveThemePref(next); }}
      options={THEME_PREFS.map((p) => ({ value: p.id, label: p.label }))}
    />
  );
}
