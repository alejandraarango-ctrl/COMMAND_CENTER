"use client";

/**
 * CreatorToggle — segmented pill that switches the Command Center home
 * between Alex's and Leila's format sets.
 *
 * Driven by the `?creator=` URL search param so the choice is shareable
 * and survives full-page reloads. The home page (server component) reads
 * the param via its searchParams arg, filters FORMATS, and re-renders;
 * this component just owns the click → navigate handoff.
 *
 * Visual style follows the existing pill pattern used elsewhere on the
 * dashboard: active option is white-on-near-black, inactive is muted on
 * a transparent surface. Matches the zinc tokens in .claude/rules/dashboard.md.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { CREATORS, type CreatorKey } from "@/lib/command-center-config";

interface CreatorToggleProps {
  /** Resolved by the server component from its searchParams. The toggle
   *  trusts this value as the "current" creator (vs. reading the
   *  search param itself) so the active highlight stays consistent
   *  with what the server actually rendered. */
  current: CreatorKey;
}

export function CreatorToggle({ current }: CreatorToggleProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // useTransition lets us mark the navigation as a non-urgent update so
  // React shows a pending state without blocking the click. The visual
  // feedback is subtle (slight opacity on the toggle) — without it,
  // clicking feels unresponsive for the few hundred ms it takes the
  // server to re-render the filtered list.
  const [isPending, startTransition] = useTransition();

  function setCreator(next: CreatorKey) {
    if (next === current) return;
    // Preserve any other existing query params alongside the creator
    // switch (today there are none, but future-proofing is free).
    const params = new URLSearchParams(searchParams?.toString());
    if (next === "alex") {
      params.delete("creator");
    } else {
      params.set("creator", next);
    }
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/?${qs}` : "/");
    });
  }

  return (
    <div
      role="tablist"
      aria-label="Creator"
      className="inline-flex items-center rounded-full border p-1"
      style={{
        opacity: isPending ? 0.7 : 1,
        borderColor: "var(--surface-border)",
        backgroundColor: "#1d1712",
      }}
    >
      {CREATORS.map((c) => {
        const isActive = c.key === current;
        return (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => setCreator(c.key)}
            className="rounded-full px-[22px] py-2 text-[13px] font-semibold transition-colors"
            style={
              isActive
                ? {
                    backgroundColor: "var(--terracotta)",
                    color: "#fff",
                    boxShadow: "0 4px 16px rgba(174,86,48,0.35)",
                  }
                : { color: "rgba(237,234,224,0.58)" }
            }
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
