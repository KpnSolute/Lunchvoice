import { useState } from "react";
import {
  Bars,
  Button,
  Card,
  Checkbox,
  CodeInput,
  ColorPicker,
  CopyField,
  Dialog,
  DistributionColumns,
  Empty,
  ErrorNote,
  Field,
  GateMeter,
  HubMark,
  IconButton,
  IconToggleGroup,
  Lifecycle,
  MakerMark,
  MakerSignature,
  Menu,
  Metric,
  Notice,
  NpsQuestion,
  OpenText,
  Pill,
  Progress,
  QuotaMeter,
  RadioGroup,
  Ranking,
  Rating,
  Segmented,
  Select,
  SingleChoice,
  Skeleton,
  Slider,
  SliderQuestion,
  StackedParticipation,
  Switch,
  Table,
  TextInput,
  Textarea,
  Tooltip,
  TrendLine,
  MultiChoice,
  YesNo,
  dailyTrend,
  shortDay,
  useToast,
} from "../ui";

// Dev-only component gallery (/__gallery): every component, every state, in the
// order of the handoff's UI Kit. The page and ink palettes are checked here.

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="stack" style={{ gap: 16, marginBottom: 48 }}>
      <div className="section-head" style={{ marginBottom: 0 }}>
        <h2 className="t-display-md" style={{ fontSize: 24 }}>
          {title}
        </h2>
        {note && <p className="t-small muted">{note}</p>}
      </div>
      <div className="stack" style={{ gap: 16 }}>{children}</div>
    </section>
  );
}

