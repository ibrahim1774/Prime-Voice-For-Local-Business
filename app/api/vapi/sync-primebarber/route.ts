import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/dialer/core";

// One-shot provisioning + config sync for the Prime Barber demo assistant.
//
// Like /api/vapi/sync-config, but this one CREATES what it needs: the Vapi
// private key only exists in the Vercel env, so POST here (shared secret in
// x-vapi-secret) and it will
//   1. create the "Prime Barber" assistant if it doesn't exist, else update it
//      in place — voice + transcriber are copied from the live catch-all demo
//      assistant so both lines sound identical,
//   2. provision a free Vapi phone number pointed at it (once — the number is
//      remembered in app_config and reused forever),
//   3. store assistant id + number in app_config, where /api/vapi/call-report
//      and /api/vapi/primebarber-config read them.
// Idempotent — safe to re-run after any prompt/config change.

export const maxDuration = 60;

const CATCHALL_ASSISTANT_ID = "52081d54-3e98-4213-88cc-b618985a1d9b";
const CALL_REPORT_URL = "https://www.montivaro.com/api/vapi/call-report";

const SYSTEM_PROMPT = `You are Sky, answering the phone for Prime Barber — a $97/month all-in-one system that gives barbers their own branded website with online booking, a product store, payments, and a dedicated app. The barber owns everything.

HOW YOU TALK
- Short, natural spoken sentences. One to three per turn. Never read a list out loud.
- Answer the question asked, then ask one small question back.
- If the caller interrupts, stop and listen.
- Plain language. No jargon, no filler like "great question".

WHAT YOU KNOW
- Branded website: built from barbershop templates and customized to their shop and their brand. The account is theirs — they can swap images and edit text anytime.
- Booking: clients book appointments right on their site. Every booking sends a notification to their app.
- Product store: they can sell their own products — hair products, clippers, anything. They add products, images, and prices themselves, or we help set it up.
- Payments: they get paid through Stripe, PayPal, or Square, and manual payment methods work too.
- App: a dedicated app that notifies them whenever someone books or buys.
- Customer messaging: they can contact customers by email and other channels straight from their account.
- Ownership: unlike Booksy, they own the domain, the client list, and the whole system. No commission is ever taken.
- Price: ninety-seven dollars a month, all-inclusive.
- Next step: book a free setup call at montivaro dot com slash bookcall. Offer to text them the link — if they want it, tell them the text arrives shortly after the call ends.

CAPTURE (naturally over the conversation, never as a form)
- Their first name, their barbershop's name, and the city they cut in.

RULES
- If they ask something you don't know (setup fees, contracts, exact timelines), say the setup call covers that — never make anything up.
- If the caller clearly isn't a barber or shop owner, stay friendly, answer briefly, and wrap up politely.
- Keep the call focused on whether Prime Barber fits their shop and on booking the setup call.`;

function assistantBody(voice: any, transcriber: any, secret: string) {
  const body: any = {
    name: "Prime Barber",
    firstMessage: "Prime Barber, this is Sky — how can I help you today?",
    model: {
      provider: "openai",
      model: "gpt-4o-mini",
      temperature: 0.6,
      maxTokens: 150,
      messages: [{ role: "system", content: SYSTEM_PROMPT }],
    },
    // Latency: respond fast, don't wait long after the caller stops talking.
    startSpeakingPlan: {
      waitSeconds: 0.4,
      smartEndpointingPlan: { provider: "livekit" },
    },
    maxDurationSeconds: 900,
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
  if (voice) body.voice = voice;
  if (transcriber) body.transcriber = transcriber;
  return body;
}

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

  // Same voice as the current demo: copy voice + transcriber verbatim from
  // the live catch-all assistant.
  const catchallResp = await fetch(
    `https://api.vapi.ai/assistant/${CATCHALL_ASSISTANT_ID}`,
    { headers: auth }
  );
  if (!catchallResp.ok) {
    return NextResponse.json(
      { error: `Vapi GET catch-all assistant failed (${catchallResp.status})` },
      { status: 502 }
    );
  }
  const catchall: any = await catchallResp.json();
  const body = assistantBody(catchall?.voice, catchall?.transcriber, secret);

  // Assistant: update in place if we made one before (and it still exists).
  let assistantId = await getConfig("primebarber_assistant_id");
  let createdAssistant = false;
  if (assistantId) {
    const check = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      headers: auth,
    });
    if (check.status === 404) assistantId = "";
  }
  if (assistantId) {
    const patch = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      method: "PATCH",
      headers: json,
      body: JSON.stringify(body),
    });
    const patched: any = await patch.json().catch(() => ({}));
    if (!patch.ok) {
      return NextResponse.json(
        { error: `Vapi PATCH failed (${patch.status})`, detail: patched?.message || null },
        { status: 502 }
      );
    }
  } else {
    const create = await fetch("https://api.vapi.ai/assistant", {
      method: "POST",
      headers: json,
      body: JSON.stringify(body),
    });
    const created: any = await create.json().catch(() => ({}));
    if (!create.ok || !created?.id) {
      return NextResponse.json(
        { error: `Vapi create failed (${create.status})`, detail: created?.message || null },
        { status: 502 }
      );
    }
    assistantId = created.id;
    createdAssistant = true;
    await setConfig("primebarber_assistant_id", assistantId);
  }

  // Phone number: reuse the remembered one, else adopt an existing Vapi
  // number already pointed at this assistant, else provision a free one.
  let number = await getConfig("primebarber_number");
  let createdNumber = false;
  if (!number) {
    const listResp = await fetch("https://api.vapi.ai/phone-number", { headers: auth });
    const list: any[] = listResp.ok ? await listResp.json().catch(() => []) : [];
    const existing = Array.isArray(list)
      ? list.find((p) => p?.assistantId === assistantId && p?.number)
      : null;
    if (existing) {
      number = existing.number;
    } else {
      const buy = await fetch("https://api.vapi.ai/phone-number", {
        method: "POST",
        headers: json,
        body: JSON.stringify({
          provider: "vapi",
          assistantId,
          name: "Prime Barber",
        }),
      });
      const bought: any = await buy.json().catch(() => ({}));
      if (!buy.ok || !bought?.number) {
        return NextResponse.json(
          {
            ok: false,
            assistantId,
            error: `Vapi number provisioning failed (${buy.status})`,
            detail: bought?.message || null,
          },
          { status: 502 }
        );
      }
      number = bought.number;
      createdNumber = true;
    }
    await setConfig("primebarber_number", number);
  }

  return NextResponse.json({
    ok: true,
    assistantId,
    number,
    createdAssistant,
    createdNumber,
  });
}
