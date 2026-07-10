import { NextRequest, NextResponse } from "next/server";
import {
  ensureSchema,
  getSetting,
  isAuthed,
  normalizePhone,
  setSetting,
  unauthorized,
  DEFAULT_VM_SCRIPT,
  DIALABLE_SEGMENTS,
} from "@/lib/dialer/core";

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return unauthorized();
  await ensureSchema();
  const [agentPhone, vmScript, templates, lines, callerId, dialSegment, dialState] = await Promise.all([
    getSetting("agent_phone"),
    getSetting("vm_script"),
    getSetting("sms_templates"),
    getSetting("lines"),
    getSetting("caller_id"),
    getSetting("dial_segment"),
    getSetting("dial_state"),
  ]);
  return NextResponse.json({
    agentPhone,
    vmScript: vmScript || DEFAULT_VM_SCRIPT,
    lines: Math.min(3, Math.max(1, Number(lines) || 1)),
    callerId: callerId || "auto",
    dialSegment: dialSegment || "new",
    dialState: dialState || "",
    templates: templates
      ? JSON.parse(templates)
      : [
          "Hi {{name}}, this is Ibrahim from Montivaro — great talking with you about {{business}}. Hear the AI receptionist live: call (928) 968-9136. Book a setup call: montivaro.com/bookcall",
          "Hi {{name}}, Ibrahim from Montivaro here. We make sure {{business}} never misses a customer call with a 24/7 AI receptionist. Book a time: montivaro.com/bookcall",
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
  if (body.lines !== undefined) {
    await setSetting("lines", String(Math.min(3, Math.max(1, Number(body.lines) || 1))));
  }
  if (typeof body.callerId === "string") {
    // "auto" clears the pin (back to local-presence matching); otherwise it
    // must be a real E.164 number the account owns.
    const v = body.callerId.trim();
    await setSetting("caller_id", v === "auto" || /^\+\d{10,15}$/.test(v) ? (v === "auto" ? "" : v) : "");
  }
  if (typeof body.dialSegment === "string") {
    const v = body.dialSegment.trim();
    await setSetting("dial_segment", (DIALABLE_SEGMENTS as readonly string[]).includes(v) ? v : "new");
  }
  if (typeof body.dialState === "string") {
    await setSetting("dial_state", body.dialState.trim().toUpperCase().slice(0, 2));
  }
  if (Array.isArray(body.templates)) {
    await setSetting(
      "sms_templates",
      JSON.stringify(body.templates.map((t: any) => String(t).slice(0, 640)).slice(0, 10))
    );
  }
  return NextResponse.json({ ok: true });
}
