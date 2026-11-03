import { useRef, useState, type KeyboardEvent } from "react";
import { THEME_PREFS, readThemePref, saveThemePref, type ThemePref } from "./theme";

/** Appearance: a radiogroup with a roving tabindex (arrow keys move and select). The chosen option is pressed amber. */
export function ThemeControl() {
  const [pref, setPref] = useState<ThemePref>(() => readThemePref());
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const choose = (next: ThemePref, focusIndex?: number) => {
    setPref(next);
    saveThemePref(next);
    if (focusIndex !== undefined) refs.current[focusIndex]?.focus();
  };

  const onKey = (event: KeyboardEvent, index: number) => {
    const last = THEME_PREFS.length - 1;
    const moves: Record<string, number> = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowDown: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      ArrowUp: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const to = moves[event.key];
    choose(THEME_PREFS[to].id, to);
  };

  return (
    <div className="lv-seg" role="radiogroup" aria-label="Theme">
      {THEME_PREFS.map((option, index) => {
        const on = option.id === pref;
        return (
          <button
            key={option.id}
            ref={(node) => { refs.current[index] = node; }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className="lv-seg-item"
            onClick={() => choose(option.id)}
            onKeyDown={(event) => onKey(event, index)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
