import type { CSSProperties } from "react";
import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "../lib/useLv";
import { describeError } from "../lib/errors";
import type { ElectionRace, ElectionResults } from "../lib/lvApi";
import { partyColor } from "../config/partyColors";
import { Icon } from "../components/Icon";
import { CountUp } from "../ui/motion";
import { Card } from "@/components/shadcn/card";
import { Badge } from "@/components/shadcn/badge";
import { Eyebrow, LoadingRows, Notice } from "@/components/shadcn/blocks";
import { WithheldTag } from "@/components/shadcn/blocks/results";

/**
 * Election night (000038). Every number comes from lv_election_results, which applies the strict engine: nothing before
 * the end, small groups merged, unanimity withheld, and a group table only when every cell is safe. A withheld number is
 * shown as withheld, never as zero. Colour marks party identity (fixed order, validated palette); names and numbers
 * always sit beside it in text ink, so nothing depends on colour alone.
 */
export function ElectionNight({ campaignId }: { campaignId: string }) {
  const { api } = useIdentity();
  const r = useLv(() => api.electionResults(campaignId), [api, campaignId]);
  if (r.loading && !r.data) return <LoadingRows rows={4} label="Counting the votes" />;
  if (r.error) {
    if (r.error.code === "lv_policy_undecided")
      return (
        <Card className="lv-en-wait" data-testid="election-wait">
          <span className="lv-en-ballot" aria-hidden="true"><Icon name="lock" size={22} /></span>
          <h2 className="lv-en-h2">The ballot box is sealed.</h2>
          <p className="ui-muted lv-m0">It’s a secret ballot, so results and turnout appear the moment the election ends. Not a moment sooner.</p>
        </Card>
      );
    return <Notice tone="error">{describeError(r.error)}</Notice>;
  }
  const d = r.data;
  if (!d) return null;
  return (
    <div className="lv-stack-16 lv-en" data-testid="election-night">
      <Hero d={d} />
      {d.races.map((race) => <RaceCard key={race.question_id} race={race} parties={d.parties} />)}
      {d.groups.length > 0 && <TurnoutByGroup d={d} />}
      <p className="ui-help lv-m0 lv-en-privacy">
        <Icon name="lock" size={14} /> Secret ballot. Groups with fewer than {d.min_cohort} voters are combined, a group where everyone voted the same
        way is never broken out, and a number that could reveal how someone voted is withheld, never shown as zero.
      </p>
    </div>
  );
}

function Hero({ d }: { d: ElectionResults }) {
  const partisan = d.parties.length > 0 && d.scoreboard.some((s) => s.party);
  const majority = Math.floor(d.seats_total / 2) + 1;
  const leader = d.scoreboard[0];
  const wonMajority = partisan && leader?.party && leader.seats >= majority && d.seats_total > 1;
  const turnout = d.turnout.turnout_pct ?? d.turnout.participation?.rate ?? null;
  return (
    <Card variant="ink" className="lv-en-hero">
      <div className="ui-spread">
        <Eyebrow accent>Election night</Eyebrow>
        <Badge variant="accent">Final</Badge>
      </div>
      <h2 className="lv-en-title">{wonMajority ? <>{leader!.party} <em>takes the majority.</em></> : <>The results <em>are in.</em></>}</h2>

      {partisan && (
        <div className="lv-en-score" data-testid="scoreboard">
          <div className="lv-en-seatbar" role="img" aria-label={d.scoreboard.map((s) => `${s.party ?? "Independent"} ${s.seats} of ${d.seats_total} seats`).join(", ")}>
            {d.scoreboard.map((s) => (
              <i key={s.party ?? "ind"} style={{ flexGrow: s.seats, background: partyColor(d.parties, s.party) }} title={`${s.party ?? "Independent"}: ${s.seats} ${s.seats === 1 ? "seat" : "seats"}`} />
            ))}
            {d.seats_total - d.scoreboard.reduce((a, s) => a + s.seats, 0) > 0 && (
              <i className="lv-en-seat-open" style={{ flexGrow: d.seats_total - d.scoreboard.reduce((a, s) => a + s.seats, 0) }} title="Tied or not enough votes to call" />
            )}
            {d.seats_total > 1 && <b className="lv-en-majority" style={{ left: `${(majority / d.seats_total) * 100}%` }} aria-hidden="true" />}
          </div>
          <ul className="lv-en-legend">
            {d.scoreboard.map((s) => (
              <li key={s.party ?? "ind"}>
                <span className="lv-en-dot" style={{ background: partyColor(d.parties, s.party) }} aria-hidden="true" />
                <span>{s.party ?? "Independents"}</span>
                <strong className="mono">{s.seats}</strong>
              </li>
            ))}
            {d.seats_total > 1 && <li className="lv-en-legend-note">{majority} of {d.seats_total} seats for a majority</li>}
          </ul>
        </div>
      )}

      <div className="lv-en-stats">
        <Stat label="Votes cast" value={d.turnout.voters} />
        <Stat label="Turnout" value={turnout} suffix="%" decimals={1} hint={turnout === null ? "Withheld near 0% or 100%, or when too few voted" : undefined} />
        {d.voting === "ballot_codes" && <Stat label="Ballot codes issued" value={d.turnout.issued} />}
        <Stat label={d.seats_total === 1 ? "Seat" : "Seats"} value={d.seats_total} />
      </div>
    </Card>
  );
}

