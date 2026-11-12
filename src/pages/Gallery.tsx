import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Icon, type IconName } from "../components/Icon";
import { MadeBy } from "../components/MakerMark";
import { campaignPhase } from "../components/ui";
import { ThemeControl } from "../ui/ThemeControl";
import { QuestionInput } from "../ui/QuestionControls";
import { StateScreen, type StateKind } from "../ui/StateScreen";
import { HubMark } from "../ui/HubMark";
import { HubProfile } from "../ui/HubProfile";
import { CountUp } from "../ui/motion";
import { LvMark } from "../components/LvMark";
import { HubCard } from "../components/HubCard";
import { ShareHubDialog } from "../components/ShareHub";
import { BadgeRow, IconBadge } from "../components/IconBadge";
import { BADGES, type BadgeKey } from "../config/badges";
import { Bars, DistributionColumns, TrendLine } from "../components/charts";
import { Alert, AlertDescription, AlertTitle } from "@/components/shadcn/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/shadcn/alert-dialog";
import { QrCode } from "@/components/shadcn/blocks/qr";
import { ResultBars, TextAnswers, WithheldTag } from "@/components/shadcn/blocks/results";
import type { HubInfo, Question } from "../lib/lvApi";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import { Label } from "@/components/shadcn/label";
import { Checkbox } from "@/components/shadcn/checkbox";
import { Switch } from "@/components/shadcn/switch";
import { RadioCard, RadioGroup, RadioGroupItem } from "@/components/shadcn/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/shadcn/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/shadcn/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/shadcn/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn/tooltip";
import { Badge } from "@/components/shadcn/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/shadcn/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shadcn/table";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Progress } from "@/components/shadcn/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/shadcn/accordion";
import { Separator } from "@/components/shadcn/separator";
import { Avatar, AvatarFallback } from "@/components/shadcn/avatar";
import { ScrollArea } from "@/components/shadcn/scroll-area";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/shadcn/input-otp";
import {
  CopyField,
  DisabledAction,
  EmptyState,
  Eyebrow,
  Field,
  LoadingRows,
  Metric,
  NavTabs,
  Notice,
  PageHeader,
  PhaseBadge,
  QuotaMeter,
  RowItem,
  RowList,
  SectionTitle,
  Segmented,
  StatTile,
  ToggleRow,
  TypedConfirm,
  type Phase,
} from "@/components/shadcn/blocks";

const ICONS: IconName[] = ["home", "star", "star-fill", "survey", "voice", "roster", "dashboard", "bulb", "flame", "sparkle", "lock", "check", "arrow", "plus", "settings", "join", "globe", "clock", "coin", "crown", "shield-check", "sprout", "menu", "more", "back", "close", "chevron", "logout", "store", "orders", "fork"];
const PHASES: Phase[] = ["draft", "scheduled", "open", "ended", "paused", "closed", "archived"];
const STATES: StateKind[] = ["notfound", "closed", "scheduled", "offline"];
const SAMPLE_QS: Question[] = [
  { question_id: "g1", position: 0, kind: "rating", prompt: "How was the long run?", config: {} },
  { question_id: "g2", position: 1, kind: "single_choice", prompt: "Which night works?", config: { options: ["Tuesday", "Thursday", "Saturday"] } },
  { question_id: "g3", position: 2, kind: "yes_no", prompt: "Bring a friend?", config: {} },
];

