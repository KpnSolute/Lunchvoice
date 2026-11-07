import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { IdentityProvider } from "./identity/IdentityProvider";
import { AuthCallback, RequireSignIn, Shell, SignIn } from "./pages/Public";
import { Landing } from "./pages/Landing";
import { About, Beta, Discover, HowItWorks, NotFoundPage, Privacy, Status, Support, Terms, UseCases } from "./pages/Marketing";
import { CreateHub, Join, Me, RedeemInvite, Settings } from "./pages/Account";
import { Pricing } from "./pages/Pricing";
import { HubAddon, HubBilling, HubBuilder, HubDiscover, HubLayout, HubOverview, HubReservation, HubSettings, Invites, Members, Roles } from "./pages/Hub";
import { CampaignDetail, Campaigns, NewCampaign, Results, Studio } from "./pages/Campaigns";
import { GuestCampaign } from "./pages/Player";
import { Analytics } from "./pages/Analytics";
import { Gallery } from "./pages/Gallery";
import { initTheme } from "./ui/theme";
import { Toaster } from "@/components/shadcn/sonner";
import { TooltipProvider } from "@/components/shadcn/tooltip";
import "./ui/fonts.css";
import "./ui/tokens.css";
import "./ui/shadcn.css";
import "./index.css";
import "./ui/ui.css";
import "./styles/system.css";
import "./styles/landing.css";

initTheme();

// Static routes outrank the dynamic :hub segment, and RESERVED_SLUGS keeps every static path
// from ever being claimable as a Hub address. Hubs are readable signed out; the backend decides
// what a visitor may see.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <IdentityProvider>
        <TooltipProvider delayDuration={300}>
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
            <Route path="auth/callback" element={<AuthCallback />} />
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
              <Route path="builder" element={<HubBuilder />} />
              <Route path="shop" element={<HubAddon kind="shop" />} />
              <Route path="leaderboard" element={<HubAddon kind="leaderboard" />} />
              <Route path="news" element={<HubAddon kind="news" />} />
              <Route path="news/:post" element={<HubAddon kind="post" />} />
              <Route path="comments" element={<HubAddon kind="comments" />} />
              <Route path="p/:page" element={<HubAddon kind="page" />} />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
            {import.meta.env.DEV && <Route path="__gallery" element={<Gallery />} />}
          </Route>
        </Routes>
        <Toaster />
        </TooltipProvider>
      </IdentityProvider>
    </BrowserRouter>
  </StrictMode>
);
