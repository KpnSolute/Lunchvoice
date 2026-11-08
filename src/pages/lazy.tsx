import { lazy, Suspense, type ComponentType } from "react";
import { LoadingRows } from "@/components/shadcn/blocks";

// Route-split chunks: the Hub workspace and the Quick Survey Studio/results load on demand, so the public pages and
// the respondent player stay light. Each `pick` shares its module's chunk.
function pick<M, K extends keyof M>(load: () => Promise<M>, name: K) {
  const C = lazy(() => load().then((m) => ({ default: m[name] as unknown as ComponentType<Record<string, unknown>> })));
  return function Lazy(props: Record<string, unknown>) {
    return (
      <Suspense fallback={<div className="ui-page"><LoadingRows rows={3} /></div>}>
        <C {...props} />
      </Suspense>
    );
  };
}

const hub = () => import("./Hub");
const campaigns = () => import("./Campaigns");
const analytics = () => import("./Analytics");
const surveys = () => import("./Surveys");

export const HubLayout = pick(hub, "HubLayout");
export const HubOverview = pick(hub, "HubOverview");
export const Members = pick(hub, "Members");
export const Invites = pick(hub, "Invites");
export const Roles = pick(hub, "Roles");
export const HubSettings = pick(hub, "HubSettings");
export const HubBilling = pick(hub, "HubBilling");
export const HubReservation = pick(hub, "HubReservation");
export const HubDiscover = pick(hub, "HubDiscover");
export const HubBuilder = pick(hub, "HubBuilder");
export const HubAddon = pick(hub, "HubAddon") as (p: { kind: "shop" | "leaderboard" | "news" | "post" | "comments" | "page" }) => JSX.Element;
export const Campaigns = pick(campaigns, "Campaigns");
export const NewCampaign = pick(campaigns, "NewCampaign");
export const CampaignDetail = pick(campaigns, "CampaignDetail");
export const Studio = pick(campaigns, "Studio");
export const Results = pick(campaigns, "Results");
export const Analytics = pick(analytics, "Analytics");
export const SurveyList = pick(surveys, "SurveyList");
export const NewSurvey = pick(surveys, "NewSurvey");
export const SurveyStudio = pick(surveys, "SurveyStudio");
export const SurveyResults = pick(surveys, "SurveyResults");
export const SurveyInvite = pick(surveys, "SurveyInvite");
/* ---- track C: community ---- */
export const DiscoverDirectory = pick(() => import("./Community"), "DiscoverDirectory");
/* ---- end track C ---- */
