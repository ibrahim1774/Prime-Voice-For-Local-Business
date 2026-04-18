import { NextRequest, NextResponse } from "next/server";

const GHL_API_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const APPOINTMENT_DURATION_MIN = 30;

interface BookAppointmentArgs {
  name?: string;
  phone?: string;
  businessName?: string;
  preferredDateTimeISO?: string;
}

interface VapiToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string | BookAppointmentArgs };
}

interface VapiMessage {
  type?: string;
  toolCalls?: VapiToolCall[];
  toolCallList?: VapiToolCall[];
  call?: { id?: string; customer?: { number?: string } };
  endedReason?: string;
  summary?: string;
  durationSeconds?: number;
  analysis?: { structuredData?: Record<string, unknown> };
}

interface VapiWebhookPayload {
  message?: VapiMessage;
}

function parseArgs(raw: string | BookAppointmentArgs): BookAppointmentArgs {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as BookAppointmentArgs;
    } catch {
      return {};
    }
  }
  return raw ?? {};
}

function formatForHuman(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function upsertContact(args: BookAppointmentArgs, callerPhone?: string): Promise<string> {
  const apiKey = process.env.GHL_API_KEY!;
  const locationId = process.env.GHL_LOCATION_ID!;

  const [firstName, ...rest] = (args.name || "").trim().split(/\s+/);
  const lastName = rest.join(" ");

  const res = await fetch(`${GHL_API_BASE}/contacts/upsert`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Version: GHL_VERSION,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      locationId,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      phone: args.phone || callerPhone,
      companyName: args.businessName,
      source: "/call tap-to-dial",
      tags: ["call-intake"],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GHL contact upsert failed: ${res.status} ${err}`);
  }

  const data = await res.json();
  const contactId = data?.contact?.id || data?.id;
  if (!contactId) throw new Error("GHL contact upsert returned no contact id");
  return contactId;
}

async function createAppointment(
  contactId: string,
  args: BookAppointmentArgs
): Promise<void> {
  const apiKey = process.env.GHL_API_KEY!;
  const calendarId = process.env.GHL_CALENDAR_ID!;
  const locationId = process.env.GHL_LOCATION_ID!;

  const start = new Date(args.preferredDateTimeISO!);
  if (Number.isNaN(start.getTime())) {
    throw new Error(`Invalid preferredDateTimeISO: ${args.preferredDateTimeISO}`);
  }
  const end = new Date(start.getTime() + APPOINTMENT_DURATION_MIN * 60 * 1000);

  const res = await fetch(`${GHL_API_BASE}/calendars/events/appointments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Version: GHL_VERSION,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      calendarId,
      locationId,
      contactId,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      title: args.businessName ? `Setup call — ${args.businessName}` : `Setup call — ${args.name || "New lead"}`,
      appointmentStatus: "confirmed",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GHL appointment create failed: ${res.status} ${err}`);
  }
}

async function fireMetaSchedule(request: NextRequest): Promise<void> {
  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!accessToken) return;
  const PIXEL_ID = "26490568997297314";
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const userAgent = request.headers.get("user-agent") || "";
  await fetch(
    `https://graph.facebook.com/v21.0/${PIXEL_ID}/events?access_token=${accessToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [
          {
            event_name: "Schedule",
            event_time: Math.floor(Date.now() / 1000),
            action_source: "phone_call",
            user_data: { client_ip_address: ip, client_user_agent: userAgent },
          },
        ],
      }),
    }
  ).catch((e) => console.error("Meta CAPI Schedule fire failed:", e));
}

async function handleBook(
  toolCall: VapiToolCall,
  callerPhone: string | undefined,
  request: NextRequest
): Promise<{ toolCallId: string; result: string }> {
  const args = parseArgs(toolCall.function.arguments);

  if (!args.name || !args.preferredDateTimeISO || !(args.phone || callerPhone)) {
    return {
      toolCallId: toolCall.id,
      result:
        "I'm missing a piece — I need your name, callback number, and a day/time that works. Can you walk me through that again?",
    };
  }

  try {
    const contactId = await upsertContact(args, callerPhone);
    await createAppointment(contactId, args);
    await fireMetaSchedule(request);

    const human = formatForHuman(args.preferredDateTimeISO);
    return {
      toolCallId: toolCall.id,
      result: `Booked for ${human}. Confirmation text is on the way.`,
    };
  } catch (err) {
    console.error("[vapi-webhook] booking error:", err);
    return {
      toolCallId: toolCall.id,
      result:
        "I hit a snag on my end booking that — I've got your info saved and someone from the team will reach out within the hour to lock it in.",
    };
  }
}

function verifySecret(request: NextRequest): boolean {
  const expected = process.env.VAPI_WEBHOOK_SECRET;
  if (!expected) return true;
  return request.headers.get("x-vapi-secret") === expected;
}

export async function POST(request: NextRequest) {
  if (!verifySecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: VapiWebhookPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const msg = payload.message;
  if (!msg) return NextResponse.json({ ok: true });

  const toolCalls = msg.toolCalls || msg.toolCallList;
  if (msg.type === "tool-calls" && toolCalls?.length) {
    const callerPhone = msg.call?.customer?.number;
    const results = await Promise.all(
      toolCalls.map((tc) => {
        if (tc.function?.name === "bookAppointment") {
          return handleBook(tc, callerPhone, request);
        }
        return {
          toolCallId: tc.id,
          result: `Unknown tool: ${tc.function?.name}`,
        };
      })
    );
    return NextResponse.json({ results });
  }

  if (msg.type === "end-of-call-report") {
    console.log("[vapi-webhook] call ended", {
      callId: msg.call?.id,
      durationSeconds: msg.durationSeconds,
      endedReason: msg.endedReason,
      summary: msg.summary,
      structuredData: msg.analysis?.structuredData,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
