/**
 * Instagram (2nd) Platform Detail Page
 *
 * Tweet-to-Instagram pipeline: pick tweets from the CSV bank, generate
 * PNG/MP4 media, schedule to Instagram via Buffer (alexhighlights2026).
 */

import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase";
import { AppShell } from "@/components/app-shell";
import { PlatformIcon } from "@/components/platform-icon";
import { PathwayCard, type PathwayLastRun } from "@/components/pathway-card";
import { Card, CardContent } from "@/components/ui/card";
import { CronCountdown } from "@/components/cron-countdown";
import { parseBankFile, pickRandomUnused } from "@/lib/tweet-bank";
import { ArrowLeftIcon } from "lucide-react";

export const dynamic = "force-dynamic";

interface PipelineStats {
  scheduled7d: number;
  scheduled30d: number;
  bankTotal: number;
  bankRemaining: number;
  bankUsed: number;
}

async function getLatestRun(): Promise<PathwayLastRun | null> {
  const supabase = getSupabaseClient();
  // /api/ig-pipeline logs a single `post` job_type row per invocation
  // with posts_processed = number of reels scheduled to Buffer, so a
  // single query covers both status and count.
  const { data } = await supabase
    .from("cron_runs")
    .select("status, started_at, posts_processed")
    .eq("platform", "instagram_2nd")
    .order("started_at", { ascending: false })
    .limit(1);
  const row = data?.[0];
  if (!row) return null;
  return {
    status: row.status as PathwayLastRun["status"],
    startedAt: row.started_at as string,
    count: (row.posts_processed as number | null) ?? 0,
  };
}

// Pull bank counts (cheap filesystem reads) plus aggregate posts_processed
// across recent successful cron runs. "Scheduled" here means: handed off to
// Buffer's queue — Buffer then publishes to Instagram on its own cadence.
async function getStats(): Promise<PipelineStats> {
  const supabase = getSupabaseClient();
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const { data: runs } = await supabase
    .from("cron_runs")
    .select("posts_processed, started_at")
    .eq("platform", "instagram_2nd")
    .eq("status", "success")
    .gte("started_at", cutoff);

  let scheduled7d = 0;
  let scheduled30d = 0;
  for (const r of runs ?? []) {
    const n = (r.posts_processed as number | null) ?? 0;
    scheduled30d += n;
    if (new Date(r.started_at as string).getTime() >= sevenDaysAgo) {
      scheduled7d += n;
    }
  }

  // Bank stats — wrapped because parseBankFile reads from disk and the file
  // can be missing in unusual deploy states. Don't blow up the page render
  // just because the CSV isn't there.
  let bankTotal = 0;
  let bankRemaining = 0;
  try {
    bankTotal = parseBankFile().length;
    bankRemaining = pickRandomUnused("instagram", 0).remainingUnused;
  } catch {
    bankTotal = 0;
    bankRemaining = 0;
  }

  return {
    scheduled7d,
    scheduled30d,
    bankTotal,
    bankRemaining,
    bankUsed: Math.max(0, bankTotal - bankRemaining),
  };
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card size="sm">
      <CardContent>
        {/* Label as a mono uppercase eyebrow; the value is a count that
            changes between fetches, so it gets `tabular` to stop the
            digits from shifting width as the page refreshes. */}
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/40">
          {label}
        </div>
        <div className="mt-1.5 font-heading text-2xl font-semibold tabular text-[#edeae0]">
          {value}
        </div>
        {hint && <div className="mt-1 text-xs text-white/55">{hint}</div>}
      </CardContent>
    </Card>
  );
}

