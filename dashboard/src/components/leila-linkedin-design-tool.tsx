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
import {
  CopyIcon,
  RotateCcwIcon,
  LoaderIcon,
  RefreshCwIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import {
  DEFAULT_TEMPLATE_CONFIG,
  type TemplateConfig,
} from "@/lib/template-types";

const SAMPLE_TWEETS = [
  "Hire slow. Fire fast. The best teams aren't built by accident — they're built by people willing to make uncomfortable decisions early.",
  "Stop optimizing what shouldn't exist.",
  "Most people don't have a marketing problem. They have a clarity problem.",
];

// Locked-in choices for Leila's LinkedIn quote cards. The corresponding
// color pickers are intentionally absent from the UI so the operator can't
// drift away from the agreed visual identity. Other fields stay editable.
const LOCKED_BACKGROUND = "#000000";
const LOCKED_TEXT = "#ffffff";

// Mirror of the server-side cap in /api/templates/preview/route.ts. Caught
// client-side too so the user gets a fast, descriptive error instead of a
// failed request after the upload completes.
const MAX_HEADER_BYTES = 5 * 1024 * 1024;

function applyLockedColors(c: TemplateConfig): TemplateConfig {
  return { ...c, backgroundColor: LOCKED_BACKGROUND, textColor: LOCKED_TEXT };
}

interface DesignToolProps {
  /** Server-fetched starting config — falls back to DEFAULT_TEMPLATE_CONFIG. */
  initialConfig: TemplateConfig | null;
}

export function LeilaLinkedInDesignTool({ initialConfig }: DesignToolProps) {
  const startingConfig = useMemo<TemplateConfig>(
    () => applyLockedColors(initialConfig ?? DEFAULT_TEMPLATE_CONFIG),
    [initialConfig],
  );
  const [config, setConfig] = useState<TemplateConfig>(startingConfig);
  const [text, setText] = useState<string>(SAMPLE_TWEETS[0]);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Custom header image: when set, sent as a data URL with each preview
  // request. When null, the server falls back to the default Header.png.
  const [headerImageDataUrl, setHeaderImageDataUrl] = useState<string | null>(null);
  const [headerImageName, setHeaderImageName] = useState<string | null>(null);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
        body: JSON.stringify({
          text,
          config,
          ...(headerImageDataUrl ? { headerImageDataUrl } : {}),
        }),
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
  }, [text, config, headerImageDataUrl]);

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
    clearHeaderImage();
  }

  async function copyJson() {
    await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function onHeaderFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setHeaderError(null);
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setHeaderError(`Not an image file: ${file.type || "unknown type"}`);
      return;
    }
    if (file.size > MAX_HEADER_BYTES) {
      setHeaderError(
        `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB) — max 5MB`,
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        setHeaderError("Failed to read file as data URL");
        return;
      }
      setHeaderImageDataUrl(result);
      setHeaderImageName(file.name);
    };
    reader.onerror = () => setHeaderError("FileReader error");
    reader.readAsDataURL(file);
  }

  function clearHeaderImage() {
    setHeaderImageDataUrl(null);
    setHeaderImageName(null);
    setHeaderError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
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
            <LockedColorField label="Background" value={LOCKED_BACKGROUND} />
            <LockedColorField label="Text" value={LOCKED_TEXT} />
            <ColorField
              label="Accent"
              value={config.accentColor}
              onChange={(v) => patch("accentColor", v)}
            />
          </div>
          <p className="text-[10px] text-[var(--overview-fg)]/40 mt-2 leading-relaxed">
            Background and text are locked at #000000 / #ffffff. Accent
            stays editable.
          </p>
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
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
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

              {/* Header image upload — overrides the default Header.png on
                  the preview only. The cron will keep using the on-disk
                  default until a creator-scoped header is wired in. */}
              <div className="flex flex-col gap-2">
                <Label className="text-[10px] uppercase tracking-[0.14em] text-[var(--overview-fg)]/55">
                  Header image
                </Label>
                <div className="flex items-center gap-3">
                  {headerImageDataUrl ? (
                    <div
                      className="size-14 rounded-md border overflow-hidden bg-black/40 shrink-0"
                      style={{ borderColor: "var(--card-warm-border)" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={headerImageDataUrl}
                        alt="Custom header preview"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div
                      className="size-14 rounded-md border flex items-center justify-center text-[10px] text-[var(--overview-fg)]/40 shrink-0"
                      style={{ borderColor: "var(--card-warm-border)" }}
                    >
                      default
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        className="gap-1.5 h-8"
                      >
                        <UploadIcon className="size-3.5" />
                        {headerImageDataUrl ? "Replace" : "Upload"}
                      </Button>
                      {headerImageDataUrl && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={clearHeaderImage}
                          className="gap-1.5 h-8"
                        >
                          <XIcon className="size-3.5" />
                          Clear
                        </Button>
                      )}
                    </div>
                    <span className="text-[11px] text-[var(--overview-fg)]/55 truncate">
                      {headerImageName ??
                        "Using public/ig-pipeline/Header.png (Alex's default)"}
                    </span>
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={onHeaderFileChange}
                />
                {headerError && (
                  <p className="text-[11px] text-red-400">{headerError}</p>
                )}
                <p className="text-[10px] text-[var(--overview-fg)]/40 leading-relaxed">
                  Preview-only. PNG/JPEG/WebP/GIF, max 5MB. Uploaded image
                  isn&apos;t stored anywhere — it lives in your browser
                  until you clear it or refresh the page.
                </p>
              </div>
            </>
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

/** Read-only color row for fields the operator isn't allowed to change. */
function LockedColorField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5 opacity-70">
      <Label className="text-[10px] uppercase tracking-[0.14em] text-[var(--overview-fg)]/55">
        {label}
        <span className="ml-1 text-[9px] tracking-wider text-[var(--overview-fg)]/35">
          (locked)
        </span>
      </Label>
      <div className="flex items-center gap-2">
        <div
          aria-hidden
          className="h-9 w-9 rounded-md border"
          style={{
            backgroundColor: value,
            borderColor: "var(--card-warm-border)",
          }}
        />
        <Input
          type="text"
          value={value}
          readOnly
          className="h-9 text-[12px] font-mono flex-1 min-w-0 cursor-not-allowed"
          tabIndex={-1}
        />
      </div>
    </div>
  );
}
