# Graph Report - .  (2026-07-02)

## Corpus Check
- Corpus is ~15,996 words - fits in a single context window. You may not need a graph.

## Summary
- 190 nodes · 319 edges · 15 communities (12 shown, 3 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Auth & App Shell|Auth & App Shell]]
- [[_COMMUNITY_Product & Architecture Docs|Product & Architecture Docs]]
- [[_COMMUNITY_NPM Dependencies|NPM Dependencies]]
- [[_COMMUNITY_Menu Data & Student Pages|Menu Data & Student Pages]]
- [[_COMMUNITY_Admin & DB Types|Admin & DB Types]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_UI Components & Surveys|UI Components & Surveys]]
- [[_COMMUNITY_Design System & Branding|Design System & Branding]]
- [[_COMMUNITY_QR Code Generation|QR Code Generation]]
- [[_COMMUNITY_Motion & Rating Widgets|Motion & Rating Widgets]]
- [[_COMMUNITY_Vite Env Types|Vite Env Types]]
- [[_COMMUNITY_Send-Email Edge Function|Send-Email Edge Function]]
- [[_COMMUNITY_Edge Function HTTP Utils|Edge Function HTTP Utils]]

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 17 edges
2. `useAuth()` - 15 edges
3. `supabase` - 15 edges
4. `Icon()` - 10 edges
5. `weekdayFor()` - 7 edges
6. `Home()` - 6 edges
7. `Login()` - 5 edges
8. `scripts` - 4 edges
9. `CYCLE` - 4 edges
10. `slotsForDay()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `Fork Rating Widget` --semantically_similar_to--> `Motion System`  [INFERRED] [semantically similar]
  legacy/index.html → DESIGN.md
- `Staff Sneak Peek Panel` --semantically_similar_to--> `Staff / Admin Users`  [INFERRED] [semantically similar]
  legacy/index.html → PRODUCT.md
- `Google Fonts (Fraunces/Space Grotesk/Space Mono)` --semantically_similar_to--> `Legacy Prototype Page`  [INFERRED] [semantically similar]
  index.html → legacy/index.html
- `Bold-Editorial Visual System` --implements--> `Bold Editorial Food-Zine Brand`  [INFERRED]
  DESIGN.md → PRODUCT.md
- `Serif x Grotesk Typography Pairing` --references--> `Google Fonts (Fraunces/Space Grotesk/Space Mono)`  [INFERRED]
  DESIGN.md → index.html

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Cross-Project Staff Authentication Flow** — readme_staff_login_fn, readme_mjccv1_project, readme_mjccv2_project, product_staff_admin [EXTRACTED 0.90]
- **Student OTP Sign-In and Delivery** — readme_student_email_auth, readme_send_email_fn, readme_mjccv2_project, readme_rls_security [EXTRACTED 0.85]
- **Food-Zine Visual Language** — design_visual_system, design_typography_pairing, design_accent_citrus, product_no_emoji_principle, design_icon_component [INFERRED 0.80]

## Communities (15 total, 3 thin omitted)

### Community 0 - "Auth & App Shell"
Cohesion: 0.12
Nodes (23): AuthCtx, AuthProvider(), Ctx, useAuth(), Layout(), staffLogin(), supabase, Gate() (+15 more)

### Community 1 - "Product & Architecture Docs"
Cohesion: 0.08
Nodes (27): Serif x Grotesk Typography Pairing, Google Fonts (Fraunces/Space Grotesk/Space Mono), Vite App HTML Shell, 28-Day CYCLE Menu Data, Legacy Prototype Page, Staff Sneak Peek Panel, window.storage Persistence, Engagement As Metric (+19 more)

### Community 2 - "NPM Dependencies"
Cohesion: 0.09
Nodes (21): dependencies, qrcode, react, react-dom, react-router-dom, @supabase/supabase-js, devDependencies, @types/qrcode (+13 more)

### Community 3 - "Menu Data & Student Pages"
Cohesion: 0.15
Nodes (15): CYCLE, RATE_CATEGORIES, RATED_DISHES, RatedDish, Slot, slotsForDay(), STAPLES, weekdayFor() (+7 more)

### Community 4 - "Admin & DB Types"
Cohesion: 0.11
Nodes (16): Dashboard(), NEXT, OrdersAdmin(), OrderWithStudent, StoreAdmin(), Orders(), STATUS_LABEL, Database (+8 more)

### Community 5 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+10 more)

### Community 6 - "UI Components & Surveys"
Cohesion: 0.17
Nodes (11): COLORS, Confetti(), Icon(), IconName, paths, adminTabs, studentTabs, RatingRow (+3 more)

### Community 7 - "Design System & Branding"
Cohesion: 0.20
Nodes (10): Electric Citrus Accent, Hero Today Card, Centralized Icon Component (No Emoji), index.css Design Tokens, Light + Dark Theming, OKLCH Color Tokens, Bold-Editorial Visual System, Design Anti-References (+2 more)

### Community 8 - "QR Code Generation"
Cohesion: 0.70
Nodes (3): QRCard(), joinUrl(), qrDataUrl()

### Community 9 - "Motion & Rating Widgets"
Cohesion: 0.67
Nodes (3): Motion System, Fork Rating Widget, Live Ticket Preview

## Knowledge Gaps
- **71 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+66 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `supabase` connect `Auth & App Shell` to `Menu Data & Student Pages`, `Admin & DB Types`, `UI Components & Surveys`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `useAuth()` connect `Auth & App Shell` to `Menu Data & Student Pages`, `UI Components & Surveys`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _77 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Auth & App Shell` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._
- **Should `Product & Architecture Docs` be split into smaller, more focused modules?**
  _Cohesion score 0.07977207977207977 - nodes in this community are weakly interconnected._
- **Should `NPM Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Should `Admin & DB Types` be split into smaller, more focused modules?**
  _Cohesion score 0.11428571428571428 - nodes in this community are weakly interconnected._