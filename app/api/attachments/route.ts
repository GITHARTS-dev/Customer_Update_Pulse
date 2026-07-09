import { NextResponse } from "next/server";
import { PROGRAMMES_BY_ID } from "@/lib/programmes";
import { uploadFileToSiteDrive } from "@/lib/sharepoint";
import type { Attachment } from "@/lib/types";

export const runtime = "nodejs";

const SITE_ID = process.env.SHAREPOINT_SITE_ID ?? "";
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB per file

function weekOf(date: Date): number {
  const firstJan = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date.getTime() - firstJan.getTime()) / 86400000);
  return Math.ceil((days + firstJan.getDay() + 1) / 7);
}

function safeName(name: string): string {
  // Keep letters/numbers/space/dot/dash/underscore; collapse the rest.
  return name.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "file";
}

/**
 * Uploads one or more files for a programme's weekly check-in. Files are
 * stored in the SharePoint document library and never read by Claude — they
 * exist purely for the CEO to open from the programme's Signals card.
 */
export async function POST(req: Request) {
  if (!SITE_ID) {
    return NextResponse.json(
      { error: "SharePoint is not configured (SHAREPOINT_SITE_ID)." },
      { status: 500 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const programmeId = String(form.get("programmeId") ?? "");
  if (!PROGRAMMES_BY_ID[programmeId]) {
    return NextResponse.json({ error: `Unknown programme: ${programmeId}` }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return NextResponse.json({ uploaded: [], failed: [] });
  }

  const week = weekOf(new Date());
  const uploaded: Attachment[] = [];
  const failed: Array<{ name: string; error: string }> = [];

  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      failed.push({ name: file.name, error: "file is larger than 25 MB" });
      continue;
    }
    // Timestamp prefix keeps re-uploads of the same filename from colliding.
    const path = `PulseAttachments/${programmeId}/w${week}/${Date.now()}-${safeName(file.name)}`;
    const bytes = await file.arrayBuffer();
    const res = await uploadFileToSiteDrive(
      SITE_ID,
      path,
      bytes,
      file.type || "application/octet-stream"
    );
    if (res.ok) {
      uploaded.push({ name: file.name, url: res.data.url });
    } else {
      failed.push({
        name: file.name,
        error: `${res.reason}${res.status ? " " + res.status : ""}`
      });
    }
  }

  if (uploaded.length === 0) {
    return NextResponse.json(
      { error: `Could not upload: ${failed.map((f) => `${f.name} (${f.error})`).join("; ")}` },
      { status: 502 }
    );
  }

  return NextResponse.json({ uploaded, failed });
}
