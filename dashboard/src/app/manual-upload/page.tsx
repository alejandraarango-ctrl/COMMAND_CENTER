/**
 * Manual Upload page.
 *
 * Reached from the "Reposts" card on the Command Center home. Hosts the
 * batch upload drop zone: each video is transcribed, gets an auto-generated
 * title and a caption matched from the tweet bank, and is then scheduled
 * out to Buffer — no hand-typed title or caption anywhere.
 *
 * Note on the route name: the page used to live at /tiktok/manual-upload
 * because it was originally framed as a TikTok pathway. The underlying
 * workflow is platform-agnostic — the same mp4 is fanned out to TikTok,
 * YouTube Shorts, and (via the Twitter bridge) X — so nesting it under
 * /tiktok made the breadcrumb ("Back to TikTok") misleading. The page now
 * lives at /manual-upload and routes back to the Command Center.
 *
 * The API endpoints are intentionally still under /api/tiktok/manual-upload
 * — moving the backend wasn't requested and would force a coordinated
 * rename across the route handlers, signed-URL token issuer, and the
 * client fetch calls in batch-video-upload.tsx.
 */

import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { BatchVideoUpload } from "@/components/batch-video-upload";

export const dynamic = "force-dynamic";

export default function ManualUploadPage() {
  return (
    <AppShell>
      {/* Page header — staggered reveal, mono eyebrow over a large tracked
          title (with the signature terracotta period), matching the refined
          terracotta language used across detail pages. */}
      <div className="mb-10 cc-reveal">
        <Link
          href="/"
          className="mb-5 inline-flex items-center gap-1.5 text-sm text-white/55 hover:text-foreground transition-colors"
        >
          <ArrowLeftIcon className="size-3.5" />
          Back to Command Center
        </Link>
        <div>
          <div className="cc-eyebrow mb-2">Reposts · Multi-platform</div>
          <h1 className="text-[40px] font-semibold leading-none tracking-[-0.025em] text-[#edeae0]">
            Manual upload<span className="text-[var(--terracotta)]">.</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-white/55">
            TikTok + YouTube Shorts + X (via Twitter bridge) — fan out the same
            mp4 to all three Buffer channels. Titles, captions, and scheduling
            are generated automatically.
          </p>
        </div>
      </div>

      {/* Batch auto-schedule: drop a folder of mp4s; title + caption are
          generated from each video's transcript and fanned out automatically.
          Staggered ~0.06s after the header. */}
      <section
        className="cc-reveal"
        style={{ animationDelay: "0.06s" } as React.CSSProperties}
      >
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[#edeae0]">
          Batch auto-schedule
        </h2>
        <p className="mb-5 mt-1.5 max-w-2xl text-sm text-white/55">
          Drag in a batch of videos. Each one is transcribed, gets an
          auto-generated title and a caption matched from the tweet bank, then
          is scheduled to TikTok + YouTube Shorts + X via Buffer.
        </p>
        <BatchVideoUpload />
      </section>
    </AppShell>
  );
}
