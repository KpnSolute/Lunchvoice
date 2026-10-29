import { useState, type ReactNode } from "react";
import { Btn, Card, CopyField, Dialog, Empty, Loading, Meter, Metric, Micro, Notice, PageHead, PhaseBadge, Pill, Tabs, type Phase } from "../components/ui";
import { Icon, type IconName } from "../components/Icon";
import { MadeBy } from "../components/MakerMark";

const ICONS: IconName[] = ["home", "star", "survey", "voice", "roster", "dashboard", "bulb", "flame", "sparkle", "lock", "check", "arrow", "plus"];
const PHASES: Phase[] = ["draft", "scheduled", "open", "ended", "paused", "closed", "archived"];

// Development-only surface for checking every element in one place. Not routed in production.
export function Gallery() {
  const [open, setOpen] = useState(false);

  return (
    <div className="ui-page">
      <PageHead eyebrow="Dev only" title="Component gallery" sub="Every element in light, dark, and its states. Not shipped to production routes." />

      <Section title="Type">
        <h1 className="ui-display ui-display-xl" style={{ margin: 0 }}>Display XL</h1>
        <h2 className="ui-display ui-display-lg" style={{ margin: 0 }}>Display large</h2>
        <h3 className="ui-display ui-display-md" style={{ margin: 0 }}>Display medium</h3>
        <p style={{ margin: 0 }}>Body copy in Space Grotesk, the working voice of the product.</p>
        <Micro>Mono micro label</Micro>
        <MadeBy />
      </Section>

      <Section title="Buttons">
        <div className="ui-row">
          <Btn variant="primary">Primary</Btn>
          <Btn variant="ink">Ink</Btn>
          <Btn variant="outline">Outline</Btn>
          <Btn variant="quiet">Quiet</Btn>
          <Btn variant="danger">Danger</Btn>
          <Btn variant="primary" disabled>Disabled</Btn>
          <Btn variant="primary" icon="arrow">With icon</Btn>
          <Btn size="sm" variant="outline">Small</Btn>
          <Btn size="lg" variant="primary">Large</Btn>
        </div>
      </Section>

      <Section title="Pills and phases">
        <div className="ui-row">
          <Pill>Default</Pill><Pill tone="accent">Accent</Pill><Pill tone="ok">OK</Pill><Pill tone="danger">Danger</Pill><Pill tone="ink">Ink</Pill>
        </div>
        <div className="ui-row">{PHASES.map((p) => <PhaseBadge key={p} phase={p} />)}</div>
      </Section>

      <Section title="Icons">
        <div className="ui-row" style={{ gap: 14 }}>
          {ICONS.map((i) => <span key={i} title={i} style={{ color: "var(--accent-ink)" }}><Icon name={i} size={22} /></span>)}
        </div>
      </Section>

      <Section title="Notices">
        <div className="ui-stack ui-gap-8">
          <Notice tone="info">Informational note.</Notice>
          <Notice tone="ok">Success note.</Notice>
          <Notice tone="warn">Warning note.</Notice>
          <Notice tone="err">Error note.</Notice>
        </div>
      </Section>

      <Section title="Forms">
        <div className="ui-grid-2">
          <div className="ui-field"><label className="ui-label" htmlFor="g1">Label</label><input id="g1" className="ui-input" placeholder="Placeholder" /><span className="ui-help">Helper text</span></div>
          <div className="ui-field"><label className="ui-label" htmlFor="g2">Invalid</label><input id="g2" className="ui-input" aria-invalid defaultValue="bad value" /><span className="ui-error">That isn't valid</span></div>
          <div className="ui-field"><label className="ui-label" htmlFor="g3">Select</label><select id="g3" className="ui-select"><option>One</option><option>Two</option></select></div>
          <div className="ui-field"><label className="ui-label" htmlFor="g4">Textarea</label><textarea id="g4" className="ui-textarea" placeholder="Write…" /></div>
        </div>
        <div className="ui-row">
          <label className="ui-check"><input type="checkbox" defaultChecked /> Checkbox</label>
          <label className="ui-check"><input type="radio" name="g" defaultChecked /> Radio</label>
        </div>
        <div className="ui-rating" role="group" aria-label="Rating example">
          {[1, 2, 3, 4, 5].map((n) => <button key={n} aria-pressed={n === 3}>{n}</button>)}
        </div>
        <CopyField label="Copy field" value="ABCD-2345-XYZ" />
      </Section>

      <Section title="Marketing">
        <div className="lv-ticker" aria-hidden="true" style={{ margin: 0, borderInline: "none" }}>
          <div className="lv-ticker-track">
            {["Amber ticker", "Mono micro-label", "Grain + rules", "Amber ticker", "Mono micro-label", "Grain + rules"].map((t, i) => (
              <span key={i}>{t} ◆</span>
            ))}
          </div>
        </div>
        <article className="lv-price-card lv-price-card-feature">
          <Micro accent>Starter Hub</Micro>
          <p className="lv-price-figure"><span>$13</span><small>per month</small></p>
          <ul className="lv-plan-list">
            <li><Icon name="check" size={15} />3 custom roles</li>
            <li><Icon name="check" size={15} />15 active Campaigns</li>
          </ul>
          <button className="ui-btn ui-btn-block ui-btn-outline" disabled aria-disabled="true">Checkout opens soon</button>
        </article>
        <div className="lv-lifecycle">
          <span>ACTIVE</span><i aria-hidden="true">→</i><span>GRACE · 25 days</span><i aria-hidden="true">→</i><span>RELEASED</span>
        </div>
      </Section>

      <Section title="Data">
        <div className="ui-grid-3">
          <Metric value="356" label="checks passed" hint="database suite" />
          <div><Meter value={2} max={3} label="role slots" /></div>
          <div className="ui-stack ui-gap-8">
            <span className="ui-metric">Withheld</span>
            <Micro>suppressed value — never rendered as zero</Micro>
            <div className="chart-bars" style={{ marginTop: 4 }}>
              <div className="chart-bar-row">
                <span className="chart-bar-label">Very useful</span>
                <span className="chart-bar-track"><b style={{ width: "46%" }} /></span>
                <em className="chart-bar-value">46</em>
              </div>
              <div className="chart-bar-row">
                <span className="chart-bar-label">Not useful</span>
                <span className="chart-bar-track" style={{ background: "repeating-linear-gradient(135deg, var(--surface-2) 0 4px, var(--line) 4px 8px)" }} />
                <em className="chart-bar-value"><Icon name="lock" size={12} /></em>
              </div>
            </div>
          </div>
        </div>
        <div className="ui-table-wrap">
          <table className="ui-table">
            <thead><tr><th>Member</th><th>Roles</th><th>State</th></tr></thead>
            <tbody>
              <tr><td>Example member</td><td><Pill>Owner</Pill></td><td><Pill tone="ok">accepted</Pill></td></tr>
              <tr><td>Another member</td><td>—</td><td><Pill>pending</Pill></td></tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Surfaces">
        <div className="ui-grid-2">
          <Card><Micro>Card</Micro><p style={{ margin: "8px 0 0" }}>White surface, hairline, soft shadow.</p></Card>
          <div className="ui-panel">
            <div className="ui-panel-top"><Micro accent>Panel</Micro><Pill tone="accent">Owner</Pill></div>
            <p style={{ margin: 0 }}>Ink surface with the citrus glow — the v1 hero-card idea.</p>
          </div>
        </div>
      </Section>

      <Section title="States">
        <div className="ui-grid-2">
          <Empty icon="home" title="Empty state" action={<Btn variant="primary" size="sm">Take action</Btn>}>A short explanation of what would appear here.</Empty>
          <Card><Micro>Loading</Micro><div style={{ marginTop: 10 }}><Loading rows={3} /></div></Card>
        </div>
      </Section>

      <Section title="Tabs and dialog">
        <Tabs items={[{ to: "/__gallery", label: "Overview", end: true }, { to: "/__gallery?x=1", label: "Second" }]} />
        <div className="ui-row" style={{ marginTop: 12 }}>
          <Btn variant="ink" onClick={() => setOpen(true)}>Open dialog</Btn>
        </div>
        <Dialog open={open} onClose={() => setOpen(false)} title="Confirm an action"
          actions={<><Btn variant="quiet" onClick={() => setOpen(false)}>Cancel</Btn><Btn variant="primary" onClick={() => setOpen(false)}>Confirm</Btn></>}>
          <p className="ui-muted" style={{ margin: 0 }}>Dialogs trap focus and close on Escape.</p>
        </Dialog>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 30 }}>
      <Micro accent>{title}</Micro>
      <div className="ui-stack ui-gap-12" style={{ marginTop: 10 }}>{children}</div>
    </section>
  );
}
