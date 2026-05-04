/**
 * Leila — LinkedIn Graphics Design Sandbox (temporary)
 *
 * Linked from /leila/linkedin. Server fetches Alex's Facebook template (the
 * config the cron actually renders against today) so the sandbox starts at
 * a real baseline, not the hardcoded defaults. The actual designer is a
 * client component since it's stateful + hits /api/templates/preview.
 */

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

export default async function LeilaLinkedInDesignPage() {
  const startingConfig = await getStartingConfig();

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

      <LeilaLinkedInDesignTool initialConfig={startingConfig} />
    </AppShell>
  );
}
