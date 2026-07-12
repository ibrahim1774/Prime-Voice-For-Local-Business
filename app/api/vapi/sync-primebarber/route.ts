import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/dialer/core";

// One-shot wiring + number provisioning for the Prime Barber demo assistant.
//
// The assistant itself (prompt, voice, model, first message) is owned in the
// Vapi dashboard — this endpoint never touches those. Like /api/vapi/
// sync-config, the Vapi private key only exists in the Vercel env, so POST
// here (shared secret in x-vapi-secret) and it will
//   1. point the assistant's server URL at /api/vapi/call-report, subscribe
//      it to end-of-call reports, turn on recording, install the barber
//      summary + structured-data analysis plan (powers the SMS qualified
//      gate and the dialer's Custom Demo Calls page), and set fast
//      turn-taking so the assistant doesn't pause long before answering,
//   2. provision a free dedicated Vapi phone number pointed at it (once —
//      the number is remembered in app_config and reused forever, and
//      re-bound if it ever drifts to a stale assistant),
//   3. store the number in app_config, where /api/vapi/primebarber-config
//      serves it to the /primebarber page.
// Idempotent — safe to re-run after any config change.

export const maxDuration = 60;

// Created by the user in the Vapi dashboard (prompt + voice configured there).
const PRIMEBARBER_ASSISTANT_ID = "52d9dbcd-a215-4794-8bd7-fe2bd982fd35";
const CALL_REPORT_URL = "https://www.montivaro.com/api/vapi/call-report";

const PATCH_BODY = {
  // Latency: respond fast, don't wait long after the caller stops talking.
  startSpeakingPlan: {
    waitSeconds: 0.4,
    smartEndpointingPlan: { provider: "livekit" },
  },
  serverMessages: ["end-of-call-report"],
  artifactPlan: { recordingEnabled: true },
  analysisPlan: {
    summaryPlan: {
      enabled: true,
      messages: [
        {
          role: "system",
          content:
            "Summarize this call in 2-3 short sentences: who called, their barbershop, and what they asked about Prime Barber. Plain text, no preamble.",
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
          shopName: {
            type: "string",
            description: "The caller's barbershop name, if mentioned",
          },
          city: {
            type: "string",
            description: "The city or area they cut in, if mentioned",
          },
          qualified: {
            type: "boolean",
            description:
              "true ONLY if the caller is a barber or shop owner who actually engaged — shared their name, shop, city, or asked real questions about Prime Barber. false for silence, wrong numbers, or callers who shared nothing.",
          },
        },
      },
    },
  },
};

async function getConfig(key: string): Promise<string> {
  const rows = (await sql()`SELECT value FROM app_config WHERE key = ${key}`) as any[];
  return rows[0]?.value || "";
}

async function setConfig(key: string, value: string) {
  await sql()`
    INSERT INTO app_config (key, value) VALUES (${key}, ${value})
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

  const auth = { Authorization: `Bearer ${vapiKey}` };
  const json = { ...auth, "Content-Type": "application/json" };
  await ensureSchema();

  const patch = await fetch(
    `https://api.vapi.ai/assistant/${PRIMEBARBER_ASSISTANT_ID}`,
    {
      method: "PATCH",
      headers: json,
      body: JSON.stringify({ ...PATCH_BODY, server: { url: CALL_REPORT_URL, secret } }),
    }
  );
  const patched: any = await patch.json().catch(() => ({}));
  if (!patch.ok) {
    return NextResponse.json(
      { error: `Vapi PATCH failed (${patch.status})`, detail: patched?.message || null },
      { status: 502 }
    );
  }

  // Phone number: find the line we already own (by remembered number, by
  // assistant, or by name), re-bind it if it points elsewhere, and only
  // provision a brand-new free number if none exists. The list call must
  // succeed before any purchase decision: buying blind could stack up
  // duplicate numbers.
  const numbersResp = await fetch("https://api.vapi.ai/phone-number?limit=1000", {
    headers: auth,
  });
  if (!numbersResp.ok) {
    return NextResponse.json(
      { ok: false, error: `Vapi list phone numbers failed (${numbersResp.status})` },
      { status: 502 }
    );
  }
  const numbers: any[] = (await numbersResp.json().catch(() => [])) || [];
  const savedNumber = await getConfig("primebarber_number");
  let entry =
    (savedNumber && numbers.find((p) => p?.number === savedNumber)) ||
    numbers.find((p) => p?.assistantId === PRIMEBARBER_ASSISTANT_ID && p?.number) ||
    numbers.find((p) => p?.name === "Prime Barber" && p?.number) ||
    null;
  let createdNumber = false;
  if (!entry) {
    const buy = await fetch("https://api.vapi.ai/phone-number", {
      method: "POST",
      headers: json,
      body: JSON.stringify({
        provider: "vapi",
        assistantId: PRIMEBARBER_ASSISTANT_ID,
        name: "Prime Barber",
      }),
    });
    const bought: any = await buy.json().catch(() => ({}));
    if (!buy.ok || !bought?.number) {
      return NextResponse.json(
        {
          ok: false,
          error: `Vapi number provisioning failed (${buy.status})`,
          detail: bought?.message || null,
        },
        { status: 502 }
      );
    }
    entry = bought;
    createdNumber = true;
  } else if (entry.assistantId !== PRIMEBARBER_ASSISTANT_ID && entry.id) {
    const bind = await fetch(`https://api.vapi.ai/phone-number/${entry.id}`, {
      method: "PATCH",
      headers: json,
      body: JSON.stringify({ assistantId: PRIMEBARBER_ASSISTANT_ID }),
    });
    if (!bind.ok) {
      return NextResponse.json(
        {
          ok: false,
          number: entry.number,
          error: `Vapi number re-bind failed (${bind.status})`,
        },
        { status: 502 }
      );
    }
  }
  const number = entry.number;
  await setConfig("primebarber_number", number);

  return NextResponse.json({
    ok: true,
    assistantId: PRIMEBARBER_ASSISTANT_ID,
    number,
    createdNumber,
    // Visibility only — confirms which model/voice the dashboard assistant runs.
    model: patched?.model?.model || null,
    voice: patched?.voice?.voiceId || null,
  });
}
