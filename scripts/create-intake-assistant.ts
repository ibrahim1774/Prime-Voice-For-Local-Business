/**
 * Provision the persistent VAPI assistant for the /call tap-to-dial flow.
 *
 * Usage:
 *   1. Set VAPI_API_KEY and (optionally) VAPI_WEBHOOK_SECRET in .env.local.
 *   2. Edit PRODUCTION_DOMAIN below to point at your deployed /api/vapi-webhook.
 *   3. Run:  npx tsx scripts/create-intake-assistant.ts
 *   4. Copy the printed assistant ID, go to VAPI dashboard → Phone Numbers,
 *      buy a US number, assign this assistant to it.
 *   5. Put the E.164 number in .env.local as NEXT_PUBLIC_INTAKE_PHONE_NUMBER.
 *
 * To update the existing assistant: npx tsx scripts/create-intake-assistant.ts --update <assistantId>
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

// --- Config ------------------------------------------------------------------

// Cartesia Sonic-3 — Kyle (tagged Emotive, in Cartesia's "optimal emotional range" male list).
// If Kyle sounds off, swap to one of these emotive alternatives:
//   Jace   0b904166-a29f-4d2e-bb20-41ca302f98e9
//   Leo    29e5f8b4-b953-4f7f-b5b1-5f45d3c9f4a7
//   Gavin  6f84f4b8-58a2-430c-8c79-688dad597532
const VOICE_ID = "c961b81c-a935-4c17-bfb3-ba2239de8c2f";

const PRODUCTION_DOMAIN =
  process.env.PRODUCTION_DOMAIN ||
  "https://prime-voice-for-local-business.vercel.app";

const SYSTEM_PROMPT = `You are Alex — a laid-back American guy running intake calls for PrimeVoice, an AI receptionist service for local businesses. Someone just tapped the "Tap to Call" button on our landing page.

Your only goal: book them onto our PrimeVoice Setup Call calendar. You do NOT need their email.

Exact flow — follow in this order, one question at a time:

1. First, get their name. ("Cool, who am I talkin' to?")
2. Then, get their best callback number in case the line drops. Repeat it back digit by digit to confirm.
3. Ask what kind of business they run — one line, just so you know who you're talking to.
4. Then ask what day and time works for a quick 15-minute setup call. If they're vague ("maybe sometime this week"), offer two concrete options — e.g. "How's tomorrow at 2pm work? Or Thursday morning?"
5. Once they pick a specific day + time, confirm it out loud: "Alright, so that's Thursday the 24th at 3pm your time, right?"
6. As soon as they confirm, call the \`bookAppointment\` tool with their name, phone, and the time in ISO 8601 format (e.g. 2026-04-24T15:00:00). Use their local time — the calendar handles timezone.
7. After the tool returns success, tell them: "Perfect, you're locked in. You'll get a confirmation text in a sec. Anything else before I let you go?"

Offer details (only mention if asked):
- $99/month for a 24/7 AI receptionist
- Setup is free right now (normally $250)
- We'll have you live in 24 hours after the setup call

Style rules:
- Casual American English. Contractions, fillers ("gotcha", "yeah for sure", "no worries", "right on").
- ONE question at a time. Never batch.
- Keep each turn to 1–2 sentences. This is a phone call.
- Use natural pauses — commas and ellipses matter for cadence.
- Match their energy. Don't be over-excited if they're just curious.
- If they ask if you're AI, be honest: "Yeah, I'm an AI — this is the kind of thing we'd build for your business."
- If they don't want to book, still get their name + phone and end warmly: "No worries, I'll have someone on the team follow up when you're ready."
- Keep the call under 3 minutes if you can. Don't drag it out.
- Never invent info about the business or pricing.`;

const bookAppointmentTool = {
  type: "function",
  function: {
    name: "bookAppointment",
    description:
      "Book a 30-minute PrimeVoice Setup Call on the calendar. Call this ONLY after you've confirmed the day and time out loud with the caller.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Caller's full name" },
        phone: {
          type: "string",
          description:
            "Caller's callback phone, E.164 format if possible (e.g. +15551234567)",
        },
        businessName: {
          type: "string",
          description: "Name or rough description of their business",
        },
        preferredDateTimeISO: {
          type: "string",
          description:
            "Appointment start time in ISO 8601, in the caller's local time (e.g. 2026-04-24T15:00:00). No email needed.",
        },
      },
      required: ["name", "phone", "preferredDateTimeISO"],
    },
  },
};

const analysisPlan = {
  structuredDataPlan: {
    enabled: true,
    schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Caller's full name" },
        phone: {
          type: "string",
          description: "Caller's callback phone in E.164 if they gave one",
        },
        businessName: {
          type: "string",
          description: "Name or type of the caller's business",
        },
        bookedAppointment: {
          type: "boolean",
          description: "True if bookAppointment tool was called successfully",
        },
      },
    },
  },
};

// --- Env loader (no deps) ----------------------------------------------------

function loadEnvLocal(): void {
  try {
    const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // .env.local missing is fine
  }
}

// --- Main --------------------------------------------------------------------

async function main() {
  loadEnvLocal();

  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) {
    console.error("Missing VAPI_API_KEY in .env.local");
    process.exit(1);
  }

  const updateIdx = process.argv.indexOf("--update");
  const existingId = updateIdx !== -1 ? process.argv[updateIdx + 1] : null;

  const serverUrl = `${PRODUCTION_DOMAIN.replace(/\/$/, "")}/api/vapi-webhook`;

  const assistantConfig: Record<string, unknown> = {
    name: "PrimeVoice Intake (Persistent)",
    model: {
      provider: "anthropic",
      model: "claude-sonnet-4-5-20250929",
      systemPrompt: SYSTEM_PROMPT,
      temperature: 0.8,
      maxTokens: 300,
      tools: [bookAppointmentTool],
    },
    voice: {
      provider: "cartesia",
      voiceId: VOICE_ID,
      model: "sonic-3",
      experimentalControls: {
        speed: "normal",
        emotion: ["positivity:low"],
      },
    },
    transcriber: {
      provider: "deepgram",
      model: "nova-2",
      language: "en-US",
    },
    firstMessage:
      "Hey... thanks for callin' PrimeVoice. This is Alex — how's your day goin'?",
    firstMessageMode: "assistant-speaks-first",
    serverUrl,
    silenceTimeoutSeconds: 20,
    maxDurationSeconds: 300,
    backgroundDenoisingEnabled: true,
    startSpeakingPlan: {
      smartEndpointingEnabled: true,
    },
    analysisPlan,
  };

  const secret = process.env.VAPI_WEBHOOK_SECRET;
  if (secret) assistantConfig.serverUrlSecret = secret;

  const url = existingId
    ? `https://api.vapi.ai/assistant/${existingId}`
    : "https://api.vapi.ai/assistant";

  console.log(`${existingId ? "Updating" : "Creating"} assistant...`);
  console.log(`  Server URL: ${serverUrl}`);
  console.log(`  Voice ID:   ${VOICE_ID}`);

  const res = await fetch(url, {
    method: existingId ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(assistantConfig),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error(`\nVAPI API error (${res.status}):`);
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log(`\n✓ Assistant ${existingId ? "updated" : "created"}`);
  console.log(`  ID:   ${data.id}`);
  console.log(`  Name: ${data.name}`);
  console.log("\nNext steps:");
  console.log("  1. VAPI dashboard → Phone Numbers → Buy (US number)");
  console.log(`  2. Assign assistant '${data.id}' to the number`);
  console.log("  3. Put the E.164 number in .env.local as NEXT_PUBLIC_INTAKE_PHONE_NUMBER");
  console.log("  4. Redeploy and dial the number to test");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
