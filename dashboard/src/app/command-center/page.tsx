/**
 * Command Center page — org chart view showing all AI agents and
 * workflows that run through the system across all 6 platforms.
 *
 * This is a high-level visualization to help reason about the
 * agent architecture. Platform columns expand to show individual agents.
 */

import { AppShell } from "@/components/app-shell";
import { AgentOrgChart } from "@/components/agent-org-chart";

export default function CommandCenterPage() {
  return (
    <AppShell>
      {/* Page header — Refined Terracotta voice: a mono eyebrow above a
          large tracked title with a terracotta period, then a muted lede.
          Wrapped in .cc-reveal so the header rises in on load like every
          other page section. */}
      <div className="mb-8 cc-reveal">
        <div className="cc-eyebrow mb-2">Architecture</div>
        <h1 className="text-[40px] font-semibold tracking-[-0.025em] leading-[1.05] text-[#edeae0]">
          Agent org chart<span className="text-[var(--terracotta)]">.</span>
        </h1>
        <p className="text-sm text-white/55 mt-3 max-w-2xl">
          High-level view of all agents and workflows running through the Command Center.
          Click a platform to expand its agent tree.
        </p>
      </div>
      <AgentOrgChart />
    </AppShell>
  );
}
