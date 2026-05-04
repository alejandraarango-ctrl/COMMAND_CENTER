"use client";

/**
 * Leila LinkedIn — Graphics Design Tool (temporary sandbox)
 *
 * Lets the operator iterate on a TemplateConfig with live preview before any
 * of it is wired into the actual cron. There is intentionally no "Save"
 * action: the cron currently reads Alex's Facebook template, and writing
 * back through PUT /api/templates would overwrite Alex's renders too.
 *
 * Workflow:
 *   1. Tweak knobs and sample text on the left
 *   2. Watch the preview render in the right pane (debounced ~250ms)
 *   3. When happy, click "Copy config JSON" and hand it off — wiring the
 *      pipeline to use a creator-scoped template is a follow-up change.
 *
 * The starting config is fetched from /api/templates?platform=facebook so
 * the sandbox starts where the cron currently produces.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { CopyIcon, RotateCcwIcon, LoaderIcon, RefreshCwIcon } from "lucide-react";
import {
  DEFAULT_TEMPLATE_CONFIG,
  type TemplateConfig,
} from "@/lib/template-types";

const SAMPLE_TWEETS = [
  "Hire slow. Fire fast. The best teams aren't built by accident — they're built by people willing to make uncomfortable decisions early.",
  "Stop optimizing what shouldn't exist.",
  "Most people don't have a marketing problem. They have a clarity problem.",
];

interface DesignToolProps {
  /** Server-fetched starting config — falls back to DEFAULT_TEMPLATE_CONFIG. */
  initialConfig: TemplateConfig | null;
}

