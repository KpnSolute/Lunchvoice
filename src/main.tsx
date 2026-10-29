import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { IdentityProvider } from "./identity/IdentityProvider";
import { NotFound, RequireSignIn, Shell, SignIn } from "./pages/Public";
import { Landing } from "./pages/Landing";
import { Me } from "./pages/Me";
import { Pricing, ComingSoon } from "./pages/Pricing";
import { HubHome, HubLayout, Members } from "./pages/Hub";
import { CampaignDetail, Campaigns } from "./pages/Campaigns";
import { Analytics } from "./pages/Analytics";
import "./index.css";

// Static routes outrank the dynamic :hub segment; RESERVED_SLUGS keeps every static path
// from ever being claimable as a Hub address. Hubs are readable signed out (the backend
// decides what a visitor may see), so :hub is not behind a sign-in gate.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <IdentityProvider>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Landing />} />
            <Route path="signin" element={<SignIn />} />
            <Route path="pricing" element={<Pricing />} />
            <Route path="discover" element={<ComingSoon title="Discover" />} />
            <Route path="billing" element={<RequireSignIn><ComingSoon title="Billing" /></RequireSignIn>} />
            <Route path="settings" element={<RequireSignIn><ComingSoon title="Settings" /></RequireSignIn>} />
            <Route path="me" element={<RequireSignIn><Me /></RequireSignIn>} />
            <Route path=":hub" element={<HubLayout />}>
              <Route index element={<HubHome />} />
              <Route path="campaigns" element={<Campaigns />} />
              <Route path="campaigns/:id" element={<CampaignDetail />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="members" element={<Members />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </IdentityProvider>
    </BrowserRouter>
  </StrictMode>
);