export function Gallery() {
  const toast = useToast();
  const [seg, setSeg] = useState("overview");
  const [rating, setRating] = useState<number | null>(null);
  const [single, setSingle] = useState<string | null>(null);
  const [multi, setMulti] = useState<string[]>([]);
  const [yes, setYes] = useState<boolean | null>(null);
  const [text, setText] = useState("");
  const [checkbox, setCheckbox] = useState(true);
  const [radio, setRadio] = useState("public");
  const [toggle, setToggle] = useState(true);
  const [slider, setSlider] = useState(60);
  const [select, setSelect] = useState<string | null>("starter");
  const [code, setCode] = useState("");
  const [color, setColor] = useState("#FF9A18");
  const [dialog, setDialog] = useState(false);
  const [menu, setMenu] = useState(false);
  const [marks, setMarks] = useState<string[]>(["bold"]);
  const [ranking, setRanking] = useState(["Morning run", "Track session", "Long trail"]);

  return (
    <div className="wrap page">
      <header className="page-head">
        <p className="t-label muted">Development only</p>
        <h1 className="t-display-lg">Component gallery</h1>
        <p className="t-body muted">
          Every component in <code className="mono">src/ui</code>, with its states. This route is excluded from production builds.
        </p>
      </header>

      <Section title="Actions" note="One primary per view. Press is scale(.94,.88) on every button.">
        <Card className="row" style={{ gap: 12 }}>
          <Button variant="primary" onClick={() => toast("Primary pressed", "ok")}>Primary</Button>
          <Button variant="raised">Raised</Button>
          <Button variant="ink">Ink</Button>
          <Button variant="quiet">Quiet</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="primary" loading>Loading</Button>
          <Button variant="raised" disabled>Disabled</Button>
          <IconButton icon="plus" label="Add" variant="primary" />
          <IconButton icon="settings" label="Settings" />
          <IconToggleGroup
            label="Text style"
            value={marks}
            onChange={setMarks}
            items={[
              { key: "bold", icon: "edit", label: "Bold" },
              { key: "italic", icon: "star", label: "Italic" },
              { key: "under", icon: "link", label: "Underline" },
            ]}
          />
          <Tooltip label="A tooltip">
            <Button variant="quiet" size="sm">Hover me</Button>
          </Tooltip>
        </Card>
      </Section>

      <Section title="Inputs" note="Wells with the ink focus ring and a 5px amber halo.">
        <div className="grid grid-2">
          <Card className="stack">
            <Field label="Text input" htmlFor="g-text" help="Help text sits under the field.">
              <TextInput id="g-text" placeholder="Placeholder" />
            </Field>
            <Field label="With an error" htmlFor="g-err" error="This one needs fixing.">
              <TextInput id="g-err" defaultValue="wrong" invalid />
            </Field>
            <Field label="Textarea" htmlFor="g-area" counter={{ value: text.length, max: 280 }}>
              <Textarea id="g-area" value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
            <Field label="Select" htmlFor="g-select">
              <Select
                id="g-select"
                label="Plan"
                value={select}
                onChange={setSelect}
                options={[
                  { value: "starter", label: "Starter", hint: "$13" },
                  { value: "team", label: "Team", hint: "$29" },
                  { value: "none", label: "No plan", disabled: true },
                ]}
              />
            </Field>
          </Card>

          <Card className="stack">
            <Checkbox checked={checkbox} onChange={setCheckbox}>Checkbox</Checkbox>
            <RadioGroup
              label="Visibility"
              value={radio}
              onChange={setRadio}
              options={[
                { value: "public", label: "Public", hint: "Anyone with the link" },
                { value: "private", label: "Private", hint: "Members only" },
              ]}
            />
            <Switch label="Switch" description="With a description." checked={toggle} onChange={setToggle} />
            <Slider label="Slider" value={slider} onChange={setSlider} format={(v) => `${v}%`} />
            <Field label="Code input" htmlFor="g-code">
              <CodeInput label="Code" value={code} onChange={setCode} length={6} />
            </Field>
            <Field label="Colour (contrast-safe set)">
              <ColorPicker value={color} onChange={setColor} />
            </Field>
          </Card>
        </div>
        <Card>
          <Segmented
            label="Segmented"
            value={seg}
            onChange={setSeg}
            items={[
              { key: "overview", label: "Overview" },
              { key: "campaigns", label: "Campaigns", count: 3 },
              { key: "analytics", label: "Analytics" },
              { key: "members", label: "Members" },
            ]}
          />
        </Card>
        <Card>
          <Segmented
            label="Pressed segmented"
            pressed
            value={seg}
            onChange={setSeg}
            items={[
              { key: "overview", label: "Pressed" },
              { key: "campaigns", label: "State" },
              { key: "analytics", label: "Selected" },
            ]}
          />
        </Card>
      </Section>

      <Section title="Question controls" note="The five answer modes, plus the future modes behind a flag.">
        <div className="grid grid-2">
          <Card><Rating prompt="How was the session?" value={rating} onChange={setRating} labels={{ low: "Poor", high: "Excellent" }} /></Card>
          <Card><SingleChoice prompt="Pick one" options={["Morning run", "Track session", "Long trail"]} value={single} onChange={setSingle} /></Card>
          <Card><MultiChoice prompt="Pick up to two" options={["A", "B", "C"]} value={multi} onChange={setMulti} max={2} /></Card>
          <Card><YesNo prompt="Would you come again?" value={yes} onChange={setYes} /></Card>
        </div>
        <Card><OpenText prompt="Anything else?" value={text} onChange={setText} suggestions={["More shade", "Earlier start"]} /></Card>
        <Card className="stack">
          <Pill tone="warn">futureModes: built, not routed</Pill>
          <NpsQuestion prompt="How likely are you to recommend us?" value={null} onChange={() => {}} />
          <SliderQuestion prompt="How busy was it?" value={5} onChange={() => {}} />
          <Ranking prompt="Rank these" items={ranking} order={ranking} onChange={setRanking} />
        </Card>
      </Section>

      <Section title="Display">
        <div className="grid grid-4">
          <Card className="stack stack-sm"><Metric label="Count-up metric" value={128} /></Card>
          <Card className="stack stack-sm"><Metric label="Withheld" value={null} /></Card>
          <Card className="stack stack-sm"><Metric label="Raw string" value="Starter" raw /></Card>
          <Card className="stack stack-sm"><Metric label="Zero is real" value={0} /></Card>
        </div>
        <Card className="row" style={{ gap: 8 }}>
          <Pill>Default</Pill>
          <Pill tone="accent">Accent</Pill>
          <Pill tone="ok">Ok</Pill>
          <Pill tone="warn">Warn</Pill>
          <Pill tone="danger">Danger</Pill>
          <Pill tone="quiet">Quiet</Pill>
          <HubMark name="Northside Running Club" slug="northside" />
        </Card>
        <Card className="stack">
          <Lifecycle steps={["ACTIVE", "GRACE", "RELEASED"]} current="GRACE" />
          <QuotaMeter label="Custom roles" used={2} limit={3} />
          <GateMeter participating={61} eligible={154} threshold={50} />
          <Progress value={42} label="Progress" />
        </Card>
        <Table
          caption="Example table"
          rowKey={(r: { name: string }) => r.name}
          rows={[{ name: "Dana", role: "Owner" }, { name: "Sam", role: "Analyst" }]}
          columns={[
            { key: "name", header: "Member", render: (r: { name: string }) => r.name },
            { key: "role", header: "Role", render: (r: { role: string }) => <Pill>{r.role}</Pill> },
          ]}
        />
        <CopyField label="Copy field" value="https://lunchvoice.com/c/8F2K1Q" />
        <div className="grid grid-2">
          <Empty icon="home" title="Empty state" action={<Button variant="primary" size="sm">Do something</Button>}>
            An empty state explains the next action, never just "no data".
          </Empty>
          <Card className="stack"><Skeleton rows={4} /></Card>
        </div>
      </Section>

      <Section title="Charts" note="Withheld is striped and labelled, never zero.">
        <div className="grid grid-2">
          <Card className="stack">
            <Bars
              items={[
                { label: "Answered", value: 41 },
                { label: "Second", value: 28 },
                { label: "Third", value: 19 },
                { label: "Small group", value: null, withheld: true },
              ]}
            />
          </Card>
          <Card className="stack">
            <DistributionColumns
              items={[
                { label: "1", value: 4 },
                { label: "2", value: 7 },
                { label: "3", value: 18 },
                { label: "4", value: 22 },
                { label: "5", value: null, withheld: true },
              ]}
            />
          </Card>
        </div>
        <Card className="stack">
          <TrendLine points={dailyTrend(Array.from({ length: 30 }, (_, i) => new Date(Date.now() - (i % 14) * 86_400_000).toISOString()), 14).map((p) => ({ label: shortDay(p.label), value: p.value }))} />
          <StackedParticipation participating={96} eligible={154} withheld={4} />
        </Card>
      </Section>

      <Section title="Overlays">
        <Card className="row" style={{ gap: 12 }}>
          <Button variant="raised" onClick={() => setDialog(true)}>Open dialog</Button>
          <span style={{ position: "relative" }}>
            <Button variant="raised" onClick={() => setMenu(true)}>Open menu</Button>
            <Menu
              open={menu}
              onClose={() => setMenu(false)}
              label="Example menu"
              align="left"
              items={[
                { key: "a", label: "First item", icon: "home" },
                { key: "b", label: "Second item", icon: "settings" },
                { key: "c", label: "Danger item", icon: "trash", danger: true },
              ]}
            />
          </span>
        </Card>
        <Dialog
          open={dialog}
          onClose={() => setDialog(false)}
          title="A dialog"
          footer={
            <>
              <Button variant="quiet" onClick={() => setDialog(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => setDialog(false)}>Confirm</Button>
            </>
          }
        >
          <p className="t-small muted">Focus is trapped, Esc closes, and focus returns to the trigger.</p>
          <TextInput aria-label="Example field" placeholder="Focusable" />
        </Dialog>
      </Section>

      <Section title="States" note="The ten shared state patterns from the spec.">
        <div className="grid grid-2">
          <Card className="stack"><Pill>Loading</Pill><Skeleton rows={3} /></Card>
          <Card className="stack"><Pill>Empty</Pill><p className="t-small muted">No Campaigns yet.</p></Card>
          <Notice tone="error" title="Error with a request id">Something went wrong. Reference <code className="mono">req_8f2k1q</code>.</Notice>
          <Notice tone="warn" title="Conflict">That address was taken while you were typing. Pick another.</Notice>
          <Notice tone="warn" title="Rate limited">Too many attempts. Wait a moment and try again.</Notice>
          <Notice tone="info" title="Offline">Your answers are saved on this device. Reconnect to send.</Notice>
          <Notice tone="error" title="Outage">The database is not responding. Nothing was lost.</Notice>
          <Notice tone="warn" title="Not available yet">Waiting on <code className="mono">lv_hub_update</code>.</Notice>
          <Notice tone="info" title="Denied">Your role does not include <code className="mono">analytics.read</code>.</Notice>
          <Notice tone="ok" title="Success">Saved.</Notice>
        </div>
        <ErrorNote error={{ code: "lv_rate_limited", message: "" }} />
      </Section>

      <Section title="Brand">
        <Card className="stack">
          <MakerSignature still width={200} height={64} />
          <p className="t-small subtle">The KpnSolute signature, v1.0.0 final: hero, footer and loader modes.</p>
        </Card>
        <div className="grid grid-2">
          <Card className="stack"><Pill>mode="footer"</Pill><MakerMark still={false} /></Card>
          <Card className="stack"><Pill>mode="loader"</Pill><MakerSignature mode="loader" width={200} height={64} color="currentColor" /></Card>
        </div>
      </Section>
    </div>
  );
}
