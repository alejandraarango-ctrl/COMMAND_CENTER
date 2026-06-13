"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  PlayIcon,
  LoaderIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "lucide-react";

export interface PathwayAction {
  url: string;
  body?: unknown;
}

export interface PathwayLastRun {
  status: "success" | "failed" | "running";
  startedAt: string;
  /** posts_processed from the cron_runs row that drives this pathway's
   *  final phase (e.g. buffer_send, content_apify). Renders inline next
   *  to the "Last run" timestamp so the operator can see "did the last
   *  run actually produce anything?" at a glance. null means we don't
   *  have a count to show — render is suppressed. */
  count?: number | null;
}

export interface PathwayCardProps {
  // Optional — when this card is the *only* pathway on its page (e.g. the
  // Command Center filtered view), the "Pathway 1" badge is redundant and
  // we omit it. Pages that show multiple pathways still pass a number so
  // operators can refer to them ordinally.
  number?: number;
  title: string;
  steps: string[];
  actions: PathwayAction[];
  lastRun?: PathwayLastRun | null;
}

type RunStatus = "idle" | "running" | "success" | "error";

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface ActionOutcome {
  /** Last action's full stdout+stderr, when the underlying API returned one
   *  (currently /api/cron/run does — others may not). Available in both the
   *  success and failure branches so the operator can see env-diag, phase
   *  progress, etc., not just the bottom error line. */
  output: string | null;
}

async function runActions(actions: PathwayAction[]): Promise<ActionOutcome> {
  let lastOutput: string | null = null;
  for (const action of actions) {
    const res = await fetch(action.url, {
      method: "POST",
      headers: action.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: action.body !== undefined ? JSON.stringify(action.body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      status?: string;
      output?: string;
    };
    lastOutput = data.output ?? null;
    if (!res.ok) {
      throw new ActionError(
        data.error || `Request failed (${res.status}) at ${action.url}`,
        lastOutput,
      );
    }
    // /api/cron/run returns 200 with { status: "failed" } on Python exit(1)
    if (data.status === "failed") {
      throw new ActionError(
        data.error || `Cron job failed at ${action.url}`,
        lastOutput,
      );
    }
  }
  return { output: lastOutput };
}

class ActionError extends Error {
  constructor(message: string, public readonly output: string | null) {
    super(message);
    this.name = "ActionError";
  }
}

// Status pill — the one place run status gets its color. Maps the three
// cron states onto the shared pill tokens so this card speaks the same
// status language as the rest of the dashboard:
//   success → --pill-ok (green)   failed → --pill-warn (red)
//   running → --pill-idle, plus a live .cc-pip ping to read as "in flight".
// The pill itself carries the dot; we set --pip-color to the pill's fg so
// the ping matches the label color.
function StatusPill({ status }: { status: PathwayLastRun["status"] }) {
  const config =
    status === "success"
      ? { label: "Success", bg: "var(--pill-ok-bg)", fg: "var(--pill-ok-fg)", live: false }
      : status === "failed"
        ? { label: "Failed", bg: "var(--pill-warn-bg)", fg: "var(--pill-warn-fg)", live: false }
        : { label: "Running", bg: "var(--pill-idle-bg)", fg: "var(--pill-idle-fg)", live: true };

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em]"
      style={{ backgroundColor: config.bg, color: config.fg }}
    >
      <span
        className={`cc-pip ${config.live ? "cc-pip--live" : ""}`}
        style={{ ["--pip-color" as never]: config.fg } as React.CSSProperties}
        aria-hidden
      />
      {config.label}
    </span>
  );
}