export function LeilaLinkedInDesignTool({ initialConfig }: DesignToolProps) {
  const startingConfig = useMemo<TemplateConfig>(
    () => initialConfig ?? DEFAULT_TEMPLATE_CONFIG,
    [initialConfig],
  );
  const [config, setConfig] = useState<TemplateConfig>(startingConfig);
  const [text, setText] = useState<string>(SAMPLE_TWEETS[0]);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Cancel in-flight preview requests when the user keeps typing/dragging.
  // Otherwise responses arrive out of order and the rendered image jitters
  // back to a stale state.
  const abortRef = useRef<AbortController | null>(null);

  const renderPreview = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await fetch("/api/templates/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, config }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Preview request failed (${res.status})`);
      }
      const data = await res.json();
      if (!controller.signal.aborted) {
        setPreviewSrc(data.image);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setPreviewError((err as Error).message);
    } finally {
      if (!controller.signal.aborted) {
        setPreviewLoading(false);
      }
    }
  }, [text, config]);

  // Debounce: 250ms of inactivity before kicking off a render. Tight enough
  // that dragging a number input still feels live, loose enough that a
  // typed-out tweet doesn't fire ten requests.
  useEffect(() => {
    const id = setTimeout(renderPreview, 250);
    return () => clearTimeout(id);
  }, [renderPreview]);

  function patch<K extends keyof TemplateConfig>(key: K, value: TemplateConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  function reset() {
    setConfig(startingConfig);
  }

  async function copyJson() {
    await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,520px)] gap-6">
      {/* ── Left: controls ────────────────────────────────────────────── */}
      <div className="space-y-5">
        <Section title="Sample tweet">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            className="font-mono text-[12px]"
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {SAMPLE_TWEETS.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setText(s)}
                className="text-[10px] px-2 py-1 rounded-md border text-[var(--overview-fg)]/65 hover:text-[var(--overview-fg)] hover:bg-white/5 transition-colors"
                style={{ borderColor: "var(--card-warm-border)" }}
              >
                Sample {i + 1}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Colors">
          <div className="grid grid-cols-3 gap-3">
            <ColorField
              label="Background"
              value={config.backgroundColor}
              onChange={(v) => patch("backgroundColor", v)}
            />
            <ColorField
              label="Text"
              value={config.textColor}
              onChange={(v) => patch("textColor", v)}
            />
            <ColorField
              label="Accent"
              value={config.accentColor}
              onChange={(v) => patch("accentColor", v)}
            />
          </div>
        </Section>

        <Section title="Typography">
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Max font size"
              value={config.maxFontSize}
              min={24}
              max={300}
              onChange={(v) => patch("maxFontSize", v)}
            />
            <NumberField
              label="Min font size"
              value={config.minFontSize}
              min={12}
              max={200}
              onChange={(v) => patch("minFontSize", v)}
            />
            <NumberField
              label="Line height"
              value={config.lineHeight}
              min={0.8}
              max={3}
              step={0.05}
              onChange={(v) => patch("lineHeight", v)}
            />
            <NumberField
              label="Letter spacing"
              value={config.letterSpacing}
              min={-10}
              max={10}
              step={0.5}
              onChange={(v) => patch("letterSpacing", v)}
            />
            <NumberField
              label="Paragraph spacing"
              value={config.paragraphSpacing}
              min={0}
              max={3}
              step={0.05}
              onChange={(v) => patch("paragraphSpacing", v)}
            />
            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px] uppercase tracking-[0.14em] text-[var(--overview-fg)]/55">
                Text align
              </Label>
              <Select
                value={config.textAlign}
                onValueChange={(v) =>
                  patch("textAlign", v as TemplateConfig["textAlign"])
                }
              >
                <SelectTrigger className="h-9 text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Section>

        <Section title="Padding">
          <div className="grid grid-cols-4 gap-3">
            <NumberField
              label="Top"
              value={config.paddingTop}
              min={0}
              max={400}
              onChange={(v) => patch("paddingTop", v)}
            />
            <NumberField
              label="Right"
              value={config.paddingRight}
              min={0}
              max={400}
              onChange={(v) => patch("paddingRight", v)}
            />
            <NumberField
              label="Bottom"
              value={config.paddingBottom}
              min={0}
              max={400}
              onChange={(v) => patch("paddingBottom", v)}
            />
            <NumberField
              label="Left"
              value={config.paddingLeft}
              min={0}
              max={400}
              onChange={(v) => patch("paddingLeft", v)}
            />
          </div>
        </Section>

        <Section title="Header">
          <div className="flex items-center justify-between mb-3">
            <Label className="text-[12px]">Show header image</Label>
            <Switch
              checked={config.showHeader}
              onCheckedChange={(v) => patch("showHeader", v)}
            />
          </div>
          {config.showHeader && (
            <div className="grid grid-cols-3 gap-3">
              <NumberField
                label="Height"
                value={config.headerHeight}
                min={0}
                max={600}
                onChange={(v) => patch("headerHeight", v)}
              />
              <NumberField
                label="Gap"
                value={config.headerGap}
                min={-200}
                max={200}
                onChange={(v) => patch("headerGap", v)}
              />
              <NumberField
                label="Min scale"
                value={config.headerMinScale}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => patch("headerMinScale", v)}
              />
            </div>
          )}
        </Section>

        <Section title="Accent bar">
          <div className="flex items-center justify-between mb-3">
            <Label className="text-[12px]">Show accent bar</Label>
            <Switch
              checked={config.showAccentBar}
              onCheckedChange={(v) => patch("showAccentBar", v)}
            />
          </div>
          {config.showAccentBar && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-[10px] uppercase tracking-[0.14em] text-[var(--overview-fg)]/55">
                  Position
                </Label>
                <Select
                  value={config.accentBarPosition}
                  onValueChange={(v) =>
                    patch(
                      "accentBarPosition",
                      v as TemplateConfig["accentBarPosition"],
                    )
                  }
                >
                  <SelectTrigger className="h-9 text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="top">Top</SelectItem>
                    <SelectItem value="bottom">Bottom</SelectItem>
                    <SelectItem value="left">Left</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <NumberField
                label="Thickness"
                value={config.accentBarThickness}
                min={0}
                max={50}
                onChange={(v) => patch("accentBarThickness", v)}
              />
            </div>
          )}
        </Section>

        <Separator />

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={reset} className="gap-1.5">
            <RotateCcwIcon className="size-3.5" />
            Reset
          </Button>
          <Button variant="outline" size="sm" onClick={copyJson} className="gap-1.5">
            <CopyIcon className="size-3.5" />
            {copied ? "Copied!" : "Copy config JSON"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={renderPreview}
            disabled={previewLoading}
            className="gap-1.5"
          >
            <RefreshCwIcon className="size-3.5" />
            Re-render
          </Button>
        </div>
      </div>

      {/* ── Right: live preview ───────────────────────────────────────── */}
      <div className="space-y-3">
        <div
          className="aspect-square rounded-xl border overflow-hidden relative"
          style={{
            backgroundColor: "var(--card-warm-bg)",
            borderColor: "var(--card-warm-border)",
          }}
        >
          {previewSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewSrc}
              alt="Preview"
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[12px] text-[var(--overview-fg)]/45">
              {previewError ? `Error: ${previewError}` : "Rendering…"}
            </div>
          )}
          {previewLoading && previewSrc && (
            <div className="absolute top-2 right-2 inline-flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-[10px] text-white">
              <LoaderIcon className="size-3 animate-spin" />
              Rendering
            </div>
          )}
        </div>
        <p className="text-[11px] text-[var(--overview-fg)]/45 leading-relaxed">
          Preview is live (debounced 250ms). Output is the same{" "}
          <code className="font-mono">renderSquareQuoteCard</code> the cron
          uses, so what you see here is exactly what Buffer would receive.
          Saving back to the database is intentionally disabled — the cron
          reads Alex&apos;s Facebook template, and editing it would change
          Alex&apos;s renders too. Use{" "}
          <span className="text-[var(--overview-fg)]/65">
            Copy config JSON
          </span>{" "}
          and hand off when ready.
        </p>
      </div>
    </div>
  );
}

/* ── Tiny presentational helpers ─────────────────────────────────────── */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl border px-4 py-3"
      style={{
        backgroundColor: "var(--card-warm-bg)",
        borderColor: "var(--card-warm-border)",
      }}
    >
      <div className="text-[10px] font-medium tracking-[0.18em] uppercase text-[var(--overview-fg)]/55 mb-3">
        {title}
      </div>
      {children}
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-[10px] uppercase tracking-[0.14em] text-[var(--overview-fg)]/55">
        {label}
      </Label>
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
        className="h-9 text-[12px] font-mono"
      />
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-[10px] uppercase tracking-[0.14em] text-[var(--overview-fg)]/55">
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-9 rounded-md border cursor-pointer"
          style={{ borderColor: "var(--card-warm-border)" }}
        />
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 text-[12px] font-mono flex-1 min-w-0"
          placeholder="#ffffff"
        />
      </div>
    </div>
  );
}
