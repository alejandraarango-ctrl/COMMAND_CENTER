---
paths:
  - "dashboard/**/*"
---

# Dashboard rules

Frontend rules for the Next.js dashboard. Load only when editing files under `dashboard/`.

## Component conventions

- Use **server components by default**. Only add `"use client"` when you need hooks, event handlers, or browser APIs.
- Use **named exports** for components: `export function PostCard() {}` (not `export default`).
- Use `@/` path alias for imports: `import { PostCard } from "@/components/post-card"`.
- Use **shadcn/ui** for common UI elements — don't rebuild buttons, dialogs, inputs, etc.
- Colocate component files near where they're used when possible.

## Design tokens — "Refined Terracotta" (v2)

Warm dark theme. **Always consume the CSS variables / utility classes defined
in `dashboard/src/app/globals.css` — do not hard-code hex + alpha values inline.**
That inline-drift is exactly what let the look fragment before this redesign.
(Historical note: an earlier zinc + blue-500 scheme has been fully retired.)

### Surfaces & color

- **Page background**: leave transparent. A global `.app-atmosphere` element
  (warm terracotta radial + film grain, rendered once in `layout.tsx`) shows
  through every route. Never paint an opaque page background over it.
- **Base background**: `--background` `#18130f` (warm near-black).
- **Panels / inputs**: `--surface-bg` `#1d1712`.
- **Cards**: the shadcn `<Card>` (already a top-lit gradient surface) or the
  `.cc-surface` class. Add `.cc-surface--interactive` + inline `--accent-rail`
  for a hover-lift card with a colored left rail.
- **Raised / hover / popover**: `--surface-raised` `#2a221d`.
- **Borders**: `--surface-border` (hairline) / `--surface-border-hi` (emphasis).
- **Primary text**: `--foreground` `#edeae0`. **Muted**: `text-white/55`.
  **Faint**: `text-white/40`.
- **Accent (terracotta)**: `--terracotta` `#ae5630`, hover `--terracotta-hover`
  `#c4683f`, soft wash `--terracotta-soft`, glow `--glow-terra`.
- **Status pills**: `--pill-ok-bg`/`--pill-ok-fg` (green), `--pill-warn-bg`/
  `--pill-warn-fg` (red), `--pill-idle-bg`/`--pill-idle-fg` (neutral/paused).
- **Lift shadow**: `--shadow-lift` (hover). **Radius**: cards `rounded-xl`,
  pills `rounded-full`.
- **Command Center category identity colors** (kept distinct from the terracotta
  accent on purpose): short `#16B68A`, written `#A8A39A`, long `#E5562C`, mid
  `#7B6FE8` — see `lib/command-center-config.ts`. Use these as `--accent-rail` /
  `--rule-color` where a surface maps to a category.

### Utility classes (globals.css)

- `.cc-surface` / `.cc-surface--interactive` (+ `--accent-rail`) — card surface.
- `.cc-eyebrow` — mono uppercase tracked label that sits above a page title.
- `.cc-rule` (+ `--rule-color`) — animated section-divider line.
- `.cc-pip` / `.cc-pip--live` (+ `--pip-color`) — status dot (live variant pings).
- `.cc-reveal` (+ inline `animation-delay`) — staggered entrance for page blocks.

### Typography

- Fonts: **DM Sans** (`font-sans`, weights 400–700) for UI + display; **JetBrains
  Mono** (`font-mono`) for labels, counts, IDs, timestamps, status text.
- **Page title**: `text-[40px]`–`[44px]` `font-semibold` `tracking-[-0.025em]`,
  optional terracotta period. Put a `.cc-eyebrow` line above it.
- **Section heading**: `text-[13px] font-semibold uppercase tracking-[0.18em]`,
  often followed by a `.cc-rule`.
- Add the `tabular` class to numerals that update (counts, dates, progress).
- Inline CSS-var styles in TSX use: `style={{ ["--accent-rail" as never]: c } as React.CSSProperties}`.

### CTAs

- Filled CTA: shadcn `<Button>` default variant (terracotta, soft glow, hover
  `--terracotta-hover`). Outline/ghost: `<Button variant="outline|ghost">`.