function Stat({ label, value, suffix = "", decimals = 0, hint }: { label: string; value: number | null; suffix?: string; decimals?: number; hint?: string }) {
  return (
    <div className="lv-en-stat">
      <span className="lv-en-stat-v mono">{value === null ? <WithheldTag /> : <>{decimals > 0 ? value : <CountUp value={value} />}{suffix}</>}</span>
      <span className="lv-en-stat-l">{label}</span>
      {hint && <small className="lv-en-stat-h">{hint}</small>}
    </div>
  );
}

function marginChip(race: ElectionRace) {
  if (race.tie) return <Badge variant="ink">Tie</Badge>;
  if (race.margin_pts === null) return null;
  const m = race.margin_pts;
  return <Badge variant={m < 5 ? "outline" : m >= 25 ? "accent" : "neutral"}>{m < 5 ? `Close race · ${m} pts` : m >= 25 ? `Landslide · ${m} pts` : `Won by ${m} pts`}</Badge>;
}

function PartyTag({ parties, party }: { parties: string[]; party: string | null }) {
  return (
    <span className="lv-en-party">
      <span className="lv-en-dot" style={{ background: partyColor(parties, party) }} aria-hidden="true" />
      {party ?? "Independent"}
    </span>
  );
}

function RaceCard({ race, parties }: { race: ElectionRace; parties: string[] }) {
  const winners = new Set(race.winners ?? []);
  const party = (name: string) => race.candidates.find((c) => c.name === name)?.party ?? null;
  const ordered = [...race.candidates].sort((a, b) => (b.votes ?? -1) - (a.votes ?? -1) || Number(winners.has(b.name)) - Number(winners.has(a.name)));
  const top = Math.max(1, ...race.candidates.map((c) => c.share ?? 0));
  return (
    <Card className="lv-en-race" data-testid="race">
      <div className="ui-spread">
        <Eyebrow>Race {String(race.position).padStart(2, "0")} · {race.seats === 1 ? "1 winner" : `${race.seats} seats`}</Eyebrow>
        <div className="ui-row">{marginChip(race)}</div>
      </div>
      <h3 className="lv-en-race-title">{race.prompt}</h3>

      {race.winners && race.winners.length > 0 ? (
        <div className="lv-en-winners" data-testid="winners">
          {race.winners.map((w) => (
            <div key={w} className="lv-en-winner" style={{ "--party": partyColor(parties, party(w)) } as CSSProperties}>
              <span className="lv-en-crown" aria-hidden="true"><Icon name="star-fill" size={16} /></span>
              <div><strong>{w}</strong> <span className="ui-muted">{race.tie ? "leads" : "wins"}</span><div><PartyTag parties={parties} party={party(w)} /></div></div>
            </div>
          ))}
        </div>
      ) : race.tie && race.tied ? (
        <p className="lv-m0"><strong>Tied:</strong> {race.tied.join(", ")}. The organiser decides the tie-break.</p>
      ) : (
        <p className="ui-muted lv-m0">Not enough votes to call this race safely.</p>
      )}
      {race.tie && race.tied && race.winners && race.winners.length > 0 && <p className="ui-muted lv-m0">Tied for the last seat: {race.tied.join(", ")}.</p>}

      {race.withheld ? (
        <Notice tone="info" title="Counts withheld">
          {race.withheld_reason === "dominance" ? "Nearly everyone chose the same candidate, so exact counts would reveal individual votes." : "Too few votes to show exact counts."}
          {race.winners ? " The winner is still announced." : ""}
        </Notice>
      ) : (
        <ol className="lv-en-cands" aria-label={`${race.prompt}: votes by candidate`}>
          {ordered.map((c) => (
            <li key={c.name} title={c.votes === null ? `${c.name}: withheld` : `${c.name}: ${c.votes} votes (${c.share}%)`}>
              <div className="lv-en-cand-head">
                <span className="lv-en-cand-name">{winners.has(c.name) && <Icon name="check" size={14} />}<strong>{c.name}</strong><PartyTag parties={parties} party={c.party} /></span>
                <span className="mono">{c.votes === null ? <WithheldTag /> : <>{c.share}% <small>· {c.votes}</small></>}</span>
              </div>
              <span className="lv-en-track"><b style={{ width: `${c.share === null ? 0 : Math.max(1.5, (c.share / top) * 100)}%`, background: partyColor(parties, c.party) }} /></span>
            </li>
          ))}
          {race.some_withheld && <li className="ui-muted lv-small">Some small counts are combined as withheld.</li>}
        </ol>
      )}

      {race.parties && race.parties.length > 1 && (
        <div className="lv-en-split" data-testid="party-split">
          <span className="lv-en-split-l">{race.seats > 1 ? "Votes cast by party" : "Vote by party"}</span>
          <div className="lv-en-splitbar" role="img" aria-label={race.parties.map((p) => `${p.party || "Independent"} ${p.share}%`).join(", ")}>
            {race.parties.map((p) => <i key={p.party || "ind"} style={{ flexGrow: p.votes, background: partyColor(parties, p.party || null) }} title={`${p.party || "Independent"}: ${p.share}%`} />)}
          </div>
          <ul className="lv-en-legend lv-en-legend-sm">
            {race.parties.map((p) => <li key={p.party || "ind"}><span className="lv-en-dot" style={{ background: partyColor(parties, p.party || null) }} aria-hidden="true" />{p.party || "Independent"} <strong className="mono">{p.share}%</strong></li>)}
          </ul>
        </div>
      )}

      {!race.withheld && <GroupMap race={race} parties={parties} />}
    </Card>
  );
}

