# Agent workflow: the native design skills

How Claude Code and Codex find and use LunchVoice's design skills, how to keep them in sync, and how they were
verified.

## The three skills

| Skill | Use it when | Invoke explicitly |
| --- | --- | --- |
| `design-system` | Any change to UI a person sees, however small | Claude Code `/design-system`; Codex `$design-system` |
| `frontend-design` | A new screen or flow, or a significant polish of one | `/frontend-design`; `$frontend-design` |
| `design-element-authoring` | A genuinely new reusable component or design standard (token, rule, pattern) | `/design-element-authoring`; `$design-element-authoring` |

Both agents also pick them **automatically**: each skill's `description` says when it applies, and the agents load
the matching skill without being told. Backend, SQL, Edge Function and infrastructure tasks do not match the
descriptions, so they do not load frontend guidance. In Codex, `/skills` lists them; in Claude Code, `/skills`.

## Where they live

```
.agents/skills/<name>/SKILL.md     canonical (the open Agent Skills location Codex scans, from the working
                                   directory up to the repository root)
.claude/skills/<name>/SKILL.md     mirror (the project location Claude Code scans, likewise up to the root)
docs/frontend/design-system/       the shared guidance every skill points to
```

Each `SKILL.md` is a thin entry point: YAML frontmatter (`name`, `description`, and `license` for the adapted skill)
and short instructions that send the agent to the shared docs. The two copies are byte for byte identical; symlinks are
avoided because Git on Windows does not check them out as links by default. `.gitattributes` pins LF line endings
for both folders so the copies stay identical on Windows.

`frontend-design` is adapted from Anthropic's Apache-2.0 `frontend-design` skill; `NOTICE.md` and `LICENSE.txt` in
its folder carry the attribution and licence.

## Maintaining them

Edit only `.agents/skills/`, then copy and check (works the same in Windows PowerShell, macOS and Linux):

```
npm run skills:sync      # copy .agents/skills to .claude/skills, then validate
npm run check:design     # validate skills and the gallery (part of npm run test:pr)
npm run skills:verify    # ask the installed claude and codex CLIs what they discover (manual)
```

`npm run check:design` fails when:
- a required skill is missing, or exists for one agent only;
- the two copies differ in any byte or file;
- frontmatter is missing, not on line 1, unquoted where YAML would misread it, or uses an unsupported key;
- `name` does not match the folder or is not lowercase-hyphenated (64 characters at most);
- `description` is missing, shorter than 80 or longer than 1024 characters, or does not say when to use the skill;
- the instructions are a placeholder or longer than 500 lines;
- a skill points to a repository path or supporting file that does not exist;
- the adapted skill loses its licence or notice;
- a reusable component is not shown at `/__gallery` (`scripts/check-gallery.mjs`; exemptions need a reason).

To add a skill: create `.agents/skills/<name>/SKILL.md`, run `npm run skills:sync`, and add the name to `REQUIRED`
in `scripts/skills.mjs` if every agent must have it.

## Verification record (2026-11-12)

Run in a disposable Git worktree of this branch, with read-only tools; no files changed.

**Claude Code 2.1.322.** Discovery: the session init event lists `design-system`, `frontend-design` and
`design-element-authoring` inside the repository (48 skills), and none of them in an empty repository (45).
Scenarios, with prompts that did not name any skill:

| Scenario | Skill the agent chose itself | What it did |
| --- | --- | --- |
| A. New Hub dashboard card | `design-system` | Read the component map, `tokens.css`, the blocks and `Hub.tsx`; reused `RowList`, `RowItem`, `SectionTitle`, `PhaseBadge` and `StatTile` with `--lv-*` tokens; planned the gallery entry and `check:design` |
| B. Campaign progress indicator | `design-element-authoring` | Checked `Progress`, `QuotaMeter`, `StatTile` and `RowItem` first; specified a component with the standard template, tokens, states and tests |
| C. Semantic warning token | `design-element-authoring` | Read `DESIGN_EXTENSIONS.md` and `tokens.css`; wrote a full proposal (problem, existing tokens, values per theme, contrast, affected components, migration) and stopped for founder approval without editing `tokens.css` |

Scenario C also found a real issue, recorded for the founder: the `warn` notice is built on `--lv-accent`, which
`.lv-hubscope` replaces with the Hub's colour, so warnings inside a Hub take the customer's colour.

**Codex CLI 0.167.2.** Discovery: `codex debug prompt-input` (no login, no model call) renders the model-visible
prompt with all three skills under `<skills_instructions>`, resolved from this repository's `.agents/skills`, and the
Frontend Design Protocol from `AGENTS.md`. An empty repository lists none of them.

**Not verified:** Codex running the three scenarios as a live agent. That needs an OpenAI login, which was not available
in this environment. Run `codex` in the repository and repeat scenarios A to C to complete it. Both agents receive
identical skill files and the same shared docs, so they are given the same decisions; whether Codex makes them the same
way has not been observed.
