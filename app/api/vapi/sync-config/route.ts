import { NextRequest, NextResponse } from "next/server";

// One-shot config sync for the catch-all demo assistant.
//
// The Vapi private key only exists in the Vercel env, so assistant config is
// applied from here instead of a local script: POST with the shared secret in
// x-vapi-secret and this endpoint points the assistant's server URL at
// /api/vapi/call-report, subscribes it to end-of-call reports, turns on
// recording, and installs the summary + structured-data analysis plan.
// Idempotent — safe to re-run after any config change.

export const maxDuration = 60;

const CATCHALL_ASSISTANT_ID = "52081d54-3e98-4213-88cc-b618985a1d9b";
const CALL_REPORT_URL = "https://www.montivaro.com/api/vapi/call-report";

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

  const currentResp = await fetch(
    `https://api.vapi.ai/assistant/${CATCHALL_ASSISTANT_ID}`,
    { headers: auth }
  );
  if (!currentResp.ok) {
    return NextResponse.json(
      { error: `Vapi GET assistant failed (${currentResp.status})` },
      { status: 502 }
    );
  }
  const current: any = await currentResp.json();
  const previousServerUrl: string | null =
    current?.server?.url || current?.serverUrl || null;

  const patch = {
    server: { url: CALL_REPORT_URL, secret },
    serverMessages: ["end-of-call-report"],
    artifactPlan: { recordingEnabled: true },
    analysisPlan: {
      summaryPlan: {
        enabled: true,
        messages: [
          {
            role: "system",
            content:
              "Summarize this call in 2-3 short sentences for an SMS lead alert to a business owner: who called, what their business is, and what they wanted. Plain text, no preamble.",
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
          },
        },
      },
    },
  };

  const patchResp = await fetch(
    `https://api.vapi.ai/assistant/${CATCHALL_ASSISTANT_ID}`,
    {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }
  );
  const patched: any = await patchResp.json().catch(() => ({}));
  if (!patchResp.ok) {
    return NextResponse.json(
      {
        error: `Vapi PATCH failed (${patchResp.status})`,
        detail: patched?.message || null,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    assistant: CATCHALL_ASSISTANT_ID,
    serverUrl: patched?.server?.url || CALL_REPORT_URL,
    // If a previous consumer (e.g. a Make webhook) was wired here, it now
    // needs FORWARD_WEBHOOK_URL set on this project to keep receiving reports.
    previousServerUrl,
    recording: patched?.artifactPlan?.recordingEnabled ?? true,
  });
}
