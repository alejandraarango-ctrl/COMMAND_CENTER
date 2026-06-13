/**
 * Leila — LinkedIn Graphics Design Sandbox (temporary)
 *
 * Linked from /leila/linkedin. Server fetches Alex's Facebook template (the
 * config the cron actually renders against today) so the sandbox starts at
 * a real baseline, not the hardcoded defaults. The actual designer is a
 * client component since it's stateful + hits /api/templates/preview.
 */

import path from "path";
import fs from "fs/promises";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { LeilaLinkedInDesignTool } from "@/components/leila-linkedin-design-tool";
import { getSupabaseClient } from "@/lib/supabase";
import {
  DEFAULT_TEMPLATE_CONFIG,
  validateTemplateConfig,
  type TemplateConfig,
} from "@/lib/template-types";

export const dynamic = "force-dynamic";

// Path is relative to the dashboard cwd (Render and `npm start` both run
// from the dashboard root). Same convention as the generate route's
// PLATFORM_HEADER_PATHS.
const LEILA_HEADER_REL_PATH = "public/ig-pipeline/Leila_Header.png";

async function getStartingConfig(): Promise<TemplateConfig | null> {
  // Read directly from Supabase rather than going through /api/templates,
  // since this is a server component and we already have the service-role
  // client — saves a round-trip and avoids needing a CRON_SECRET-equivalent
  // for an auth-gated GET.
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from("templates")
    .select("config")
    .eq("platform", "facebook")
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!data?.config) return null;
  return {
    ...DEFAULT_TEMPLATE_CONFIG,
    ...validateTemplateConfig(data.config as Record<string, unknown>),
  };
}

/** Read the Leila header PNG and return it as a data URL. The sandbox
 *  uses this as its baseline so the preview matches what the cron renders
 *  in production (which is the same file, read from disk). */
async function getLeilaHeaderDataUrl(): Promise<string | null> {
  try {
    const buf = await fs.readFile(path.join(process.cwd(), LEILA_HEADER_REL_PATH));
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function LeilaLinkedInDesignPage() {
  const [startingConfig, defaultHeaderDataUrl] = await Promise.all([
    getStartingConfig(),
    getLeilaHeaderDataUrl(),
  ]);

  return (
    <AppShell>
      {/* Page header — mono eyebrow over a large tracked title with a
          terracotta period, matching the refined terracotta detail-page
          voice. Revealed first, before the tool itself. */}
      <div className="cc-reveal mb-8" style={{ animationDelay: "0s" }}>
        <Link
          href="/leila/linkedin"
          className="mb-5 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-white/40 transition-colors hover:text-white/70"
        >
          <ArrowLeftIcon className="size-3.5" />
          Back to Leila — LinkedIn
        </Link>
        <div>
          <div className="cc-eyebrow mb-1.5">Template Sandbox</div>
          <h1 className="text-[40px] font-semibold leading-none tracking-[-0.025em] text-[#edeae0]">
            Graphics Design
            <span style={{ color: "var(--terracotta)" }}>.</span>
          </h1>
          <p className="mt-2 text-sm text-white/55">
            Iterate on the quote-card template for Leila&apos;s LinkedIn —
            tweak knobs, watch the preview, copy the config when ready.
          </p>
        </div>
      </div>

      <div className="cc-reveal" style={{ animationDelay: "0.06s" }}>
        <LeilaLinkedInDesignTool
          initialConfig={startingConfig}
          defaultHeaderImageDataUrl={defaultHeaderDataUrl}
        />
      </div>
    </AppShell>
  );
}
