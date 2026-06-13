/*
 * CategorySection — a populated category. Renders the category band
 * (small colored rail + label + count) above a responsive grid of
 * FormatCards.
 *
 * Grid: `repeat(auto-fill, minmax(300px, 1fr))` with a 14px gap — the
 * exact layout of the refined-terracotta mock. The 300px floor against
 * the 1100px max-width container yields three tracks before wrapping.
 * `auto-fill` (not `auto-fit`) keeps a lone card left-aligned at ~300px
 * instead of stretching across the row — see the Mid section's single
 * Scheduling card.
 *
 * Note: the data model still carries an optional `subgroup` field on
 * formats (Creation/Distribution), but the section no longer renders
 * sub-headers for it — every category is a single flat grid to match the
 * mock. The field is left in place rather than removed prematurely.
 */
import { FormatCard } from "./format-card";
import {
  type Format,
  type FormatHealth,
} from "@/lib/command-center-config";

interface CategorySectionProps {
  label: string;
  color: string;
  formats: Format[];
  // Per-format health, resolved on the home page. We accept a Map
  // (vs. embedding health on Format) so the config stays purely static
  // and Supabase reads stay confined to the page component.
  healthMap: Map<string, FormatHealth>;
}

// Defensive default — if a format somehow doesn't appear in the map
// (e.g. a new format was added but the home page wasn't re-rendered),
// show it as paused rather than crashing. Same rationale as
// getFormatHealth's "no platforms" fallback.
const DEFAULT_HEALTH: FormatHealth = "paused";

export function CategorySection({
  label,
  color,
  formats,
  healthMap,
}: CategorySectionProps) {
  const count = formats.length;

  return (
    <section>
      <div className="mb-5 flex items-center gap-3.5">
        {/* Category label in its identity color, followed by an animated
            sweep rule (.cc-rule) tinted to the same color — signals the
            section is live without a heavy header. */}
        <span
          className="text-[13px] font-bold uppercase tracking-[0.2em]"
          style={{ color }}
        >
          {label}
        </span>
        <span
          className="cc-rule"
          style={{ ["--rule-color" as never]: color } as React.CSSProperties}
          aria-hidden
        />
        <span className="font-mono text-[11px] tracking-[0.08em] text-white/40">
          {count} {count === 1 ? "format" : "formats"}
        </span>
      </div>

      {/* One flat responsive grid per category — matches the mock. The
          Creation/Distribution subgroup sub-headers were removed so SHORT
          reads as a single grid like every other category. `auto-fill`
          with a 300px floor keeps a lone card (e.g. Mid → Scheduling)
          left-aligned at its natural width rather than stretching across
          the row. */}
      <div
        className="grid"
        style={{
          gap: "14px",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
        }}
      >
        {formats.map((f) => (
          <FormatCard
            key={f.id}
            format={f}
            color={color}
            health={healthMap.get(f.id) ?? DEFAULT_HEALTH}
          />
        ))}
      </div>
    </section>
  );
}
