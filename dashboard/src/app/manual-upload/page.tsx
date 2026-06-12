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
      <div className="mb-6">
        <Link
          href="/"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeftIcon className="size-3.5" />
          Back to Command Center
        </Link>
        <div>
          <h1 className="text-xl font-semibold">Manual upload</h1>
          <p className="text-sm text-muted-foreground">
            TikTok + YouTube Shorts + X (via Twitter bridge) — fan out the
            same mp4 to all three Buffer channels. Titles, captions, and
            scheduling are generated automatically.
          </p>
        </div>
      </div>

      {/* Batch auto-schedule: drop a folder of mp4s; title + caption are
          generated from each video's transcript and fanned out automatically. */}
      <section>
        <h2 className="mb-1 text-sm font-semibold">Batch auto-schedule</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Drag in a batch of videos. Each one is transcribed, gets an
          auto-generated title and a caption matched from the tweet bank, then
          is scheduled to TikTok + YouTube Shorts + X via Buffer.
        </p>
        <BatchVideoUpload />
      </section>
    </AppShell>
  );
}
