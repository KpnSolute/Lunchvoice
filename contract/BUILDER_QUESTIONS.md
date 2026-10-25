# Hub Builder and pages: questions for D-11

**Status: questions only. Engineering has chosen no page format, no block set and no publishing behaviour.** The visual Builder continues on mock data.
`lv_page_list`, `lv_page_save_draft`, `lv_page_publish` and `lv_branding_update` stay `proposed`; their `content` field is deliberately untyped in the contract.

## What is already confirmed
- Starter allows 3 custom pages; Team's page allocation is undecided (the limit is `null`, never unlimited).
- Separate capabilities exist for editing (`structure.pages.edit`), publishing (`structure.pages.publish`) and choosing who can see a page (`structure.pages.audience`).
- Page URLs sit under the Hub address (`lunchvoice.com/{hubSlug}/...`).

## Questions to answer before engineering builds storage
1. **Content format.** A structured block list (JSON), a restricted Markdown, or rich text? Whichever is chosen must be sanitised on the server; which is acceptable to review and migrate?
2. **Blocks.** Which blocks exist at launch (heading, paragraph, image, link, button, list, divider, Campaign card, results card, member count)? Which are explicitly out (raw HTML, scripts, iframes, embeds)?
3. **Media.** May Owners upload images? Size and type limits, hosting, scanning, and who is responsible for rights.
4. **Draft and publish.** One draft plus one published copy, or full version history? Can publishing be scheduled? Can a published page be rolled back, and how many versions are kept?
5. **Permissions.** Confirm view/edit/publish/audience stay separate capabilities. May an editor see unpublished drafts of others? May a publisher publish a page they did not edit?
6. **Audience.** Public, members only, or specific roles? What does a non-member see for a members-only page (404, a gate, a teaser)? How does this relate to the Hub's visibility and join mode (kept separate)?
7. **Slots.** What counts toward the 3-page limit (drafts, unpublished, system pages such as the home page)? What happens to extra pages if a plan lapses?
8. **Navigation and ordering.** Is navigation a separate structure from pages (capability `structure.navigation.edit`)? Maximum depth and items?
9. **Branding.** Is `structure.branding.edit` limited to a colour and logo, with a contrast check? Who approves logos?
10. **Moderation and abuse.** Is page content reviewed before it is public? Reporting channel for harmful content?
11. **Retention and export.** What happens to pages when a Hub is deleted or its slug released (slug reuse must never transfer private content)?
12. **Accessibility and localisation.** Required checks (contrast, alt text) and languages at launch.

## Suggested next step
Review these with the design manager's Builder prototype; record the answers in the decision register as D-11; then engineering proposes a schema and operation set for review, with the
same pattern as the rest of the backend (additive migration, server-side permission checks, tested allow/deny, rollback).
