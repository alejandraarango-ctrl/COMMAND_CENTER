"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";

// Top-level nav groups. Each group has a label and a list of pages.
// Clicking the group label navigates to the first page in that group.
const NAV_ITEMS = [
  { label: "Home", href: "/" },
  { label: "Manual Upload", href: "/manual-upload" },
  { label: "Posts", href: "/posts" },
  { label: "YouTube", href: "/youtube" },
] as const;

/**
 * Shell for every detail page. Matches the home page's header language:
 * wordmark + terracotta dot on the left, nav links in the middle,
 * UserButton on the right.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    // The warm radial + grain now live globally (see layout.tsx
    // .app-atmosphere), so this shell no longer paints its own background
    // wash — it just sets the text color and lets the body bg show through.
    <div className="min-h-screen relative" style={{ color: "var(--overview-fg)" }}>
      <header
        className="sticky top-0 z-50 border-b"
        style={{
          borderColor: "var(--surface-border)",
          backgroundColor: "rgba(24,19,15,0.72)",
          backdropFilter: "blur(12px) saturate(1.2)",
          WebkitBackdropFilter: "blur(12px) saturate(1.2)",
        }}
      >
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-8">
          {/* Wordmark — a small terracotta pip leads the mark, with the
              name in a tracked uppercase mono-adjacent voice. */}
          <Link href="/" className="group flex items-center gap-2.5 shrink-0">
            <span
              className="h-[7px] w-[7px] rounded-full transition-shadow duration-200"
              style={{
                backgroundColor: "var(--terracotta)",
                boxShadow: "var(--glow-terra)",
              }}
            />
            <span className="text-[12px] font-semibold tracking-[0.24em] uppercase text-[var(--overview-fg)]/90 transition-colors group-hover:text-[var(--overview-fg)]">
              Command Center
            </span>
          </Link>

          {/* Nav links — active route gets a soft terracotta wash + a thin
              underline accent; inactive links warm to full opacity on hover. */}
          <nav className="flex items-center gap-0.5">
            {NAV_ITEMS.map(({ label, href }) => {
              // Mark active when the pathname starts with the href (except
              // "/" which only matches exactly so it doesn't highlight on
              // every page).
              const active =
                href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className="relative rounded-lg px-3 py-1.5 text-[12.5px] transition-colors duration-150"
                  style={{
                    color: active
                      ? "var(--overview-fg)"
                      : "rgba(237,234,224,0.5)",
                    backgroundColor: active
                      ? "var(--terracotta-soft)"
                      : "transparent",
                    fontWeight: active ? 500 : 400,
                  }}
                >
                  {label}
                  {active && (
                    <span
                      aria-hidden
                      className="absolute inset-x-3 -bottom-px h-[1.5px] rounded-full"
                      style={{ backgroundColor: "var(--terracotta)" }}
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          <UserButton />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-8 py-10">{children}</main>
    </div>
  );
}
