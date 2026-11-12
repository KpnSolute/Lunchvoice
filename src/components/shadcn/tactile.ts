// Shared Tailwind class fragments for the tactile design system (design handoff §2). Lives under
// src/components/shadcn so Tailwind scans it. The surface-* and tactile-* utilities are defined in src/ui/shadcn.css
// on top of the --lv-* tokens, so every fragment follows the light, dark and high-contrast themes.

/** A text field: the well surface, 16px radius, 48px tall, ink focus ring. */
export const fieldClass =
  "surface-field w-full min-w-0 rounded-[var(--lv-radius-field)] px-4 text-[15px] leading-[1.4] font-medium " +
  "placeholder:text-[var(--lv-subtle)] placeholder:font-normal outline-none transition-[background,box-shadow] duration-200 " +
  "hover:shadow-[inset_0_0_0_1px_var(--lv-subtle)] focus-visible:shadow-[inset_0_0_0_2px_var(--lv-text)] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color-mix(in_srgb,var(--lv-accent)_45%,transparent)] " +
  "disabled:cursor-not-allowed disabled:bg-[var(--lv-well)] disabled:opacity-70 " +
  "aria-invalid:outline-2 aria-invalid:outline-[var(--lv-danger)]";

/** Floating content: popovers, menus, select lists. Pops from the trigger origin on the spring. */
export const popClass =
  "surface-pop tactile-pop-in z-50 rounded-[var(--lv-radius-field)] p-1.5 text-[14.5px] outline-none";

/** One row inside a menu or listbox. Highlight is the well; the selected state is shown by a check glyph. */
export const itemClass =
  "relative flex cursor-default items-center gap-2 rounded-[12px] px-3 py-2.5 text-[14.5px] font-medium outline-none select-none " +
  "data-[highlighted]:bg-[var(--lv-well)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50 " +
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

/** The modal scrim: solid tint, never blur. */
export const scrimClass =
  "fixed inset-0 z-50 bg-[var(--lv-scrim)] data-[state=open]:animate-in data-[state=open]:fade-in-0 " +
  "data-[state=closed]:animate-out data-[state=closed]:fade-out-0";

/** A choice control (checkbox, radio, switch thumb) that turns pressed amber when selected and jellies on the change. */
export const choiceOn =
  "data-[state=checked]:surface-pressed data-[state=checked]:animate-[lv-jelly-in_var(--lv-dur-jelly)_var(--lv-ease-spring)]";
