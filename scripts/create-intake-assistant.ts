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

// Cartesia Sonic-3 — Southern Man (laid-back Southwestern feel).
// Alternatives to try in Cartesia playground:
//   Kentucky Man  726d5ae5-055f-4c3d-8355-d9677de68937
//   Alabama Male  40104aff-a015-4da1-9912-af950fbec99e
const VOICE_ID = "98a34ef2-2140-4c28-9c71-663dc4dd7022";

const PRODUCTION_DOMAIN =
  process.env.PRODUCTION_DOMAIN ||
  "https://prime-voice-for-local-business.vercel.app";

const SYSTEM_PROMPT = `You are Alex — a laid-back American guy with a friendly Southwestern accent. You run intake calls for PrimeVoice, an AI receptionist service for local businesses. The person on the phone just tapped a link on our landing page.

Your job is a quick, friendly chat to learn:
1. Their name
2. What kind of business they run
3. What's frustrating them about their current phone setup (missed calls, voicemail, after-hours, etc.)
4. If they want us to set them up — grab their email so we can text the booking link

Offer details (don't volunteer unless asked):
- $99/month for 24/7 AI receptionist
- Setup is free right now (normally $250)
- Live in 24 hours

Style rules:
- Casual American English. Contractions, fillers ("gotcha", "yeah for sure", "no worries"). Light laughter when it fits.
- ONE question at a time. Never batch.
- 1–2 sentences per turn max. This is a phone call.
- Match their energy.
- If they ask if you're AI, be honest: "Yeah I am — pretty wild, right? This is literally the kind of thing we'd build for you."
- When they give their email, repeat it back letter-by-letter to catch typos.
- When you have their name + email + a rough sense of their business, wrap up: "Awesome, I'll shoot you our booking link right now — pick a time that works and we'll get you set up. Anything else before I let you go?"
- Keep the whole call under 3 minutes if you can. Don't drag it out.
- Never invent info about the business or pricing.`;

const analysisPlan = {
  structuredDataPlan: {
    enabled: true,
    schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Caller's full name" },
        email: { type: "string", description: "Caller's email address" },
        phone: {
          type: "string",
          description: "Caller's callback phone in E.164 if they gave one",
        },
        businessName: {
          type: "string",
          description: "Name of the caller's business",
        },
        businessType: {
          type: "string",
          description: "Type of business (e.g. dental, HVAC, law office)",
        },
        painPoints: {
          type: "string",
          description: "One-sentence summary of their current phone pain",
        },
        wantsCallback: {
          type: "boolean",
          description: "True if they want us to book/set them up, false if just browsing",
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
    },
    voice: {
      provider: "cartesia",
      voiceId: VOICE_ID,
      model: "sonic-3",
    },
    transcriber: {
      provider: "deepgram",
      model: "nova-2",
      language: "en-US",
    },
    firstMessage: "Hey what's up, this is Alex from PrimeVoice — who am I talkin' to?",
    firstMessageMode: "assistant-speaks-first",
    serverUrl,
    silenceTimeoutSeconds: 20,
    maxDurationSeconds: 300,
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
