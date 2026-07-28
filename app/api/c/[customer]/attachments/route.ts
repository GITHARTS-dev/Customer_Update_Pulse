import { NextResponse } from "next/server";
import { getCustomer } from "@/lib/customers";
import { resolveProgrammes, byIdOf } from "@/lib/programme-store";
import { uploadFileToSiteDrive } from "@/lib/sharepoint";
import { isoWeek } from "@/lib/helpers";
import type { Attachment } from "@/lib/types";

export const runtime = "nodejs";

const SITE_ID = process.env.SHAREPOINT_SITE_ID ?? "";
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB per file

interface RouteContext {
  params: Promise<{ customer: string }>;
}

function safeName(name: string): string {
  return name.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "file";
}

/**
 * Uploads one or more files for a programme's weekly check-in. Files are stored
 * in the SharePoint document library, foldered by customer, and never read by
 * Claude - they exist purely for the CEO to open from the Signals card.
 */
export async function POST(req: Request, ctx: RouteContext) {
  const { customer: cid } = await ctx.params;
  const customer = getCustomer(cid);
  if (!customer) {
    return NextResponse.json({ error: "Unknown customer" }, { status: 404 });
  }
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
  if (!byIdOf(await resolveProgrammes(customer))[programmeId]) {
    return NextResponse.json({ error: `Unknown programme: ${programmeId}` }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return NextResponse.json({ uploaded: [], failed: [] });
  }

  const week = isoWeek(new Date());
  const uploaded: Attachment[] = [];
  const failed: Array<{ name: string; error: string }> = [];

  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      failed.push({ name: file.name, error: "file is larger than 25 MB" });
      continue;
    }
    const path = `PulseAttachments/${customer.id}/${programmeId}/w${week}/${Date.now()}-${safeName(file.name)}`;
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
