import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/dialer/core";
import {
  CATCHALL_SYSTEM_PROMPT,
  BOOKING_SECTION_START,
  BOOKING_SECTION_END,
  withBookingSection,
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
  // owner connected is what gets attached. Connecting Google Calendar in the
  // dashboard only stores the OAuth credential — the tools are a separate
  // step there — so when the credential is present and no calendar tools
  // exist yet, create the two Google ones here.
  const listTools = async (): Promise<VapiTool[]> => {
    const r = await fetch(`${VAPI}/tool?limit=200`, { headers: auth });
    return r.ok ? (((await r.json().catch(() => [])) as VapiTool[]) || []) : [];
  };
  let allTools = await listTools();
  const credResp = await fetch(`${VAPI}/credential?limit=200`, { headers: auth });
  const credentials: any[] = credResp.ok ? (((await credResp.json().catch(() => [])) as any[]) || []) : [];
  const credentialProviders = credentials.map((c) => String(c?.provider || c?.type || "unknown"));
  const hasGoogleCalendar = credentialProviders.some((p) => /google.*calendar/i.test(p));

  const created: Array<{ type: string; ok: boolean; detail?: string }> = [];
  if (!pickCalendarTools(allTools) && hasGoogleCalendar && !inspectOnly) {
    const wanted = [
      {
        type: "google.calendar.availability.check",
        name: DEFAULT_NAMES["google.calendar.availability.check"],
        description:
          "Check Montivaro's calendar for free 15-minute slots in a date/time window. Call before booking.",
      },
      {
        type: "google.calendar.event.create",
        name: DEFAULT_NAMES["google.calendar.event.create"],
        description:
          "Book the 15-minute Montivaro setup call on the calendar. Always include the caller's email in attendees so they receive the invite.",
      },
    ];
    // Native tool DTOs carry name/description under `function` (top-level
    // name/description are rejected). Fall back to a bare create — the
    // naming pass below fills the name in afterwards.
    for (const spec of wanted) {
      if (allTools.some((t) => t.type === spec.type)) continue;
      const attempts = [
        { type: spec.type, function: { name: spec.name, description: spec.description } },
        { type: spec.type },
      ];
      let outcome: { ok: boolean; detail?: string } = { ok: false };
      for (const body of attempts) {
        const r = await fetch(`${VAPI}/tool`, {
          method: "POST",
          headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j: any = await r.json().catch(() => ({}));
        const msg = Array.isArray(j?.message) ? j.message.join(",") : j?.message;
        outcome = { ok: r.ok, detail: r.ok ? j?.id : String(msg || r.status) };
        if (r.ok) break;
      }
      created.push({ type: spec.type, ...outcome });
    }
    allTools = await listTools();
  }
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
      body: JSON.stringify({ function: { name } }),
    });
    if (!r.ok) console.error(`sync-config: could not name tool ${t.id} (${r.status})`);
    return name;
  };

  // Video is offered only once the owner's Meet room is configured — the
  // same variable lib/setupCalls reads when it writes the texts and invite.
  const video = Boolean(process.env.SETUP_CALL_VIDEO_URL?.trim());
  let booking:
    | { provider: Provider; availabilityTool: string; bookingTool: string; contactTool?: string; video: boolean }
    | null = null;
  if (calendar) {
    booking = {
      provider: calendar.provider,
      availabilityTool: await ensureNamed(calendar.availability),
      bookingTool: await ensureNamed(calendar.booking),
      contactTool: calendar.contact ? await ensureNamed(calendar.contact) : undefined,
      video,
    };
  }

  const toolIds = calendar
    ? [calendar.availability.id, calendar.booking.id, ...(calendar.contact ? [calendar.contact.id] : [])]
    : [];

  // The personality prompt is the owner's — written in the Vapi dashboard.
  // Keep it verbatim and only manage the booking block appended to it.
  const currentMessages: any[] = Array.isArray(current?.model?.messages) ? current.model.messages : [];
  const currentSystem: string =
    currentMessages.find((m) => m?.role === "system")?.content ||
    current?.model?.systemPrompt ||
    "";
  const basePrompt = currentSystem.trim() ? currentSystem : CATCHALL_SYSTEM_PROMPT;
  const stripBooking = (p: string) => {
    const s = p.indexOf(BOOKING_SECTION_START);
    const e = p.indexOf(BOOKING_SECTION_END);
    return s !== -1 && e !== -1 && e > s ? (p.slice(0, s) + p.slice(e + BOOKING_SECTION_END.length)).trimEnd() : p;
  };
  const systemPrompt = booking ? withBookingSection(basePrompt, booking) : stripBooking(basePrompt);
  const otherMessages = currentMessages.filter((m) => m?.role !== "system");

  // PATCHing `model` replaces the whole object, so carry the live model
  // settings forward and only change messages + tools.
  const model = {
    ...(current?.model || {}),
    provider: current?.model?.provider || "anthropic",
    model: current?.model?.model || "claude-sonnet-4-5-20250929",
    messages: [{ role: "system", content: systemPrompt }, ...otherMessages],
    toolIds,
  };
  delete (model as any).tools;
  delete (model as any).systemPrompt;

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
            setupCallMode: {
              type: "string",
              enum: ["phone", "video"],
              description: "If a setup call was booked: 'video' if the caller chose a video call, otherwise 'phone'",
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
    credentialProviders,
    hasGoogleCalendar,
    createdTools: created,
    booking,
    toolIds,
    promptSource: currentSystem.trim() ? "dashboard" : "code",
    currentPromptHead: basePrompt.slice(0, 400),
    promptHasBookingBlock: basePrompt.includes(BOOKING_SECTION_START),
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
