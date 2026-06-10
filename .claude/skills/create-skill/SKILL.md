---
description: Create a new Claude Code skill (a .claude/skills/<name>/SKILL.md) from scratch or from work just completed. Use when the user says "create a skill", "make a skill for this", "save that as a skill", or "turn this workflow into a skill".
argument-hint: [skill name or task to capture]
---

# Create Skill

Create a well-formed skill that follows Claude Code best practices.

Skills are auto-discovered from `.claude/skills/` and their descriptions load into context automatically. Do NOT create or update any index, catalog, or `CLAUDE.md` pointer — native discovery already handles it, and an index is redundant maintenance.

Skill name or task to capture (if provided): $ARGUMENTS

## 1. Gather the essentials

Ask only what you can't infer from the request or conversation:

- **Trigger** — what should make this skill fire? Collect the literal phrases a user would actually type or say; these become the "Use when…" part of the description.
- **Source** — from scratch, or capture the workflow we just did?
  - *From a completed workflow*: mine THIS conversation for the steps taken, the decisions made and why, and any errors hit and how they were resolved. (This skill runs inline precisely so that history is available — a forked context would lose it.)
- **Invocation** — should Claude be allowed to run it automatically, or only the user? Anything with side effects (deploy, commit, send a message, irreversible writes) → set `disable-model-invocation: true` so Claude can't fire it unprompted.
- **Scope** — personal (`~/.claude/skills/`, all projects) or project (`.claude/skills/`, committed for the team)?

## 2. Pick a name

- The directory name IS the command: `skills/deploy-staging/SKILL.md` → `/deploy-staging`. Use `kebab-case`; verb-first reads well as a command.
- Do NOT add a frontmatter `name:` field — it just duplicates the directory name.

## 3. Write SKILL.md

Create `<scope>/skills/<name>/SKILL.md` with frontmatter + a concise body.

`description` is the one field that matters. Write it as:
`<what it does>. Use when <trigger phrases the user would actually say>.`
Put the key use case first; keep the combined text under ~1,500 characters.

Add optional frontmatter fields only when they earn their place:
- `argument-hint: [..]` — if it takes input (shows during autocomplete)
- `disable-model-invocation: true` — manual-only / side-effecting skills
- `user-invocable: false` — pure background knowledge with no useful `/command`
- `allowed-tools: ..` — pre-approve specific tools so the skill runs without prompts
- `context: fork` (+ optional `agent:`) — ONLY for self-contained tasks that don't need conversation history

Body rules:
- Concise. It stays in context every turn, so state what to do, not why.
- Reference content (conventions/style) reads as standing guidance; task content reads as numbered steps.
- Use `$ARGUMENTS` (or `$0`, `$1`, …) for input.
- Inject live data with `` !`command` `` when the skill needs current state (e.g. `` !`git diff HEAD` ``).
- Keep under 500 lines; move long reference material into sibling files and link them.

Minimal shape:

```
---
description: <what it does>. Use when <trigger phrases>.
---

<Concise instructions. Use $ARGUMENTS for input.>
```

## 4. Verify

- Frontmatter is valid YAML between `---` markers and `description` is present.
- In a fresh session: `What skills are available?` lists it; typing `/name ` shows the argument hint; the trigger phrases match the description so it auto-fires when expected.
- Confirm you did NOT create or edit any index/catalog file.
