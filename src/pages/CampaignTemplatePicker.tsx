import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/shadcn/badge";
import { RadioCard, RadioGroup } from "@/components/shadcn/radio-group";
import { Eyebrow, Notice, Segmented } from "@/components/shadcn/blocks";
import { TemplateQuestions } from "../components/TemplateQuestions";
import {
  CAMPAIGN_TEMPLATES,
  GROUP_BLURB,
  GROUP_LABEL,
  groupOf,
  templateOffered,
  usesSurveySlot,
  type CampaignTemplate,
  type CampaignTemplateGroup,
  type PlanView,
} from "../config/campaignTemplates";

const GROUPS: CampaignTemplateGroup[] = ["starter", "team", "window"];

/**
 * "Start from a template" for a Hub Campaign, grouped by what each plan is for. Whether a Team template is offered is
 * display only (see templateOffered): the backend decides, and refuses a premium action the plan does not include.
 */
export function CampaignTemplatePicker({
  value,
  onChange,
  plan,
  hubSlug,
  initialGroup = "starter",
}: {
  value: string;
  onChange: (id: string) => void;
  plan: PlanView | null | undefined;
  hubSlug: string;
  initialGroup?: CampaignTemplateGroup;
}) {
  const [group, setGroup] = useState<CampaignTemplateGroup>(initialGroup);
  const shown = CAMPAIGN_TEMPLATES.filter((t) => groupOf(t) === group);
  const teamLocked = shown.some((t) => !templateOffered(t, plan));
  return (
    <fieldset className="lv-fieldset" data-testid="campaign-template-picker">
      <legend className="lv-legend">Start from</legend>
      <Segmented<CampaignTemplateGroup>
        label="Template plan"
        value={group}
        onValueChange={setGroup}
        options={GROUPS.map((g) => ({ value: g, label: GROUP_LABEL[g] }))}
      />
      <p className="ui-help lv-m0" data-testid="group-blurb">{GROUP_BLURB[group]}</p>
      {teamLocked && (
        <Notice tone="info" title="Some of these need Team features">
          Role targeting, and the longer surveys, come with a Team Hub or a Campaign Plus window. You can still read what each one does.{" "}
          <Link className="lv-inline-link" to={`/${hubSlug}/billing`}>See plans</Link>
        </Notice>
      )}
      <RadioGroup value={value} onValueChange={onChange} aria-label="Start from" className="ui-grid-2">
        <RadioCard value="blank" title="Blank" description="Choose the mode and write your own questions." />
        {/* The chosen template stays visible when the group changes, so the selection never disappears. */}
        {CAMPAIGN_TEMPLATES.filter((t) => groupOf(t) === group || t.id === value).map((t) => {
          const offered = templateOffered(t, plan);
          return (
            <RadioCard
              key={t.id}
              value={t.id}
              disabled={!offered}
              title={t.name}
              description={offered ? t.blurb : `${t.blurb} Needs Team features.`}
              badge={t.plan === "team" ? <Badge>Team</Badge> : undefined}
            />
          );
        })}
      </RadioGroup>
    </fieldset>
  );
}

/** What a chosen template will create: its settings, what it exercises, and the questions. */
export function CampaignTemplateSummary({ t }: { t: CampaignTemplate }) {
  const audience = t.targetsRoles ? "The roles you choose" : "All members";
  return (
    <div className="lv-stack-16" data-testid="campaign-template-summary">
      <p className="lv-mk-card-body">{t.focus}</p>
      <dl className="lv-kv" aria-label="Template settings">
        <dt>Mode</dt><dd>{t.mode[0]!.toUpperCase() + t.mode.slice(1)}{usesSurveySlot(t) ? " (uses one active-survey slot)" : ""}</dd>
        <dt>Answers</dt><dd>{t.anonymity === "anonymous" ? "Anonymous" : "Identified: managers see who answered"}</dd>
        <dt>Who can answer</dt><dd>{audience}{t.targetsRoles ? ". You pick them next." : ""}</dd>
        <dt>Runs</dt><dd>{t.windowDays ? `Closes ${t.windowDays} days after you create it. You can change the date.` : "Until you close it"}</dd>
      </dl>
      <ul className="lv-uc-opts" aria-label="What it uses">
        {t.uses.map((u) => <li key={u}>{u}</li>)}
      </ul>
      <Eyebrow>Questions you can edit before publishing</Eyebrow>
      <TemplateQuestions questions={t.questions} />
    </div>
  );
}
