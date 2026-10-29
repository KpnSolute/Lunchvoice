# KpnSolute signature

One canonical maker's signature for every KpnSolute product. Zero dependencies, a
web component, and the same file used on other sites.

**v1.0.0 — final and approved.** The path data is the real single-stroke vector and
ends near (230, 68). Treat it as brand-final: do not redraw or re-trace it.

- `/brand/kpn-signature@1.js`: versioned, cache forever, immutable. Use this on other sites.
- `/brand/kpn-signature.js`: latest, for first-time discovery.
- `kpn-signature.js` is the script tag name the component documents.

## Usage

```html
<script src="https://lunchvoice.com/brand/kpn-signature@1.js" defer></script>

<!-- a standalone mark, e.g. a footer "made by" -->
<kpn-signature href="https://kpnsolute.com" label="Made by KpnSolute"
               style="width:160px;height:52px"></kpn-signature>

<!-- a signature whose tail lands on a call to action (mode="hero", the default) -->
<div style="position:relative">
  <kpn-signature target="#cta" color="#14110F"
                 style="position:absolute;inset:0;pointer-events:none"></kpn-signature>
  <a id="cta" class="btn btn-primary" href="/create">Create your Hub</a>
</div>

<!-- a footer mark: draws once when scrolled into view, then rests -->
<kpn-signature mode="footer" href="https://kpnsolute.com"
               style="width:160px;height:52px"></kpn-signature>

<!-- a loader: writes, holds, un-writes and loops -->
<kpn-signature mode="loader" label="Loading"
               style="width:160px;height:64px"></kpn-signature>
```

## Modes

| `mode`   | Behaviour                                                                              |
| -------- | -------------------------------------------------------------------------------------- |
| `hero`   | Default. Draws on, then loops in one seamless wave; the tail lands on `target`.         |
| `footer` | Draws once when it scrolls into view, then rests in the final frame.                     |
| `loader` | Writes, holds, un-writes and loops. Sets `role="progressbar"`, `aria-busy` and the label |

Remove a loader element when the content it covers has arrived. It never takes focus
and never blocks clicks unless it has an `href`.

## Attributes

| Attribute  | Default             | Meaning                                                        |
| ---------- | ------------------- | -------------------------------------------------------------- |
| `mode`     | `hero`              | `hero`, `footer` or `loader`.                                   |
| `target`   | none                | CSS selector; the tail ends at that element's left edge (hero). |
| `color`    | `currentColor`      | Stroke colour. Inherit it from the surrounding text.            |
| `dot`      | `#FF9A18`           | The pulsing dot colour.                                         |
| `stroke`   | `2.2`               | Stroke width in SVG units.                                      |
| `duration` | `2400`              | Draw-on time, in ms.                                            |
| `period`   | `6000`              | Loop period, in ms (loader: 2600).                              |
| `amp`      | `3.2`               | Wave amplitude.                                                 |
| `tail`     | `84`                | Tail length in px.                                              |
| `ghosts`   | `2`                 | 0–2 motion-blur ghosts (hero only).                             |
| `static`   | absent              | Present means no animation: it renders the final frame.         |
| `label`    | `Made by KpnSolute` | Accessible name (`Loading` in loader mode).                     |
| `href`     | none                | Wraps the mark in a link and enables pointer events.            |

## JavaScript

- `el.replay()` restarts the drawing.
- The element dispatches `kpn-signature:drawn` when the stroke finishes.

## Behaviour the component guarantees

- Pauses when off-screen or when the tab is hidden.
- Honours `prefers-reduced-motion` by rendering the final frame; a loader pulses its
  dot instead of looping the stroke.
- Never blocks clicks unless it has an `href`.
- Reserves its own box, so it causes no layout shift.

## Where LunchVoice uses it

1. Boot screen in `index.html`: `mode="loader"` at 160×64, cleared when React mounts.
2. Route Suspense fallbacks, but only after 400 ms of waiting (`BootLoader`).
3. Landing hero: `mode="hero"` fills the CTA row and targets `[data-lv-cta=hero]`.
4. Closing CTA band on the landing page.
5. Footer on every marketing page: `mode="footer"`, links to kpnsolute.com.
6. Hub settings → About and the `/me` footer: small and static.
7. Never in the respondent player.
