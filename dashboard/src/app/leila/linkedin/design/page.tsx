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
      <div className="mb-6">
        <Link
          href="/leila/linkedin"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeftIcon className="size-3.5" />
          Back to Leila — LinkedIn
        </Link>
        <div>
          <h1 className="text-xl font-semibold">Graphics Design Sandbox</h1>
          <p className="text-sm text-muted-foreground">
            Iterate on the quote-card template for Leila&apos;s LinkedIn —
            tweak knobs, watch the preview, copy the config when ready.
          </p>
        </div>
      </div>

      <LeilaLinkedInDesignTool
        initialConfig={startingConfig}
        defaultHeaderImageDataUrl={defaultHeaderDataUrl}
      />
    </AppShell>
  );
}
