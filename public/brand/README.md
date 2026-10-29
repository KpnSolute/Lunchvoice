# KpnSolute signature

One canonical maker's signature for every KpnSolute product. Zero dependencies, a
web component, and the same file used on other sites.

- `/brand/kpn-signature@1.js`: versioned, cache forever, immutable. Use this on other sites.
- `/brand/kpn-signature.js`: latest, for first-time discovery.
- `kpn-signature.js` is the script tag name the component documents.

**PLACEHOLDER:** the path data inside the component is a stand-in until the founder
supplies the real single-stroke vector (it must end near 230,68). Do not draw a
replacement, and do not treat the current curve as brand-final.

## Usage

```html
<script src="https://lunchvoice.com/brand/kpn-signature@1.js" defer></script>

<!-- a standalone mark, e.g. a footer "made by" -->
<kpn-signature href="https://kpnsolute.com" label="Made by KpnSolute"
               style="width:160px;height:52px"></kpn-signature>

<!-- a signature whose tail lands on a call to action -->
<div style="position:relative">
  <kpn-signature target="#cta" color="#14110F"
                 style="position:absolute;inset:0;pointer-events:none"></kpn-signature>
  <a id="cta" class="btn btn-primary" href="/create">Create your Hub</a>
</div>
```

## Attributes

| Attribute  | Default             | Meaning                                                        |
| ---------- | ------------------- | -------------------------------------------------------------- |
| `target`   | none                | CSS selector; the tail ends at that element's left edge.        |
| `color`    | `currentColor`      | Stroke colour. Inherit it from the surrounding text.            |
| `dot`      | `#FF9A18`           | The pulsing dot colour.                                         |
| `stroke`   | `2.2`               | Stroke width in SVG units.                                      |
| `duration` | `2400`              | Draw-on time, in ms.                                            |
| `period`   | `6000`              | Loop period, in ms.                                             |
| `amp`      | `3.2`               | Wave amplitude.                                                 |
| `tail`     | `84`                | Tail length in px.                                              |
| `ghosts`   | `2`                 | 0–2 motion-blur ghosts.                                         |
| `static`   | absent              | Present means no animation: it renders the final frame.        |
| `label`    | `Made by KpnSolute` | Accessible name.                                                |
| `href`     | none                | Wraps the mark in a link and enables pointer events.            |

## JavaScript

- `el.replay()` restarts the drawing.
- The element dispatches `kpn-signature:drawn` when the stroke finishes.

## Behaviour the component already guarantees

- Pauses when off-screen or when the tab is hidden.
- Honours `prefers-reduced-motion` by rendering the final frame.
- Never blocks clicks unless it has an `href`.
- Reserves its own box, so it causes no layout shift.

## Where LunchVoice uses it

1. Landing hero: fills the CTA row and targets `[data-lv-cta=hero]`.
2. Closing CTA band on the landing page.
3. Footer on every marketing page: static size, links to kpnsolute.com.
4. Hub settings → About and the `/me` footer: small and static.
5. Never in the respondent player.
