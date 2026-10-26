import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { IdentityProvider } from "./identity/IdentityProvider";
import { Landing, NotFound, RequireSignIn, Shell, SignIn } from "./pages/Public";
import { Me } from "./pages/Me";
import { Analytics, CampaignDetail, Campaigns, HubHome, HubLayout } from "./pages/Hub";
import "./index.css";

// Static routes outrank the dynamic :hub segment; RESERVED_SLUGS keeps any
// future static path from ever being claimable as a Hub address.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <IdentityProvider>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Landing />} />
            <Route path="signin" element={<SignIn />} />
            <Route path="me" element={<RequireSignIn><Me /></RequireSignIn>} />
            <Route path=":hub" element={<RequireSignIn><HubLayout /></RequireSignIn>}>
              <Route index element={<HubHome />} />
              <Route path="campaigns" element={<Campaigns />} />
              <Route path="campaigns/:id" element={<CampaignDetail />} />
              <Route path="analytics" element={<Analytics />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </IdentityProvider>
    </BrowserRouter>
  </StrictMode>
);
