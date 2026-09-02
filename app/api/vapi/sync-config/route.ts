import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/dialer/core";
import {
  CATCHALL_SYSTEM_PROMPT,
  buildCatchallBookingPrompt,
} from "@/lib/catchall-config.mjs";

// One-shot config sync for the catch-all demo assistant.
//
// The Vapi private key only exists in the Vercel env, so assistant config is
// applied from here instead of a local script. POST with the shared secret in
// x-vapi-secret and this endpoint
//   - points the assistant's server URL at /api/vapi/call-report, subscribes
//     it to end-of-call reports, turns on recording, installs the summary +
//     structured-data analysis plan;
//   - finds the calendar tools connected in the Vapi dashboard (Google
//     Calendar first, GoHighLevel as the fallback), attaches them to the
//     assistant, and swaps in the booking-aware system prompt that names them.
//     The chosen tool names land in app_config so the call-report webhook can
//     recognise the booking the assistant made.
// Body { "action": "inspect" } only reports what it would do.
// Idempotent — safe to re-run after any config change.

export const maxDuration = 60;

const CATCHALL_ASSISTANT_ID = "52081d54-3e98-4213-88cc-b618985a1d9b";
const CALL_REPORT_URL = "https://www.montivaro.com/api/vapi/call-report";
const VAPI = "https://api.vapi.ai";

type Provider = "google" | "ghl";

interface VapiTool {
  id: string;
  type: string;
  name?: string;
  function?: { name?: string };
}

interface CalendarTools {
  provider: Provider;
  availability: VapiTool;
  booking: VapiTool;
  contact?: VapiTool;
}

const DEFAULT_NAMES: Record<string, string> = {
  "google.calendar.availability.check": "check_calendar_availability",
  "google.calendar.event.create": "book_setup_call",
  "gohighlevel.calendar.availability.check": "check_calendar_availability",
  "gohighlevel.calendar.event.create": "book_setup_call",
  "gohighlevel.contact.create": "create_contact",
};

function toolName(t: VapiTool): string {
  return (t.name || t.function?.name || DEFAULT_NAMES[t.type] || t.type).trim();
}

function pickCalendarTools(tools: VapiTool[]): CalendarTools | null {
  const byType = (type: string) => tools.find((t) => t.type === type);
  const gAvail = byType("google.calendar.availability.check");
  const gCreate = byType("google.calendar.event.create");
  if (gAvail && gCreate) return { provider: "google", availability: gAvail, booking: gCreate };
  const hAvail = byType("gohighlevel.calendar.availability.check");
  const hCreate = byType("gohighlevel.calendar.event.create");
  if (hAvail && hCreate) {
    return {
      provider: "ghl",
      availability: hAvail,
      booking: hCreate,
      contact: byType("gohighlevel.contact.create"),
    };
  }
  return null;
}

