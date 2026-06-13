/**
 * Sign-In Page — renders the Clerk sign-in form centered on the warm
 * atmosphere.
 *
 * The [[...sign-in]] catch-all route handles Clerk's multi-step auth flow
 * (email, password, MFA, SSO callback, etc.).
 *
 * Visual: we DON'T paint a page background — the global `.app-atmosphere`
 * (warm terracotta radial + film grain, rendered once in layout.tsx) shows
 * through. Above the Clerk widget we set a small "Command Center" wordmark
 * with the same terracotta pip + glow used in the AppShell header, so the
 * sign-in screen reads as the same product. The Clerk widget itself already
 * uses the dark baseTheme — we only frame it, we don't reconfigure it.
 */

import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      {/* Wordmark — mirrors the AppShell mark: terracotta pip with a warm
          glow, then a tracked uppercase wordmark. A mono eyebrow above it
          sets the "sign in" context. Revealed gently so the page settles
          rather than snapping in. */}
      <div className="cc-reveal mb-8 flex flex-col items-center text-center">
        <div className="cc-eyebrow mb-3">Restricted Access</div>
        <div className="flex items-center gap-2.5">
          <span
            className="h-[7px] w-[7px] rounded-full"
            style={{
              backgroundColor: "var(--terracotta)",
              boxShadow: "var(--glow-terra)",
            }}
          />
          <span className="text-[13px] font-semibold uppercase tracking-[0.24em] text-[#edeae0]">
            Command Center
          </span>
        </div>
      </div>

      {/* Clerk widget — already themed via the dark baseTheme configured at
          the provider level; we just give it a staggered entrance under the
          wordmark and let the atmosphere show through behind it. */}
      <div className="cc-reveal" style={{ animationDelay: "0.08s" }}>
        <SignIn />
      </div>
    </div>
  );
}
