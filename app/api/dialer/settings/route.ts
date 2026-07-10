import { NextRequest, NextResponse } from "next/server";
import {
  ensureSchema,
  getSetting,
  isAuthed,
  normalizePhone,
  setSetting,
  unauthorized,
  DEFAULT_VM_SCRIPT,
} from "@/lib/dialer/core";

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const [agentPhone, vmScript, templates] = await Promise.all([
    getSetting("agent_phone"),
    getSetting("vm_script"),
    getSetting("sms_templates"),
  ]);
  return NextResponse.json({
    agentPhone,
    vmScript: vmScript || DEFAULT_VM_SCRIPT,
    templates: templates
      ? JSON.parse(templates)
      : [
          "Hi {{name}}, this is Ibrahim from Montivaro — great talking with you about {{business}}. Here's the link to book your setup call: montivaro.com/bookcall",
          "Hi {{name}}, Ibrahim from Montivaro here. We make sure {{business}} never misses a customer call with a 24/7 AI receptionist. Want a quick demo? Call (928) 968-9136 to hear it live.",
        ],
  });
}

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const body = await request.json().catch(() => ({}));
  if (typeof body.agentPhone === "string") {
    const normalized = normalizePhone(body.agentPhone);
    if (!normalized) {
      return NextResponse.json({ error: "Enter a valid phone number" }, { status: 400 });
    }
    await setSetting("agent_phone", normalized);
  }
  if (typeof body.vmScript === "string") {
    await setSetting("vm_script", body.vmScript.slice(0, 1200));
  }
  if (Array.isArray(body.templates)) {
    await setSetting(
      "sms_templates",
      JSON.stringify(body.templates.map((t: any) => String(t).slice(0, 640)).slice(0, 10))
    );
  }
  return NextResponse.json({ ok: true });
}