async function setConfig(key: string, value: string) {
  await sql()`
    INSERT INTO app_config (key, value, updated_at) VALUES (${key}, ${value}, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
}

export async function POST(request: NextRequest) {
  const secret = process.env.VAPI_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "VAPI_WEBHOOK_SECRET not set" }, { status: 503 });
  }
  if (request.headers.get("x-vapi-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const vapiKey = process.env.VAPI_API_KEY?.trim();
  if (!vapiKey) {
    return NextResponse.json({ error: "VAPI_API_KEY not set" }, { status: 503 });
  }
  const body: any = await request.json().catch(() => ({}));
  const inspectOnly = body?.action === "inspect";

  const auth = { Authorization: `Bearer ${vapiKey}` };

  const currentResp = await fetch(`${VAPI}/assistant/${CATCHALL_ASSISTANT_ID}`, { headers: auth });
  if (!currentResp.ok) {
    return NextResponse.json(
      { error: `Vapi GET assistant failed (${currentResp.status})` },
      { status: 502 }
    );
  }
  const current: any = await currentResp.json();
  const previousServerUrl: string | null = current?.server?.url || current?.serverUrl || null;

  // Calendar tools live at the org level (Dashboard → Tools). Whatever the
  // owner connected is what gets attached; nothing is created here.
  const toolsResp = await fetch(`${VAPI}/tool?limit=200`, { headers: auth });
  const allTools: VapiTool[] = toolsResp.ok ? ((await toolsResp.json().catch(() => [])) as VapiTool[]) : [];
  const calendar = pickCalendarTools(allTools);

  // Give unnamed native tools a stable name — the prompt has to refer to the
  // tool by name, and the call-report webhook matches the booking on it.
  const ensureNamed = async (t: VapiTool): Promise<string> => {
    const existing = (t.name || t.function?.name || "").trim();
    if (existing) return existing;
    const name = DEFAULT_NAMES[t.type] || t.type.replace(/\W+/g, "_");
    if (inspectOnly) return name;
    const r = await fetch(`${VAPI}/tool/${t.id}`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!r.ok) console.error(`sync-config: could not name tool ${t.id} (${r.status})`);
    return name;
  };

  let booking: { provider: Provider; availabilityTool: string; bookingTool: string; contactTool?: string } | null = null;
  if (calendar) {
    booking = {
      provider: calendar.provider,
      availabilityTool: await ensureNamed(calendar.availability),
      bookingTool: await ensureNamed(calendar.booking),
      contactTool: calendar.contact ? await ensureNamed(calendar.contact) : undefined,
    };
  }

  const toolIds = calendar
    ? [calendar.availability.id, calendar.booking.id, ...(calendar.contact ? [calendar.contact.id] : [])]
    : [];

  const systemPrompt = booking ? buildCatchallBookingPrompt(booking) : CATCHALL_SYSTEM_PROMPT;

  // PATCHing `model` replaces the whole object, so carry the live model
  // settings forward and only change messages + tools.
  const model = {
    ...(current?.model || {}),
    provider: current?.model?.provider || "anthropic",
    model: current?.model?.model || "claude-sonnet-4-5-20250929",
    messages: [{ role: "system", content: systemPrompt }],
    toolIds,
  };
  delete (model as any).tools;

  const patch = {
    server: { url: CALL_REPORT_URL, secret },
    serverMessages: ["end-of-call-report"],
    artifactPlan: { recordingEnabled: true },
    model,
    analysisPlan: {
      summaryPlan: {
        enabled: true,
        messages: [
          {
            role: "system",
            content:
              "Summarize this call in 2-3 short sentences for an SMS lead alert to a business owner: who called, what their business is, and what they wanted. If a setup call was booked, say when. Plain text, no preamble.",
          },
          { role: "user", content: "{{transcript}}" },
        ],
      },
      structuredDataPlan: {
        enabled: true,
        schema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "The caller's name, if they gave one",
            },
            businessName: {
              type: "string",
              description: "The caller's business name, if mentioned",
            },
            businessType: {
              type: "string",
              description:
                "What kind of business the caller runs (e.g. plumbing, salon)",
            },
            reasonForCall: {
              type: "string",
              description: "Why they called / what they asked about",
            },
            email: {
              type: "string",
              description: "The caller's email address exactly as confirmed on the call, if given",
            },
            bookedSetupCall: {
              type: "boolean",
              description:
                "true ONLY if the assistant confirmed a specific day and time for a Montivaro setup call with the caller",
            },
            setupCallStart: {
              type: "string",
              description:
                "If a setup call was booked: its start in ISO 8601 (e.g. 2026-09-09T10:00:00) in the caller's time zone",
            },
            setupCallTimeZone: {
              type: "string",
              description: "If a setup call was booked: the caller's IANA time zone (e.g. America/Phoenix)",
            },
            qualified: {
              type: "boolean",
              description:
                "true ONLY if the caller actually shared details about their business (its name, what kind of business it is, or what they do). false if they said little or nothing about a business.",
            },
          },
        },
      },
    },
  };

  const report = {
    assistant: CATCHALL_ASSISTANT_ID,
    previousServerUrl,
    currentToolIds: current?.model?.toolIds || [],
    orgTools: allTools.map((t) => ({ id: t.id, type: t.type, name: toolName(t) })),
    booking,
    toolIds,
  };

  if (inspectOnly) return NextResponse.json({ ok: true, inspect: true, ...report });

  const patchResp = await fetch(`${VAPI}/assistant/${CATCHALL_ASSISTANT_ID}`, {
    method: "PATCH",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const patched: any = await patchResp.json().catch(() => ({}));
  if (!patchResp.ok) {
    return NextResponse.json(
      {
        error: `Vapi PATCH failed (${patchResp.status})`,
        detail: patched?.message || null,
        ...report,
      },
      { status: 502 }
    );
  }

  try {
    await ensureSchema();
    await setConfig("catchall_booking_provider", booking?.provider || "");
    await setConfig("catchall_booking_tool", booking?.bookingTool || "");
    await setConfig("catchall_availability_tool", booking?.availabilityTool || "");
  } catch (err) {
    console.error("sync-config: could not store booking tool names", err);
  }

  return NextResponse.json({
    ok: true,
    ...report,
    serverUrl: patched?.server?.url || CALL_REPORT_URL,
    recording: patched?.artifactPlan?.recordingEnabled ?? true,
    attachedToolIds: patched?.model?.toolIds || [],
    promptHasBooking: Boolean(booking),
  });
}