// Development-only: every reusable component (design system 3), in its main states. Not routed in production.
// Toggle the theme at the top to check light, dark and high contrast. `npm run check:design` fails when a reusable
// component is missing from this page (scripts/check-gallery.mjs); register new components here.
const SAMPLE_HUB: HubInfo = {
  hub_id: "gallery-hub", slug: "harbor-books", name: "Harbor Book Circle", visibility: "public", membership_mode: "open",
  member_count: 42, about: "Monthly picks, honest reviews and a vote on what we read next.", accent: "teal", accent_hex: "#0F766E",
  plan: { family: "starter", product: "founding", ends_at: null, state: "active" },
};
const BADGE_KINDS = Object.keys(BADGES) as BadgeKey[];
export function Gallery() {
  const [seg, setSeg] = useState("link");
  const [radio, setRadio] = useState("anonymous");
  const [card, setCard] = useState("starter");
  const [otp, setOtp] = useState("48");
  const [qv, setQv] = useState<Record<string, unknown>>({});

  return (
    <div className="ui-page lv-gallery">
      <PageHeader eyebrow="Dev only" title="Component gallery" sub="The one component system (design system 3): shadcn/ui on LunchVoice tokens. Not routed in production." actions={<ThemeControl />} />

      <Section title="Type roles">
        <h1 className="ui-display ui-display-xl" style={{ margin: 0 }}>Display XL</h1>
        <h2 className="ui-display ui-display-lg" style={{ margin: 0 }}>Display large</h2>
        <h3 className="ui-display ui-display-md" style={{ margin: 0 }}>Display medium</h3>
        <p style={{ margin: 0 }}>Body in Geist, 16px. The working voice of the product, never wider than 62 characters.</p>
        <Eyebrow>Label role</Eyebrow>
        <Eyebrow accent>Accent eyebrow</Eyebrow>
        <code className="lv-code">482913</code>
        <MadeBy />
      </Section>

      <Section title="Buttons">
        <Row>
          <Button variant="primary">Primary CTA</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ink">Ink</Button>
          <Button variant="quiet">Quiet</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="primary" disabled>Disabled</Button>
        </Row>
        <Row>
          <Button size="sm" variant="secondary">Small</Button>
          <Button size="md" variant="secondary">Medium</Button>
          <Button size="lg" variant="ink">Large <Icon name="arrow" size={16} /></Button>
          <Button size="icon" variant="secondary" aria-label="Add"><Icon name="plus" size={18} /></Button>
          <Button size="icon-lg" variant="ink" aria-label="Next"><Icon name="arrow" size={20} /></Button>
        </Row>
        <DisabledAction reason="Billing is not live yet. Your Founding seat keeps Starter features free until 30 days after billing launches.">Start checkout</DisabledAction>
      </Section>

      <Section title="Fields">
        <div className="ui-grid-2">
          <Field label="Hub name" htmlFor="g-name" help="3 to 60 characters." counter={{ value: 22, max: 60 }}>
            <Input id="g-name" defaultValue="Northside Running Club" />
          </Field>
          <Field label="Address" htmlFor="g-slug" error="That address is reserved for the platform.">
            <Input id="g-slug" defaultValue="settings" aria-invalid />
          </Field>
          <Field label="Disabled" htmlFor="g-dis">
            <Input id="g-dis" disabled placeholder="Not editable" />
          </Field>
          <Field label="Visibility" htmlFor="g-sel">
            <Select defaultValue="public">
              <SelectTrigger id="g-sel"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="private">Private</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="About" htmlFor="g-about" help="Shown on your Hub's landing page.">
          <Textarea id="g-about" defaultValue="Weekly long runs and a monthly social." />
        </Field>
        <Field label="Join code" htmlFor="g-otp">
          <InputOTP id="g-otp" maxLength={6} value={otp} onChange={setOtp}>
            <InputOTPGroup>{[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} />)}</InputOTPGroup>
          </InputOTP>
        </Field>
      </Section>

      <Section title="Choices">
        <Row>
          <Label className="lv-inline-label"><Checkbox defaultChecked /> Checked</Label>
          <Label className="lv-inline-label"><Checkbox /> Unchecked</Label>
          <Label className="lv-inline-label"><Checkbox disabled /> Disabled</Label>
          <Label className="lv-inline-label"><Switch defaultChecked /> On</Label>
          <Label className="lv-inline-label"><Switch /> Off</Label>
        </Row>
        <RadioGroup value={radio} onValueChange={setRadio} aria-label="Anonymity" className="lv-gallery-radios">
          <Label className="lv-inline-label"><RadioGroupItem value="anonymous" /> Anonymous</Label>
          <Label className="lv-inline-label"><RadioGroupItem value="identified" /> Identified</Label>
        </RadioGroup>
        <Segmented label="Access" value={seg} onValueChange={setSeg} options={[{ value: "link", label: "Anyone with the link" }, { value: "invite", label: "Invite only" }, { value: "off", label: "Disabled", disabled: true }]} />
        <RadioGroup value={card} onValueChange={setCard} aria-label="Plan" className="ui-grid-3">
          <RadioCard value="free" title="Quick Survey" description="Free, 5 active, 10 questions." />
          <RadioCard value="starter" title="Starter Hub" description="3 roles, 3 pages, 15 Campaigns." badge={<Badge variant="ink">Founding</Badge>} />
          <RadioCard value="team" title="Team Hub" description="Coming with billing." disabled />
        </RadioGroup>
        <ToggleRow title="Allow guests" description="Guests answer without an account and never count as members." control={<Switch defaultChecked aria-label="Allow guests" />} />
      </Section>

      <Section title="Question controls">
        <div className="ui-grid-3">
          {SAMPLE_QS.map((q) => (
            <Card key={q.question_id} size="sm">
              <strong>{q.prompt}</strong>
              <QuestionInput q={q} value={qv[q.question_id]} onChange={(v) => setQv((s) => ({ ...s, [q.question_id]: v }))} />
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Navigation">
        <NavTabs label="Gallery tabs" items={[{ to: "/__gallery", label: "Overview", end: true }, { to: "/__gallery/x", label: "Campaigns" }, { to: "/__gallery/y", label: "Members" }]} />
        <Tabs defaultValue="edit">
          <TabsList>
            <TabsTrigger value="outline">Outline</TabsTrigger>
            <TabsTrigger value="edit">Edit</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
          <TabsContent value="outline">Outline pane</TabsContent>
          <TabsContent value="edit">Edit pane</TabsContent>
          <TabsContent value="preview">Preview pane</TabsContent>
        </Tabs>
      </Section>

      <Section title="Overlays">
        <Row>
          <Dialog>
            <DialogTrigger asChild><Button variant="secondary">Dialog</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Publish this survey?</DialogTitle>
                <DialogDescription>Questions lock once answers arrive. You can still close it at any time.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
                <DialogClose asChild><Button variant="primary">Publish</Button></DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <TypedConfirm
            trigger={<Button variant="danger">Typed confirm</Button>}
            title="Delete Northside Running Club?"
            description="This deletes the Hub, its Campaigns and its results. It cannot be undone."
            phrase="northside-running"
            actionLabel="Delete Hub"
            onConfirm={() => { toast.success("Confirmed (gallery only)"); return true; }}
          />
          <Sheet>
            <SheetTrigger asChild><Button variant="secondary">Bottom sheet</Button></SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>More sections</SheetTitle>
                <SheetDescription>Everything that does not fit in the bottom tabs.</SheetDescription>
              </SheetHeader>
              <Button variant="secondary" block>Invites</Button>
              <Button variant="secondary" block>Roles</Button>
            </SheetContent>
          </Sheet>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="secondary">Menu <Icon name="chevron" size={14} /></Button></DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Campaign</DropdownMenuLabel>
              <DropdownMenuItem>Pause</DropdownMenuItem>
              <DropdownMenuItem>Duplicate</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive">Archive</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Popover>
            <PopoverTrigger asChild><Button variant="secondary">Popover</Button></PopoverTrigger>
            <PopoverContent><strong>Withheld</strong><span>Too few answers to publish without exposing who answered.</span></PopoverContent>
          </Popover>
          <Tooltip>
            <TooltipTrigger asChild><Button variant="quiet">Tooltip</Button></TooltipTrigger>
            <TooltipContent>Guests never count as members</TooltipContent>
          </Tooltip>
          <Button variant="ink" onClick={() => toast.success("Survey published", { description: "Share the link or the code." })}>Toast</Button>
          <Button variant="secondary" onClick={() => toast.error("That address is taken.")}>Error toast</Button>
        </Row>
      </Section>

      <Section title="Feedback">
        <Notice tone="info" title="Billing is not live yet">Nothing here charges money.</Notice>
        <Notice tone="ok">Saved.</Notice>
        <Notice tone="warn" title="Over the limit">You have 5 of 5 active Quick Surveys. Close one to start another.</Notice>
        <Notice tone="error">Something went wrong on our side. Try again.</Notice>
        <Card variant="well"><EmptyState icon={<Icon name="survey" size={24} />} title="No Quick Surveys yet" action={<Button variant="primary">Create one</Button>}>Ask anything, share a link, read the totals.</EmptyState></Card>
        <LoadingRows rows={3} />
        <Row><Skeleton className="lv-skel-circle" /><Skeleton className="lv-skel-line" /></Row>
      </Section>

      <Section title="Data">
        <div className="ui-grid-3">
          <StatTile tone="ink" label="Hubs" value={2} note="You belong to these Hubs" />
          <StatTile tone="accent" label="Hub credits" value={1} note="Founding seat" />
          <StatTile label="Quick Surveys" value="3/5" note="Active right now" />
        </div>
        <div className="ui-grid-3">
          <Metric value={128} label="Participants" hint="Guests never count as members." />
          <Metric value={null} label="Participants" hint="Too few answers to publish." />
          <Metric tone="raised" value="42%" label="Participation" />
        </div>
        <div className="ui-grid-2">
          <QuotaMeter label="Custom roles" used={2} limit={3} />
          <QuotaMeter label="Active surveys" used={2} limit={2} />
          <QuotaMeter label="Team active Campaigns" used={4} limit={null} hint="Provisional, set by the backend." />
          <Progress value={62} aria-label="Progress example" />
        </div>
        <Row>{PHASES.map((p) => <PhaseBadge key={p} phase={p} />)}</Row>
        <Row>
          <Badge>Neutral</Badge><Badge variant="accent">Accent</Badge><Badge variant="ok">Admitted</Badge><Badge variant="danger">Expired</Badge><Badge variant="ink">Owner</Badge><Badge variant="outline">Outline</Badge>
        </Row>
        <Card>
          <Table>
            <TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Role</TableHead><TableHead className="lv-num">Answered</TableHead></TableRow></TableHeader>
            <TableBody>
              <TableRow><TableCell>Dana Reyes</TableCell><TableCell><Badge variant="ink">Owner</Badge></TableCell><TableCell className="lv-num">12</TableCell></TableRow>
              <TableRow><TableCell>Sam Okafor</TableCell><TableCell><Badge>Coach</Badge></TableCell><TableCell className="lv-num">9</TableCell></TableRow>
              <TableRow><TableCell>Priya Nair</TableCell><TableCell>—</TableCell><TableCell className="lv-num">Withheld</TableCell></TableRow>
            </TableBody>
          </Table>
        </Card>
        <CopyField label="Share link" value="https://lunchvoice.com/c/482913" />
        <Row>
          <Avatar><AvatarFallback>NR</AvatarFallback></Avatar>
          <Avatar size="lg"><AvatarFallback>HB</AvatarFallback></Avatar>
          <HubMark name="Oakridge Parents" />
        </Row>
      </Section>

      <Section title="Cards">
        <div className="ui-grid-3">
          <Card><CardHeader><CardTitle>Card</CardTitle><CardDescription>The raised card surface.</CardDescription></CardHeader><CardFooter><Button size="sm">Action</Button></CardFooter></Card>
          <Card variant="ink"><CardHeader><CardTitle>Ink</CardTitle><CardDescription>The featured card.</CardDescription></CardHeader><CardContent><Button variant="primary" size="sm">Continue</Button></CardContent></Card>
          <Card variant="dashed"><CardHeader><CardTitle>Dashed</CardTitle><CardDescription>An invitation to add something.</CardDescription></CardHeader></Card>
        </div>
      </Section>

      <Section title="Brand">
        <Row><LvMark size={20} /><LvMark size={32} /><LvMark size={48} /><span className="ui-muted">LvMark follows the text colour; the bubble and bowl stay amber.</span></Row>
      </Section>

      <Section title="Hub identity">
        <HubProfile hub={SAMPLE_HUB} actions={<Button variant="secondary">Share</Button>} />
        <HubProfile hub={SAMPLE_HUB} compact owner />
        <div className="lv-hcard-grid">
          <HubCard hub={SAMPLE_HUB} badges={["founding"]} action={<span className="lv-hcard-fakebtn" aria-hidden="true">Join</span>} />
          <HubCard hub={{ name: "Northside Running Club", slug: "northside-running", members_label: "700+ active members", membership_mode: "approval", category: "Sports and fitness" }} badges={["discover"]} compact />
        </div>
        <Row><ShareHubDialog hub={SAMPLE_HUB} trigger={<Button variant="secondary">Open the share dialog</Button>} /></Row>
      </Section>

      <Section title="Badges with a meaning">
        <Row>{BADGE_KINDS.map((k) => <span key={k} className="ui-row"><IconBadge kind={k} />{BADGES[k].label}</span>)}</Row>
        <Row><strong>Harbor Book Circle</strong><BadgeRow kinds={["founding", "team", "owner"]} /></Row>
      </Section>

      <Section title="Results and charts">
        <ResultBars caption="Which night works?" cells={[{ key: "tue", label: "Tuesday", n: 14, suppressed: false }, { key: "thu", label: "Thursday", n: 9, suppressed: false }, { key: "sat", label: "Saturday", n: null, suppressed: true }]} />
        <Row><WithheldTag /><span className="ui-muted">A withheld value is its own state, never zero.</span></Row>
        <TextAnswers texts={["More evening runs, please.", "The new route was great."]} />
        <Bars items={[{ label: "Rating 5", value: 18 }, { label: "Rating 4", value: 11 }, { label: "Rating 3", value: 4 }]} />
        <DistributionColumns buckets={[2, 4, 9, 14, 7]} labels={["1", "2", "3", "4", "5"]} />
        <TrendLine points={[{ label: "Mon", value: 3 }, { label: "Tue", value: 7 }, { label: "Wed", value: 5 }, { label: "Thu", value: 12 }]} />
        <Row><strong className="ui-display"><CountUp value={128} /></strong><span className="ui-muted">CountUp respects reduced motion.</span></Row>
      </Section>

      <Section title="Rows, QR and alerts">
        <Card>
          <SectionTitle action={<Button variant="quiet" size="sm">All</Button>}>Section title</SectionTitle>
          <RowList>
            <RowItem leading={<HubMark name="Dana Reyes" size={34} />} title="Dana Reyes" sub="Owner" trailing={<IconBadge kind="owner" />} />
            <RowItem leading={<HubMark name="Sam Okafor" size={34} />} title="Sam Okafor" sub="Coach" />
          </RowList>
        </Card>
        <Row><QrCode value="https://hub.lunchvoice.com/harbor-books" label="QR code for the sample Hub" size={160} /></Row>
        <Alert><AlertTitle>Alert</AlertTitle><AlertDescription>The primitive behind Notice; prefer Notice in pages.</AlertDescription></Alert>
        <AlertDialog>
          <AlertDialogTrigger asChild><Button variant="danger">Alert dialog</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Close this Campaign?</AlertDialogTitle><AlertDialogDescription>People can no longer answer. Results stay.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Keep it open</AlertDialogCancel><AlertDialogAction>Close Campaign</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Section>

      <Section title="Accordion, separator, scroll area">
        <Accordion type="single" collapsible>
          <AccordionItem value="a"><AccordionTrigger>Can anyone trace an answer back to me?</AccordionTrigger><AccordionContent>No. Anonymous Campaigns keep eligibility and answers apart.</AccordionContent></AccordionItem>
          <AccordionItem value="b"><AccordionTrigger>Why do some results say withheld?</AccordionTrigger><AccordionContent>A cohort below the privacy floor is withheld, never shown as zero.</AccordionContent></AccordionItem>
        </Accordion>
        <Separator />
        <ScrollArea className="lv-gallery-scroll">
          {ICONS.map((i) => <div key={i} className="lv-gallery-icon"><Icon name={i} size={20} /> {i}</div>)}
        </ScrollArea>
      </Section>

      <Section title="States (L11)">
        <div className="ui-grid-2">{STATES.map((k) => <Card key={k} variant="well"><StateScreen kind={k} /></Card>)}</div>
        <p className="ui-muted">Phase of a sample Campaign: <PhaseBadge phase={campaignPhase({ status: "active", opens_at: null, closes_at: null })} /></p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="lv-gallery-section" aria-label={title}>
      <h2 className="lv-gallery-h">{title}</h2>
      <div className="lv-gallery-body">{children}</div>
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="ui-row">{children}</div>;
}
