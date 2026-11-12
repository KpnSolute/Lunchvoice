// Party colours for election results (000038). Assigned in a FIXED order by the order parties first appear on the
// ballot (lv_election_parties), so a party keeps its colour in every race and filters never repaint it. Validated with
// the dataviz palette checks (adjacent CVD separation, normal-vision floor, contrast) in light AND dark mode; the
// order blue, red, violet, green, magenta, yellow, aqua, orange is the one that passes both. Party names are always
// written next to the colour, so identity is never colour alone. Independent candidates use the neutral token.
export const PARTY_SLOTS = 8;

/** CSS variable for a party's colour, or the neutral token for independents/unknown. */
export function partyColor(parties: string[], party: string | null | undefined): string {
  const i = party ? parties.indexOf(party) : -1;
  return i >= 0 && i < PARTY_SLOTS ? `var(--lv-party-${i + 1})` : "var(--lv-party-none)";
}