export default async function InstagramSecondPage() {
  const [lastRun, stats] = await Promise.all([getLatestRun(), getStats()]);

  const bankPct = stats.bankTotal
    ? Math.round((stats.bankRemaining / stats.bankTotal) * 100)
    : 0;

  return (
    <AppShell>
      <div className="mb-8 cc-reveal">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[12px] text-white/55 transition-colors hover:text-white/85"
        >
          <ArrowLeftIcon className="size-3.5" />
          Back to Command Center
        </Link>

        <div className="mt-6 flex items-center gap-3">
          <PlatformIcon platform="instagram_2nd" className="size-8" />
          <div>
            {/* Mono eyebrow over a large display title with a terracotta
                period — the shared page-title language. */}
            <div className="cc-eyebrow">Instagram · 2nd</div>
            <h1 className="mt-1.5 text-[40px] font-semibold leading-none tracking-[-0.025em] text-[#edeae0]">
              Tweet Reels
              <span style={{ color: "var(--terracotta)" }}>.</span>
            </h1>
            <p className="mt-2 text-[13px] text-white/55">
              Tweet-to-Instagram pipeline
            </p>
          </div>
        </div>
      </div>

      <div className="mb-4 cc-reveal" style={{ animationDelay: "0.06s" }}>
        <CronCountdown platform="instagram_2nd" />
      </div>

      {/* Section header — mono eyebrow voice + animated terracotta rule. */}
      <div
        className="mb-4 flex items-center gap-3 cc-reveal"
        style={{ animationDelay: "0.12s" }}
      >
        <span className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[#edeae0]">
          Pipeline Health
        </span>
        <span
          className="cc-rule"
          style={{ ["--rule-color" as never]: "var(--terracotta)" } as React.CSSProperties}
        />
      </div>

      <div
        className="mb-4 grid grid-cols-1 gap-3 cc-reveal sm:grid-cols-3"
        style={{ animationDelay: "0.18s" }}
      >
        <StatTile
          label="Scheduled · 7d"
          value={stats.scheduled7d.toString()}
          hint="Posts handed to Buffer's queue"
        />
        <StatTile
          label="Scheduled · 30d"
          value={stats.scheduled30d.toString()}
          hint="Successful runs only"
        />
        <StatTile
          label="Bank remaining"
          value={stats.bankRemaining.toString()}
          hint={`${stats.bankUsed} used of ${stats.bankTotal} (${bankPct}% left)`}
        />
      </div>

      {/* Run cadence + flow notes — kept inline (not split into its own
          component) because nothing else on the page needs them. Promoted
          to the shared .cc-surface card family. */}
      <div
        className="cc-surface mb-5 px-4 py-3 text-xs text-white/65 cc-reveal"
        style={{ animationDelay: "0.24s" }}
      >
        <div className="flex flex-wrap gap-x-6 gap-y-1.5">
          <span>
            <span className="text-white/40">Schedule</span>{" "}
            <span className="font-mono">Paused — manual via workflow_dispatch</span>
          </span>
          <span>
            <span className="text-white/40">Source</span>{" "}
            <span className="font-mono">data/TweetMasterBank.csv</span>
          </span>
          <span>
            <span className="text-white/40">Channel</span>{" "}
            <span className="font-mono">Buffer · Instagram (alexhighlights2026)</span>
          </span>
        </div>
        <p className="mt-2 text-white/45">
          GitHub Actions schedule is commented out (<code className="font-mono">.github/workflows/ig-pipeline.yml</code>);
          the dashboard <code className="font-mono">/api/ig-pipeline</code> route orchestrates pick → generate → schedule in-process on manual trigger.
          Per-item commit (marks each tweet used right after Buffer accepts) so a mid-batch failure can&apos;t cause reposts.
        </p>
      </div>

      <div className="cc-reveal" style={{ animationDelay: "0.3s" }}>
      <PathwayCard
        number={1}
        title="X Bank Reel (paused — manual)"
        steps={[
          "Pick up to 10 random unused tweets from data/TweetMasterBank.csv (configurable via BATCH_SIZE; usage tracked in data/ig-bank-history.json)",
          "Render each tweet onto the branded canvas (PNG → MP4, 5s loop, 1080×1920) via /api/content-gen",
          "Upload MP4 to Supabase Storage at instagram_2nd/tweet-{hash}.mp4 (7-day signed URL)",
          "Queue to Buffer's IG channel (BUFFER_INSTAGRAM_2ND_NAME, default \"alexhighlights2026\") as a reel",
        ]}
        // Single end-to-end orchestrator. The /pick, /generate, /schedule
        // sub-routes still exist for cron-driven step-by-step use, but the
        // dashboard button can't thread response data between them — the
        // orchestrator runs all three in-process so the picked → generated
        // → scheduled state flows through local variables.
        actions={[{ url: "/api/ig-pipeline" }]}
        lastRun={lastRun}
      />
      </div>
    </AppShell>
  );
}
