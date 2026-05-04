/**
 * Leila — LinkedIn Platform Detail Page
 *
 * Single pathway: Apify-source @LeilaHormozi tweets → render 1080×1080 quote
 * cards (Alex's Facebook template, reused) → queue on Buffer's Leila LinkedIn
 * channel with caption "Agree?". The cron (linkedin-leila-cron) drives all
 * three phases sequentially in one invocation.
 */

import Link from "next/link";
import { ArrowLeftIcon, PaletteIcon } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import { AppShell } from "@/components/app-shell";
import { PlatformIcon } from "@/components/platform-icon";
import { PathwayCard, type PathwayLastRun } from "@/components/pathway-card";

export const dynamic = "force-dynamic";

async function getLatestRun(): Promise<PathwayLastRun | null> {
  const supabase = getSupabaseClient();
  // Latest run regardless of job_type — content_apify, content_generate,
  // and buffer_send all fire sequentially in one cron invocation, and a
  // failure in any of the three should surface here.
  const { data } = await supabase
    .from("cron_runs")
    .select("status, started_at")
    .eq("platform", "linkedin_leila")
    .order("started_at", { ascending: false })
    .limit(1);
  const row = data?.[0];
  if (!row) return null;
  return {
    status: row.status as PathwayLastRun["status"],
    startedAt: row.started_at as string,
  };
}

export default async function LeilaLinkedInPage() {
  const lastRun = await getLatestRun();

  return (
    <AppShell>
      <div className="mb-6">
        <Link
          href="/"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeftIcon className="size-3.5" />
          Back to Overview
        </Link>
        <div className="flex items-center gap-3">
          <PlatformIcon platform="linkedin" className="size-8" />
          <div>
            <h1 className="text-xl font-semibold">Leila — LinkedIn</h1>
            <p className="text-sm text-muted-foreground">
              Quote-card images from recent @LeilaHormozi tweets
            </p>
          </div>
        </div>
      </div>

      <PathwayCard
        number={1}
        title="Apify → Render → LinkedIn"
        steps={[
          "Fetch up to 5 recent @LeilaHormozi tweets via Apify (24h window, 72h fallback)",
          "Dedupe against existing posts (platform=linkedin_leila)",
          "Render each tweet into a 1080×1080 quote card (Alex's template) and upload to Storage",
          'Send each image to Buffer\'s Leila LinkedIn channel with caption "Agree?"',
        ]}
        actions={[{ url: "/api/cron/run", body: { job: "linkedin-leila-cron" } }]}
        lastRun={lastRun}
      />

      {/* Sandbox entry point. Background/text/header are now locked in
          the cron path; this page survives as a preview tool for any
          further visual iteration the operator wants to do. */}
      <Link
        href="/leila/linkedin/design"
        className="group mt-4 flex items-center justify-between gap-3 rounded-xl border px-5 py-4 transition-colors hover:bg-white/[0.02]"
        style={{
          backgroundColor: "var(--card-warm-bg)",
          borderColor: "var(--card-warm-border)",
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="inline-flex items-center justify-center h-9 w-9 rounded-lg border shrink-0"
            style={{
              backgroundColor: "rgba(174,86,48,0.09)",
              borderColor: "rgba(174,86,48,0.19)",
            }}
          >
            <PaletteIcon
              className="size-[15px]"
              style={{ color: "var(--terracotta)" }}
            />
          </span>
          <div className="min-w-0">
            <div className="text-[14px] font-medium text-[var(--overview-fg)]">
              Graphics design sandbox
            </div>
            <div className="text-[12px] text-[var(--overview-fg)]/55">
              Preview the locked-in Leila design (black bg, white text,
              Leila_Header.png) and experiment with other knobs.
            </div>
          </div>
        </div>
        <span className="text-[var(--overview-fg)]/40 group-hover:text-[var(--overview-fg)]/70 transition-colors text-[18px]">
          →
        </span>
      </Link>
    </AppShell>
  );
}
