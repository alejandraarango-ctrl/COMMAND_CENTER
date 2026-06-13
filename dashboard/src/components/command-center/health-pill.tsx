/*
 * Health pill — small status indicator rendered on every FormatCard.
 *
 * Sizing is intentionally tight (10px text, 5px dot, 2px vertical
 * padding) so the pill doesn't compete with the format name for
 * attention in the card header.
 *
 * All three states share one shape (mono uppercase pill + 7px dot),
 * differing only by the --pill-* color token, matching the
 * refined-terracotta mock: healthy → green, failing → red, paused →
 * neutral/dim.
 */
import type { FormatHealth } from "@/lib/command-center-config";

interface HealthPillProps {
  status: FormatHealth;
}

export function HealthPill({ status }: HealthPillProps) {
  // Mono uppercase pill with a tinted status background + a static 7px dot
  // — matched 1-to-1 to the refined-terracotta mock's `.pill`. Colors come
  // from the --pill-* tokens in globals.css.
  const base =
    "inline-flex items-center gap-[7px] rounded-full px-[11px] py-[5px] font-mono text-[10px] uppercase tracking-[0.12em]";

  if (status === "healthy") {
    return (
      <span
        className={base}
        style={{ backgroundColor: "var(--pill-ok-bg)", color: "var(--pill-ok-fg)" }}
      >
        <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-current" />
        Healthy
      </span>
    );
  }

  if (status === "failing") {
    return (
      <span
        className={base}
        style={{ backgroundColor: "var(--pill-warn-bg)", color: "var(--pill-warn-fg)" }}
      >
        <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-current" />
        Failing
      </span>
    );
  }

  return (
    <span
      className={base}
      style={{ backgroundColor: "var(--pill-idle-bg)", color: "var(--pill-idle-fg)" }}
    >
      <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-current" />
      Paused
    </span>
  );
}
