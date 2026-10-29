import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { IdentityProvider } from "./identity/IdentityProvider";
import { Loading, ThemeProvider, ToastProvider } from "./ui";
import { AccountShell, PublicShell, RequireSignIn } from "./pages/Shell";
import { Landing } from "./pages/Landing";
import { About, Beta, Discover, HowItWorks, LegalPage, NotFoundPage, Status, Support, UseCases } from "./pages/Marketing";
import { CreateHub, Join, Me, RedeemInvite, Settings, SignIn } from "./pages/Account";
import { Pricing } from "./pages/Pricing";

// The workspace, the charts and the respondent player are split out: a visitor
// reading the landing page never downloads the builder.
const HubLayout = lazy(() => import("./pages/Hub").then((m) => ({ default: m.HubLayout })));
const HubOverview = lazy(() => import("./pages/Hub").then((m) => ({ default: m.HubOverview })));
const Members = lazy(() => import("./pages/Hub").then((m) => ({ default: m.Members })));
const Invites = lazy(() => import("./pages/Hub").then((m) => ({ default: m.Invites })));
const Roles = lazy(() => import("./pages/Hub").then((m) => ({ default: m.Roles })));
const HubSettings = lazy(() => import("./pages/Hub").then((m) => ({ default: m.HubSettings })));
const HubBilling = lazy(() => import("./pages/Hub").then((m) => ({ default: m.HubBilling })));
const HubReservation = lazy(() => import("./pages/Hub").then((m) => ({ default: m.HubReservation })));
const HubDiscover = lazy(() => import("./pages/Hub").then((m) => ({ default: m.HubDiscover })));
const Campaigns = lazy(() => import("./pages/Campaigns").then((m) => ({ default: m.Campaigns })));
const NewCampaign = lazy(() => import("./pages/Campaigns").then((m) => ({ default: m.NewCampaign })));
const CampaignDetail = lazy(() => import("./pages/Campaigns").then((m) => ({ default: m.CampaignDetail })));
const Studio = lazy(() => import("./pages/Campaigns").then((m) => ({ default: m.Studio })));
const Results = lazy(() => import("./pages/Campaigns").then((m) => ({ default: m.Results })));
const Analytics = lazy(() => import("./pages/Analytics").then((m) => ({ default: m.Analytics })));
const Player = lazy(() => import("./pages/Player").then((m) => ({ default: m.Player })));
const Gallery = lazy(() => import("./pages/Gallery").then((m) => ({ default: m.Gallery })));

const Wrap = ({ children }: { children: React.ReactNode }) => <div className="wrap page">{children}</div>;

// Static paths outrank the :hub segment, and RESERVED_SLUGS keeps any static path
// from being claimable as a Hub address. A Hub is readable signed out; the backend
// decides what a visitor may see, and a private Hub answers exactly like a missing one.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <IdentityProvider>
            <Suspense
              fallback={
                <Wrap>
                  <Loading rows={4} label="Loading" />
                </Wrap>
              }
            >
              <Routes>
                {/* public site */}
                <Route element={<PublicShell />}>
                  <Route index element={<Landing />} />
                  <Route path="how-it-works" element={<HowItWorks />} />
                  <Route path="use-cases" element={<UseCases />} />
                  <Route path="pricing" element={<Pricing />} />
                  <Route path="beta" element={<Beta />} />
                  <Route path="about" element={<About />} />
                  <Route path="status" element={<Status />} />
                  <Route path="terms" element={<LegalPage kind="terms" />} />
                  <Route path="privacy" element={<LegalPage kind="privacy" />} />
                  <Route path="support" element={<Support />} />
                  <Route path="discover" element={<Discover />} />
                  <Route path="join" element={<Join />} />
                  <Route path="j/:code" element={<RedeemInvite />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>

                {/* account */}
                <Route element={<AccountShell />}>
                  <Route
                    path="signin"
                    element={<SignIn />}
                  />
                  <Route
                    path="me"
                    element={
                      <RequireSignIn>
                        <Me />
                      </RequireSignIn>
                    }
                  />
                  <Route
                    path="create"
                    element={
                      <RequireSignIn>
                        <CreateHub />
                      </RequireSignIn>
                    }
                  />
                  <Route
                    path="settings"
                    element={
                      <RequireSignIn>
                        <Settings />
                      </RequireSignIn>
                    }
                  />
                </Route>

                {/* a Hub and everything under it */}
                <Route path=":hub" element={<HubLayout />}>
                  <Route index element={<HubOverview />} />
                  <Route path="campaigns" element={<Campaigns />} />
                  <Route path="campaigns/new" element={<NewCampaign />} />
                  <Route path="campaigns/:id" element={<CampaignDetail />} />
                  <Route path="campaigns/:id/studio" element={<Studio />} />
                  <Route path="campaigns/:id/results" element={<Results />} />
                  <Route path="analytics" element={<Analytics />} />
                  <Route path="members" element={<Members />} />
                  <Route path="invites" element={<Invites />} />
                  <Route path="roles" element={<Roles />} />
                  <Route path="settings" element={<HubSettings />} />
                  <Route path="billing" element={<HubBilling />} />
                  <Route path="reservation" element={<HubReservation />} />
                  <Route path="discover" element={<HubDiscover />} />
                </Route>

                {/* respondent player: no Hub chrome, no signature */}
                <Route path="c/:joinCode" element={<Player />} />

                {import.meta.env.DEV && <Route path="__gallery" element={<Gallery />} />}
              </Routes>
            </Suspense>
          </IdentityProvider>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
);
