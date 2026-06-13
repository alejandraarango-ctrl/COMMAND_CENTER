"use client";

import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CronCountdown } from "@/components/cron-countdown";

export interface CronRun {
  id: string;
  platform: string;
  job_type: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  posts_processed: number;
  error_message: string | null;
}

// Run status as a token-driven pill so this list speaks the same status
// language as PathwayCard: success → ok (green), failed → warn (red),
// anything else (running/pending) → idle (neutral). Mono + uppercase so it
// reads as a status label, not body text.
function CronStatusBadge({ status }: { status: string }) {
  const config =
    status === "success"
      ? { bg: "var(--pill-ok-bg)", fg: "var(--pill-ok-fg)" }
      : status === "failed"
        ? { bg: "var(--pill-warn-bg)", fg: "var(--pill-warn-fg)" }
        : { bg: "var(--pill-idle-bg)", fg: "var(--pill-idle-fg)" };

  return (
    <Badge
      className="border-transparent font-mono text-[10px] uppercase tracking-[0.12em]"
      style={{ backgroundColor: config.bg, color: config.fg }}
    >
      {status}
    </Badge>
  );
}

/**
 * Countdown + collapsible recent-runs list for a single platform card.
 *
 * Composed inside a <Link> wrapper on the Overview page, so the collapsible
 * trigger must stop click propagation to avoid navigating when toggling.
 */
export function PlatformCronSection({
  platform,
  runs,
}: {
  platform: string;
  runs: CronRun[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      <CronCountdown platform={platform} />

      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger
          onClick={(e) => {
            // The card is wrapped in a Link — prevent navigation on toggle.
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <span>Scheduled to Buffer {runs.length > 0 && `(${runs.length})`}</span>
          {open ? (
            <ChevronDownIcon className="size-4" />
          ) : (
            <ChevronRightIcon className="size-4" />
          )}
        </CollapsibleTrigger>
        <CollapsiblePanel className="pt-3">
          {runs.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No posts scheduled in the last 48h
            </p>
          ) : (
            <ul className="space-y-2 text-xs">
              {runs.map((run) => {
                const duration =
                  run.finished_at && run.started_at
                    ? Math.round(
                        (new Date(run.finished_at).getTime() -
                          new Date(run.started_at).getTime()) /
                          1000
                      )
                    : null;
                return (
                  <li
                    key={run.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1"
                  >
                    {/* Timestamp, duration, and count are figures that
                        change run-to-run — mono + tabular keeps them from
                        jittering as the list updates. */}
                    <span className="font-mono tabular text-white/45">
                      {new Date(run.started_at).toLocaleString()}
                    </span>
                    <CronStatusBadge status={run.status} />
                    <span className="font-mono tabular text-white/45">
                      {duration !== null ? `${duration}s` : "running…"}
                    </span>
                    <span className="font-mono tabular text-white/45">
                      {run.posts_processed} posts
                    </span>
                    {run.error_message && (
                      <span
                        className="w-full truncate"
                        style={{ color: "var(--pill-warn-fg)" }}
                      >
                        {run.error_message}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CollapsiblePanel>
      </Collapsible>
    </div>
  );
}
