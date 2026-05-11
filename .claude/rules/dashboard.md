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

## Design tokens

Dark theme using Tailwind's zinc scale with blue-500 as the sole accent color.

- **Background**: `#09090b` (near-black)
- **Card backgrounds**: `#111113` or `#0a0a0c`
- **Card borders**: `#1f1f23`
- **Primary text**: `#fafafa` (off-white)
- **Secondary/muted text**: `#a1a1aa` (zinc-400)
- **Placeholder text**: `#52525b` (zinc-600)
- **Input backgrounds**: `#18181b` (zinc-900)
- **Input borders**: `#27272a` (zinc-800)
- **Primary accent** (buttons, links, selected radio): `#3b82f6` (blue-500)
- **Accent hover**: `#2563eb` (blue-600)
- **Success green**: `#22c55e` (green-500)
- **Badge/pill backgrounds**: `#27272a` with `#a1a1aa` text
- **Selected pill/chip**: `#fafafa` bg with `#09090b` text (inverted)
- **Unselected pill/chip**: `#27272a` bg with `#fafafa` text
- **CTA filled button**: `#fafafa` bg with `#09090b` text
- **CTA outline/ghost button**: transparent with `#fafafa` text and subtle border
