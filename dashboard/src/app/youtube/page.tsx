/**
 * YouTube Platform Detail Page
 *
 * YouTube posts originate from the batch upload on /manual-upload — each
 * mp4 is transcribed, gets an auto-generated title and caption, and fans
 * out to Buffer's TikTok and YouTube Shorts channels. This page describes
 * that flow and routes the user to the upload page; no run button because
 * there's no separate YouTube pipeline.
 */

import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PlatformIcon } from "@/components/platform-icon";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeftIcon, UploadIcon } from "lucide-react";

export const dynamic = "force-dynamic";

const STEPS = [
  "Drop videos into the batch upload on /manual-upload",
  "Each mp4 is transcribed and gets an auto-generated title + caption",
  "Same mp4 is queued on Buffer's TikTok + YouTube Shorts channels",
  "Buffer auto-schedules each into its next open slot",
];

export default function YouTubePage() {
  return (
    <AppShell>
      {/* Page header — staggered reveal with a mono eyebrow + large tracked
          title, matching the refined terracotta language. The terracotta
          platform glyph leads the title row. */}
      <div className="mb-8 cc-reveal">
        <Link
          href="/"
          className="mb-5 inline-flex items-center gap-1.5 text-sm text-white/55 hover:text-foreground transition-colors"
        >
          <ArrowLeftIcon className="size-3.5" />
          Back to Overview
        </Link>
        <div className="cc-eyebrow mb-2">Platform · Shorts</div>
        <div className="flex items-center gap-3">
          <PlatformIcon platform="youtube" className="size-9" />
          <div>
            <h1 className="text-[40px] font-semibold leading-none tracking-[-0.025em] text-[#edeae0]">
              YouTube<span className="text-[var(--terracotta)]">.</span>
            </h1>
            <p className="mt-2.5 text-sm text-white/55">
              YouTube Shorts posts — queued via the batch upload on /manual-upload
            </p>
          </div>
        </div>
      </div>

      {/* Run cadence + flow notes — a recessed surface panel. Labels in faint
          text, values in mono so the trigger/source/channel read as a spec. */}
      <div
        className="mb-5 cc-reveal rounded-xl border px-4 py-3 text-xs text-[#edeae0]/65"
        style={
          {
            backgroundColor: "var(--surface-bg)",
            borderColor: "var(--surface-border)",
            animationDelay: "0.06s",
          } as React.CSSProperties
        }
      >
        <div className="flex flex-wrap gap-x-6 gap-y-1.5">
          <span>
            <span className="text-white/40">Trigger</span>{" "}
            <span className="font-mono">Manual · /manual-upload batch upload</span>
          </span>
          <span>
            <span className="text-white/40">Source</span>{" "}
            <span className="font-mono">User-picked MP4</span>
          </span>
          <span>
            <span className="text-white/40">Channel</span>{" "}
            <span className="font-mono">Buffer · YouTube Shorts</span>
          </span>
        </div>
        <p className="mt-2 text-white/45">
          No cron — YouTube Shorts are queued only when the operator uses the batch upload,
          which fans out the same MP4 to Buffer&apos;s TikTok + YouTube Shorts channels automatically.
        </p>
      </div>

      <Card
        className="mb-4 cc-reveal"
        style={{ animationDelay: "0.12s" } as React.CSSProperties}
      >
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* Neutral "idle" pill — this is a label, not a status, so it
                  uses the idle pill tokens rather than the terracotta accent. */}
              <Badge
                className="border-transparent font-mono text-[11px]"
                style={{
                  backgroundColor: "var(--pill-idle-bg)",
                  color: "var(--pill-idle-fg)",
                }}
              >
                Pathway 1
              </Badge>
              <CardTitle className="text-sm">Batch upload fan-out</CardTitle>
            </div>
            <Link href="/manual-upload">
              <Button size="sm">
                <UploadIcon />
                Open Manual Upload
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <ol className="space-y-1.5">
            {STEPS.map((label, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                {/* Step index — mono numeral on the soft surface chip. */}
                <span
                  className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[11px]"
                  style={{
                    backgroundColor: "var(--surface-raised)",
                    color: "rgba(237,234,224,0.7)",
                  }}
                >
                  {i + 1}
                </span>
                <span className="text-[#edeae0]/90">{label}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-white/45">
            User-triggered — no cron schedule. The title YouTube needs is
            generated automatically from the video&apos;s transcript.
          </p>
        </CardContent>
      </Card>
    </AppShell>
  );
}
