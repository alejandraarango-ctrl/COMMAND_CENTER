import { AppShell } from "@/components/app-shell";
import { DetailPageHeader } from "@/components/command-center/detail-page-header";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

// Public, unauthenticated JSON snapshot maintained via git commits to the
// repo (see data/jazmin_drive_pending.json). This is intentionally NOT a
// live Google Drive API integration -- the dashboard's backend (Render)
// has no Google Drive credentials configured, and provisioning a service
// account is a deliberate follow-up decision, not something done silently
// here. Fetching the raw file straight from GitHub means the page always
// shows the latest committed snapshot without needing a redeploy -- only
// a `git push` to `data/jazmin_drive_pending.json` (same "Upload files"
// flow already used for code changes) is required to refresh it.
const DATA_URL =
  "https://raw.githubusercontent.com/alejandraarango-ctrl/COMMAND_CENTER/main/data/jazmin_drive_pending.json";

interface DriveItem {
  filename: string;
  folder: string;
  drive_url: string;
}

interface DrivePendingData {
  updated_at: string;
  reels: DriveItem[];
  youtube: DriveItem[];
}

async function getPendingData(): Promise<DrivePendingData | null> {
  try {
    // no-store: this is a snapshot file that changes out-of-band (via git
    // push, not via this app), so Next's fetch cache would otherwise
    // happily serve a stale copy for the lifetime of the deployment.
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as DrivePendingData;
  } catch {
    return null;
  }
}

function ItemsTable({ items }: { items: DriveItem[] }) {
  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow
            className="hover:bg-transparent"
            style={{ borderColor: "var(--surface-border)" }}
          >
            {["Archivo", "Carpeta", "Link"].map((h) => (
              <TableHead
                key={h}
                className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-white/40"
              >
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow
              key={item.filename}
              style={{ borderColor: "var(--surface-border)" }}
            >
              <TableCell className="max-w-md truncate text-[#edeae0]">
                {item.filename}
              </TableCell>
              <TableCell className="text-white/55">{item.folder}</TableCell>
              <TableCell>
                <a
                  href={item.drive_url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                  style={{ color: "var(--terracotta)" }}
                >
                  Ver en Drive
                </a>
              </TableCell>
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={3}
                className="h-24 text-center font-mono text-[12px] uppercase tracking-[0.12em] text-white/40"
              >
                Nada pendiente.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  );
}

export default async function DrivePendingPage() {
  const data = await getPendingData();

  return (
    <AppShell>
      <div className="cc-reveal">
        <DetailPageHeader
          eyebrow="Jazmin · Google Drive"
          title="Contenido pendiente."
          subtitle="Reels y videos de YouTube que ya están en el Drive de Jazmin pero todavía no han pasado por el pipeline (queue_jazmin_post.py / queue_youtube_video.py). Esta lista se actualiza a mano cada vez que se revisa el Drive -- no es en vivo."
        />
      </div>

      {!data ? (
        <p className="mt-8 font-mono text-[12px] uppercase tracking-[0.12em] text-white/40">
          No se pudo cargar la lista (revisa data/jazmin_drive_pending.json en GitHub).
        </p>
      ) : (
        <div className="mt-8 space-y-10">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/40">
            Última revisión: {new Date(data.updated_at).toLocaleString()}
          </p>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-white/60">
              Instagram / TikTok — Reels ({data.reels.length})
            </h2>
            <ItemsTable items={data.reels} />
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-white/60">
              YouTube — Clips / Longs ({data.youtube.length})
            </h2>
            <ItemsTable items={data.youtube} />
          </section>
        </div>
      )}
    </AppShell>
  );
}
