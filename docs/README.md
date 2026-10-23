# LunchVoice v2 planning handoff

Updated 2026-10-23. Claude is ready to **continue planning**, beginning with the
backend. This package is an initial plan and evidence base, not implementation
or proof of production readiness.

## Reading order

1. Read root `AGENTS.md`, `CLAUDE.md`, and the newest `CHANGELOG.md` entries.
2. Start at [backend/README.md](backend/README.md).
3. Read the [product specification](v2/PRODUCT_SPEC.md),
   [existing-versus-target comparison](v2/CURRENT_STATE_AUDIT.md), and
   [Definition of Done](v2/DEFINITION_OF_DONE.md).
4. Read the [new architecture](archeture/ARCHITECTURE.md) and
   [resource map](archeture/RESOURCE_MAP.md).
5. Use the [initial plan](v2/IMPLEMENTATION_PLAN.md) and
   [roadmap proposition](backend/ROADMAP_PROPOSITION.md) to develop the dated
   execution roadmap. Coordinate with [frontend/README.md](frontend/README.md).

## Execution-planning deliverables (proposal, 2026-10-23)

Created by Claude's planning pass; all are proposals for founder review, not approved
scope or implementation. Review order: roadmap first.

| Deliverable | Status |
| --- | --- |
| [backend/EXECUTION_ROADMAP.md](backend/EXECUTION_ROADMAP.md) | Drafted: dated items R-01..R-25, critical path, three scope options, decision tracker |
| [backend/DATA_AND_MIGRATION_PLAN.md](backend/DATA_AND_MIGRATION_PLAN.md) | Drafted |
| [backend/API_AND_AUTHORIZATION_CONTRACTS.md](backend/API_AND_AUTHORIZATION_CONTRACTS.md) | Drafted |
| [backend/CAMPAIGN_AND_ENTITLEMENT_PLAN.md](backend/CAMPAIGN_AND_ENTITLEMENT_PLAN.md) | Drafted |
| [backend/PRIVACY_AND_OPERATIONS_PLAN.md](backend/PRIVACY_AND_OPERATIONS_PLAN.md) | Drafted |
| [frontend/EXPERIENCE_PLAN.md](frontend/EXPERIENCE_PLAN.md) | Drafted; design artifacts **Pending** (designer's handoff not delivered) |

## Documentation structure

```text
docs/
  README.md
  backend/
    README.md                 # Claude starts here
    ROADMAP_PROPOSITION.md    # October 23-December 11 roadmap request
    EXECUTION_ROADMAP.md      # Dated roadmap, options, decisions (proposal)
    DATA_AND_MIGRATION_PLAN.md
    API_AND_AUTHORIZATION_CONTRACTS.md
    CAMPAIGN_AND_ENTITLEMENT_PLAN.md
    PRIVACY_AND_OPERATIONS_PLAN.md
  frontend/
    README.md                 # UI workstreams and backend contracts
    EXPERIENCE_PLAN.md        # Flow inventory, states, evidence (proposal)
  archeture/
    README.md
    ARCHITECTURE.md           # Canonical target design and research
    RESOURCE_MAP.md           # Existing/required resources and verification
  v2/
    PRODUCT_SPEC.md
    CURRENT_STATE_AUDIT.md
    IMPLEMENTATION_PLAN.md
    DEFINITION_OF_DONE.md
    ARCHITECTURE.md           # Compatibility pointer
```

Use `backend/` for data/auth/API/policy/migration and operational plans;
`frontend/` for UI/component/accessibility plans; `archeture/` for cross-system
design and resources. The folder spelling follows the founder's requested layout.
Keep confirmed product decisions in the v2 spec; link instead of duplicating rules.

## Dates and authority

The roadmap was requested for **October 23 through December 11, 2026** and now covers
**October 23 through December 23, 2026** (America/New_York). Per the founder's relayed
update (2026-10-23): **December 11** is the MJCC Hub and **MJCC Hub Winter Survey 2026**
launch (first operational v2 beta, M1); **December 23** is the v2 main public release (M2);
the readiness go/no-go is recommended for **December 9**, with **December 10** for final
checks. The survey's opening **date** is confirmed; its opening time and timezone, closing,
operator, questionnaire, audience and anonymity requirement remain open (D-12).
December 13 is superseded. Each launch needs separate production authorization. See
[backend/EXECUTION_ROADMAP.md](backend/EXECUTION_ROADMAP.md).

These documents request Claude's next work. They do not claim that a Claude
session has been contacted, started, or has accepted the assignment.
