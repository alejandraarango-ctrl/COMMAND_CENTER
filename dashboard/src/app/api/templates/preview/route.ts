/**
 * POST /api/templates/preview
 *
 * Renders a live preview of a quote card template. Takes sample text and a
 * template config, returns a base64-encoded PNG image. Used by the template
 * designer for real-time preview as the user tweaks design settings.
 *
 * Body: { text: string, config: TemplateConfig, headerImageDataUrl?: string }
 * Returns: { image: "data:image/png;base64,..." }
 *
 * `headerImageDataUrl` is optional — when provided, those bytes replace the
 * default Header.png for the render. Used by the Leila LinkedIn design
 * sandbox so an operator can preview a candidate header before any of it
 * is committed to disk.
 *
 * No Supabase Storage upload — this is a transient preview only.
 */

import { NextRequest, NextResponse } from "next/server";
import { renderSquareQuoteCard } from "@/lib/square-canvas-render";
import { verifyApiAuth } from "@/lib/auth";
import type { TemplateConfig } from "@/lib/template-types";

// Cap on the decoded header buffer. node-canvas decoding is the expensive
// step, and a bigger image means a bigger render time + memory spike on
// the standard-plan dashboard. 5MB comfortably fits any reasonable PNG/JPEG
// at 2× the canvas dimensions.
const MAX_HEADER_BYTES = 5 * 1024 * 1024;

const HEADER_DATA_URL_PATTERN = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=]+)$/;

type DecodeResult =
  | { ok: true; buffer: Buffer }
  | { ok: false; error: string };

function decodeHeaderDataUrl(dataUrl: string): DecodeResult {
  const match = HEADER_DATA_URL_PATTERN.exec(dataUrl);
  if (!match) {
    return {
      ok: false,
      error: "headerImageDataUrl must be a data:image/{png,jpeg,webp,gif};base64,... URL",
    };
  }
  const buf = Buffer.from(match[2], "base64");
  if (buf.length === 0) {
    return { ok: false, error: "headerImageDataUrl is empty after base64 decode" };
  }
  if (buf.length > MAX_HEADER_BYTES) {
    return { ok: false, error: `headerImageDataUrl exceeds ${MAX_HEADER_BYTES} bytes` };
  }
  return { ok: true, buffer: buf };
}

export async function POST(req: NextRequest) {
  if (!(await verifyApiAuth(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { text, config, headerImageDataUrl } = (await req.json()) as {
      text: string;
      config: TemplateConfig;
      headerImageDataUrl?: string;
    };

    if (!text || !config) {
      return NextResponse.json(
        { error: "text and config are required" },
        { status: 400 }
      );
    }

    let headerImageBuffer: Buffer | undefined;
    if (headerImageDataUrl) {
      const decoded = decodeHeaderDataUrl(headerImageDataUrl);
      if (!decoded.ok) {
        return NextResponse.json({ error: decoded.error }, { status: 400 });
      }
      headerImageBuffer = decoded.buffer;
    }

    const pngBuffer = await renderSquareQuoteCard(text, config, {
      headerImageBuffer,
    });
    const base64 = pngBuffer.toString("base64");

    return NextResponse.json({
      image: `data:image/png;base64,${base64}`,
    });
  } catch (e) {
    console.error("Template preview error:", e);
    return NextResponse.json(
      { error: "Failed to render preview" },
      { status: 500 }
    );
  }
}