const REASONS: Record<string, string> = {
  no_groups: "Members voted with their accounts, so there are no voter groups. Hand out ballot codes by group to see how each group voted.",
  not_enough_groups: "Not enough groups had enough voters to compare safely.",
  small_groups: "At least one group would show a number small enough to reveal how someone voted, so this race isn’t broken down by group.",
};

/** "How each group voted": one tile per group, tinted by its leading party, stronger with a bigger lead. */
function GroupMap({ race, parties }: { race: ElectionRace; parties: string[] }) {
  if (!race.by_group) {
    return race.by_group_reason && race.by_group_reason !== "no_groups" ? <p className="ui-muted lv-small lv-m0" data-testid="group-withheld">{REASONS[race.by_group_reason]}</p> : null;
  }
  const party = (name: string) => race.candidates.find((c) => c.name === name)?.party ?? null;
  return (
    <div className="lv-en-groups" data-testid="group-map">
      <span className="lv-en-split-l">How each group voted</span>
      <div className="lv-en-tiles">
        {race.by_group.map((g) => {
          const lead = [...g.candidates].sort((a, b) => b.votes - a.votes)[0];
          const share = lead?.share ?? 0;
          // Lead strength: a narrow lead is a light tint, a sweep a deeper one (one hue per party, light to dark). Capped
          // so the ink text on the tile keeps its contrast in both themes.
          const strength = Math.round(14 + Math.max(0, Math.min(1, (share - 40) / 60)) * 38);
          const label = g.other ? "Other groups" : g.label ?? "No group";
          return (
            <div key={label} className="lv-en-tile" style={{ "--tint": `color-mix(in oklab, ${partyColor(parties, party(lead?.name ?? ""))} ${strength}%, var(--lv-surface))` } as CSSProperties}
              title={`${label} (${g.voters} voters): ${g.candidates.map((c) => `${c.name} ${c.share}%`).join(", ")}`}>
              <span className="lv-en-tile-l">{label}</span>
              <strong>{lead?.name}</strong>
              <span className="mono">{lead?.share}%</span>
              <small>{g.voters} voters</small>
            </div>
          );
        })}
      </div>
      <table className="lv-en-table">
        <caption className="sr-only">{race.prompt}: share of each group's votes</caption>
        <thead><tr><th scope="col">Group</th>{race.candidates.map((c) => <th key={c.name} scope="col">{c.name}</th>)}</tr></thead>
        <tbody>
          {race.by_group.map((g) => (
            <tr key={g.other ? "other" : g.label ?? "none"}>
              <th scope="row">{g.other ? "Other groups" : g.label ?? "No group"}</th>
              {race.candidates.map((c) => <td key={c.name} className="mono">{g.candidates.find((x) => x.name === c.name)?.share ?? 0}%</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TurnoutByGroup({ d }: { d: ElectionResults }) {
  return (
    <Card className="lv-en-race" data-testid="turnout-groups">
      <Eyebrow>Turnout by group</Eyebrow>
      <ol className="lv-en-cands">
        {d.groups.map((g) => (
          <li key={g.label ?? "none"} title={g.turnout_pct === null ? `${g.label ?? "No group"}: withheld` : `${g.label ?? "No group"}: ${g.voted} of ${g.issued} voted`}>
            <div className="lv-en-cand-head">
              <span className="lv-en-cand-name"><strong>{g.label ?? "No group"}</strong>{g.merged && <span className="ui-muted lv-small">combined with other small groups</span>}</span>
              <span className="mono">{g.turnout_pct === null ? <WithheldTag /> : <>{g.turnout_pct}% <small>· {g.voted} of {g.issued}</small></>}</span>
            </div>
            <span className="lv-en-track"><b style={{ width: `${g.turnout_pct ?? 0}%`, background: "var(--lv-accent)" }} /></span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
