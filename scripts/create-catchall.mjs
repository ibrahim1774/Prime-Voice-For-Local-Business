/*
 * One-time creator for the standing "Catch all" Vapi assistant.
 *
 * This is the ONE persistent assistant a Vapi phone number attaches to (Vapi
 * requires a saved assistant to bind a number — that's the only reason this
 * script exists). The /catch-all web page does NOT need it: it starts its own
 * transient assistant inline from the shared config, so there are no env vars
 * to set in Vercel.
 *
 * Run once, locally, with your Vapi key (and, optionally, your Make.com webhook
 * so captured leads are pushed straight to Make):
 *
 *   VAPI_API_KEY=xxxx LEAD_WEBHOOK_URL=https://hook.make.com/xxxx \
 *     node scripts/create-catchall.mjs
 *
 * LEAD_WEBHOOK_URL is optional. If you omit it, the assistant is still created
 * and every call's transcript + captured lead is visible in your Vapi
 * dashboard — you just won't get an automatic push to Make.
 *
 * It prints the new assistant id. Then, in the Vapi dashboard, assign a phone
 * number to the "Catch all" assistant. That's it — no Vercel env vars.
 *
 * Re-running creates a NEW assistant (Vapi has no upsert here) — only run it
 * again if you want a fresh one.
 */

import { buildCatchallAssistant } from "../lib/catchall-config.mjs";

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const LEAD_WEBHOOK_URL = (process.env.LEAD_WEBHOOK_URL || "").trim();

if (!VAPI_API_KEY) {
  console.error(
    "Missing VAPI_API_KEY. Run: VAPI_API_KEY=xxx [LEAD_WEBHOOK_URL=https://hook.make.com/xxx] node scripts/create-catchall.mjs"
  );
  process.exit(1);
}

// serverUrl -> Make.com directly. No Vercel middleman route, no env var.
const assistant = buildCatchallAssistant(
  LEAD_WEBHOOK_URL ? { serverUrl: LEAD_WEBHOOK_URL } : {}
);

const res = await fetch("https://api.vapi.ai/assistant", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${VAPI_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(assistant),
});

const text = await res.text();
if (!res.ok) {
  console.error(`Vapi create failed (${res.status}):`, text.slice(0, 1000));
  process.exit(1);
}

let data;
try {
  data = JSON.parse(text);
} catch {
  console.error("Unexpected non-JSON response:", text.slice(0, 500));
  process.exit(1);
}

console.log('\n✅ Created "Catch all" assistant');
console.log("   assistantId:", data.id);
console.log(
  "   lead webhook:",
  LEAD_WEBHOOK_URL || "(none — leads visible in the Vapi dashboard only)"
);
console.log("\nNext step:");
console.log('  In Vapi, assign a phone number to the "Catch all" assistant.');
console.log("  (The /catch-all web page already works — nothing to set in Vercel.)\n");
