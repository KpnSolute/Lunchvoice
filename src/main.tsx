import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { IdentityProvider } from "./identity/IdentityProvider";
import { RequireSignIn, Shell, SignIn } from "./pages/Public";
import { Landing } from "./pages/Landing";
import { About, Beta, Discover, HowItWorks, NotFoundPage, Privacy, Status, Support, Terms, UseCases } from "./pages/Marketing";
import { CreateHub, Join, Me, RedeemInvite, Settings } from "./pages/Account";
import { Pricing } from "./pages/Pricing";
import { HubBilling, HubDiscover, HubLayout, HubOverview, HubReservation, HubSettings, Invites, Members, Roles } from "./pages/Hub";
import { CampaignDetail, Campaigns, GuestCampaign, NewCampaign, Results, Studio } from "./pages/Campaigns";
import { Analytics } from "./pages/Analytics";
import { Gallery } from "./pages/Gallery";
import "./index.css";
import "./styles/system.css";
import "./styles/landing.css";

// Static routes outrank the dynamic :hub segment, and RESERVED_SLUGS keeps every static path
// from ever being claimable as a Hub address. Hubs are readable signed out; the backend decides
// what a visitor may see.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <IdentityProvider>
        <Routes>
          <Route element={<Shell />}>
            {/* public */}
            <Route index element={<Landing />} />
            <Route path="how-it-works" element={<HowItWorks />} />
            <Route path="use-cases" element={<UseCases />} />
            <Route path="pricing" element={<Pricing />} />
            <Route path="beta" element={<Beta />} />
            <Route path="about" element={<About />} />
            <Route path="status" element={<Status />} />
            <Route path="terms" element={<Terms />} />
            <Route path="privacy" element={<Privacy />} />
            <Route path="support" element={<Support />} />
            <Route path="discover" element={<Discover />} />

            {/* auth and account */}
            <Route path="signin" element={<SignIn />} />
            <Route path="join" element={<Join />} />
            <Route path="j/:code" element={<RedeemInvite />} />
            <Route path="me" element={<RequireSignIn><Me /></RequireSignIn>} />
            <Route path="create" element={<RequireSignIn><CreateHub /></RequireSignIn>} />
            <Route path="settings" element={<RequireSignIn><Settings /></RequireSignIn>} />

            {/* respondents */}
            <Route path="c/:joinCode" element={<GuestCampaign />} />

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

            <Route path="*" element={<NotFoundPage />} />
            {import.meta.env.DEV && <Route path="__gallery" element={<Gallery />} />}
          </Route>
        </Routes>
      </IdentityProvider>
    </BrowserRouter>
  </StrictMode>
);
