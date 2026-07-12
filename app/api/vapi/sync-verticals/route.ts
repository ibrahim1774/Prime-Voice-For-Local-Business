import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/dialer/core";

// One-shot wiring for the vertical demo assistants (dentist, contractors).
//
// The user creates the assistant + phone number in the Vapi dashboard (prompt
// and voice are theirs; this endpoint never touches them). POST here (shared
// secret in x-vapi-secret) and, for each vertical, it
//   1. finds the known phone number in Vapi and reads which assistant it's
//      attached to (no ids to paste around),
//   2. patches that assistant with the call-report webhook, recording, the
//      lead analysis plan (name / practice or company / qualified flag) and
//      fast turn-taking,
//   3. stores the assistant id in app_config, where /api/vapi/call-report
//      maps calls to the right vertical and SMS.
// Idempotent — safe to re-run after any config change.

export const maxDuration = 60;

const CALL_REPORT_URL = "https://www.montivaro.com/api/vapi/call-report";

const VERTICALS = [
  { key: "dentist", number: "+16572464071" },
  { key: "contractors", number: "+18406882671" },
  { key: "website", number: "+19842992378" },
] as const;

const PATCH_BODY = {
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
            "Summarize this call in 2-3 short sentences for an SMS lead alert to a business owner: who called, what practice/company they run, and what they wanted. Plain text, no preamble.",
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
            description: "The caller's practice or company name, if mentioned",
          },
          businessType: {
            type: "string",
            description:
              "What kind of practice or company the caller runs (e.g. dental office, plumbing)",
          },
          qualified: {
            type: "boolean",
            description:
              "true ONLY if the caller actually engaged as a business owner or staff — shared their name, practice/company, or asked real questions about getting the receptionist. false for silence, wrong numbers, or callers who shared nothing.",
          },
        },
      },
    },
  },
};

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

  const numbersResp = await fetch("https://api.vapi.ai/phone-number?limit=1000", {
    headers: auth,
  });
  if (!numbersResp.ok) {
    return NextResponse.json(
      { error: `Vapi list phone numbers failed (${numbersResp.status})` },
      { status: 502 }
    );
  }
  const numbers: any[] = (await numbersResp.json().catch(() => [])) || [];

  const results: Record<string, any> = {};
  for (const v of VERTICALS) {
    const entry = numbers.find((p) => p?.number === v.number);
    if (!entry) {
      results[v.key] = { ok: false, error: `number ${v.number} not found in Vapi` };
      continue;
    }
    const assistantId: string | undefined = entry.assistantId;
    if (!assistantId) {
      results[v.key] = {
        ok: false,
        error: `number ${v.number} has no assistant attached — assign one in the Vapi dashboard`,
      };
      continue;
    }
    const patch = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      method: "PATCH",
      headers: json,
      body: JSON.stringify({ ...PATCH_BODY, server: { url: CALL_REPORT_URL, secret } }),
    });
    const patched: any = await patch.json().catch(() => ({}));
    if (!patch.ok) {
      results[v.key] = {
        ok: false,
        error: `Vapi PATCH failed (${patch.status})`,
        detail: patched?.message || null,
      };
      continue;
    }
    await setConfig(`${v.key}_assistant_id`, assistantId);
    results[v.key] = {
      ok: true,
      assistantId,
      number: v.number,
      model: patched?.model?.model || null,
      voice: patched?.voice?.voiceId || null,
    };
  }

  const allOk = VERTICALS.every((v) => results[v.key]?.ok);
  return NextResponse.json({ ok: allOk, results }, { status: allOk ? 200 : 502 });
}