function LastRunLine({ lastRun }: { lastRun: PathwayLastRun }) {
  const relative = formatTimeAgo(lastRun.startedAt);

  // Append "· N posts" when we have a count from the underlying cron_run.
  // Use singular "post" for 1, plural "posts" otherwise — small detail but
  // the page reads weird without it. Count is mono + tabular since it's a
  // figure that changes between runs.
  const countNode =
    typeof lastRun.count === "number" ? (
      <>
        <span className="text-white/30">·</span>
        <span className="font-mono tabular text-white/55">
          {lastRun.count} {lastRun.count === 1 ? "post" : "posts"}
        </span>
      </>
    ) : null;

  // Timestamps are mono + tabular so digits don't jitter. The verb differs
  // for the running state ("since") vs. terminal states ("Last run").
  return (
    <div className="flex items-center gap-2 text-xs text-white/55">
      <StatusPill status={lastRun.status} />
      <span className="font-mono tabular text-white/45">
        {lastRun.status === "running" ? `since ${relative}` : `Last run · ${relative}`}
      </span>
      {lastRun.status !== "running" && countNode}
    </div>
  );
}

export function PathwayCard({
  number,
  title,
  steps,
  actions,
  lastRun,
}: PathwayCardProps) {
  const router = useRouter();
  const [status, setStatus] = useState<RunStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const [outputExpanded, setOutputExpanded] = useState(false);

  async function handleRun() {
    setStatus("running");
    setMessage(null);
    setOutput(null);
    setOutputExpanded(false);
    try {
      const outcome = await runActions(actions);
      setStatus("success");
      setMessage("Pathway completed");
      setOutput(outcome.output);
    } catch (err) {
      setStatus("error");
      setMessage((err as Error).message);
      // Auto-expand on failure so the operator immediately sees env-diag /
      // phase logs / Python tracebacks without an extra click.
      if (err instanceof ActionError) {
        setOutput(err.output);
        setOutputExpanded(true);
      }
    } finally {
      router.refresh();
    }
  }

  const running = status === "running";
  const hasOutput = output !== null && output.length > 0;

  return (
    <Card className="mb-4">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Ordinal badge only renders when the page is showing more than
                one pathway. See PathwayCardProps.number for rationale. */}
            {number !== undefined && (
              <Badge className="border-white/10 bg-white/[0.08] font-mono text-[11px] tracking-[0.1em] text-white/80">
                Pathway {number}
              </Badge>
            )}
            <CardTitle className="text-sm">{title}</CardTitle>
          </div>
          <Button onClick={handleRun} disabled={running} size="sm">
            {running ? (
              <>
                <LoaderIcon className="animate-spin" />
                Running…
              </>
            ) : (
              <>
                <PlayIcon />
                Run
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ol className="space-y-1.5">
          {steps.map((label, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm">
              {/* Step index in mono so the numbered rail reads as a
                  sequence of identifiers, consistent with the rest of the
                  dashboard's "labels/counts/IDs are mono" voice. */}
              <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-white/[0.06] font-mono text-[11px] tabular text-white/70">
                {i + 1}
              </span>
              <span className="text-white/90">{label}</span>
            </li>
          ))}
        </ol>

        <div className="mt-4 flex items-center justify-between gap-3">
          {lastRun ? (
            <LastRunLine lastRun={lastRun} />
          ) : (
            <span className="text-xs text-[var(--overview-fg)]/45">Never run</span>
          )}

          {status === "success" && message && (
            <span className="text-xs" style={{ color: "var(--pill-ok-fg)" }}>
              {message}
            </span>
          )}
          {status === "error" && message && (
            <span
              className="max-w-sm truncate text-xs"
              style={{ color: "var(--pill-warn-fg)" }}
              title={message}
            >
              {message}
            </span>
          )}
        </div>

        {/* Full output panel — collapsible; auto-expanded on failure so the
            operator sees env-diag and the failing phase without scrolling
            past a truncated single-line error. */}
        {hasOutput && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setOutputExpanded((v) => !v)}
              className="flex items-center gap-1.5 text-[11px] text-[var(--overview-fg)]/55 hover:text-[var(--overview-fg)]/85 transition-colors"
            >
              {outputExpanded ? (
                <ChevronDownIcon className="size-3.5" />
              ) : (
                <ChevronRightIcon className="size-3.5" />
              )}
              {outputExpanded ? "Hide output" : "Show full output"}
            </button>
            {outputExpanded && (
              <>
                <Separator className="my-2" />
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-black/30 p-2 font-mono text-[11px] leading-relaxed text-[var(--overview-fg)]/75">
                  {output}
                </pre>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
