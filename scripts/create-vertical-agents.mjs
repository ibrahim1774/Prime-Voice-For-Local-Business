/*
 * Provision the five trade demo assistants in Vapi: junk removal, car
 * detailing, landscaping, property management and plumbing.
 *
 * Prompts, voice and analysis plans all come from lib/vertical-agents.mjs —
 * this script only talks to the Vapi API. Run it locally with your key, the
 * same way scripts/create-catchall.mjs is run:
 *
 *   VAPI_API_KEY=xxxx node scripts/create-vertical-agents.mjs
 *
 * Flags:
 *   --dry-run          print what would be sent, make no network calls at all
 *   --only <key>       just one trade (repeatable)
 *   --force-new        always POST, even when an assistant of that name exists
 *
 * Idempotent by default, unlike create-catchall.mjs: it lists your assistants
 * first and PATCHes one that already carries the same name instead of stacking
 * up duplicates. So re-run it freely after editing a prompt.
 *
 * It creates assistants ONLY. No phone numbers are bought and nothing is wired
 * to /api/vapi/call-report — test these as web calls from the Vapi dashboard
 * first. See "next steps" in the output for what a phone line additionally
 * needs.
 */

import {
  VERTICALS,
  VERTICAL_KEYS,
  buildVerticalAssistant,
} from "../lib/vertical-agents.mjs";

const API = "https://api.vapi.ai";

// --- args -------------------------------------------------------------------

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const forceNew = argv.includes("--force-new");

const only = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--only" && argv[i + 1]) only.push(argv[i + 1]);
}
const unknown = only.filter((k) => !VERTICAL_KEYS.includes(k));
if (unknown.length) {
  console.error(`Unknown --only key: ${unknown.join(", ")}`);
  console.error(`Known keys: ${VERTICAL_KEYS.join(", ")}`);
  process.exit(1);
}
const keys = only.length ? only : VERTICAL_KEYS;

const VAPI_API_KEY = (process.env.VAPI_API_KEY || "").trim();
if (!VAPI_API_KEY && !dryRun) {
  console.error(
    "Missing VAPI_API_KEY.\n" +
      "  Run: VAPI_API_KEY=xxxx node scripts/create-vertical-agents.mjs\n" +
      "  Or preview without a key: node scripts/create-vertical-agents.mjs --dry-run"
  );
  process.exit(1);
}

const auth = { Authorization: `Bearer ${VAPI_API_KEY}` };
const json = { ...auth, "Content-Type": "application/json" };

// --- dry run ----------------------------------------------------------------

if (dryRun) {
  console.log("\nDry run — nothing is sent to Vapi.\n");
  for (const key of keys) {
    const a = buildVerticalAssistant(key);
    const fields = Object.keys(a.analysisPlan.structuredDataPlan.schema.properties);
    console.log(`${a.name}`);
    console.log(`  key             ${key}`);
    console.log(`  voice           ${a.voice.voiceId} (${a.voice.model})`);
    console.log(`  emotion         ${JSON.stringify(a.voice.experimentalControls.emotion)}`);
    console.log(`  model           ${a.model.model} @ ${a.model.temperature}, ${a.model.maxTokens} tokens`);
    console.log(`  transcriber     ${a.transcriber.provider} ${a.transcriber.model}`);
    console.log(`  backgroundSound ${a.backgroundSound}`);
    console.log(`  prompt          ${a.model.messages[0].content.length} characters`);
    console.log(`  extracts        ${fields.join(", ")}`);
    console.log(`  first message   "${a.firstMessage}"`);
    console.log("");
  }
  console.log(`${keys.length} assistant(s) would be created or updated.\n`);
  process.exit(0);
}

// --- existing assistants ----------------------------------------------------

let existing = new Map();
if (!forceNew) {
  const res = await fetch(`${API}/assistant?limit=1000`, { headers: auth });
  if (!res.ok) {
    console.error(`Vapi list assistants failed (${res.status}).`);
    console.error("Refusing to create blind — that would risk duplicates.");
    process.exit(1);
  }
  const list = (await res.json().catch(() => [])) || [];
  for (const a of list) {
    if (a?.name && a?.id && !existing.has(a.name)) existing.set(a.name, a.id);
  }
  console.log(`Found ${list.length} existing assistant(s) in Vapi.\n`);
}

// --- create or update -------------------------------------------------------

const results = [];
for (const key of keys) {
  const body = buildVerticalAssistant(key);
  const found = existing.get(body.name);
  const res = await fetch(
    found ? `${API}/assistant/${found}` : `${API}/assistant`,
    { method: found ? "PATCH" : "POST", headers: json, body: JSON.stringify(body) }
  );
  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 400);
    try {
      detail = JSON.parse(text)?.message || detail;
    } catch {
      // keep the raw text
    }
    results.push({ key, ok: false, action: found ? "update" : "create", detail: `${res.status} ${detail}` });
    continue;
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    results.push({ key, ok: false, action: found ? "update" : "create", detail: "non-JSON response" });
    continue;
  }
  results.push({
    key,
    ok: true,
    action: found ? "updated" : "created",
    id: data.id,
    name: data.name,
    voice: data?.voice?.voiceId,
    voiceModel: data?.voice?.model,
  });
}

// --- report -----------------------------------------------------------------

console.log("");
for (const r of results) {
  if (!r.ok) {
    console.log(`  FAILED  ${r.key} (${r.action}) — ${r.detail}`);
    continue;
  }
  console.log(`  ${r.action.padEnd(8)} ${r.key.padEnd(20)} ${r.id}`);
  // The one failure mode worth catching automatically: sonic-3 silently drops
  // these classic voice ids and the male voice comes back female.
  if (r.voiceModel && r.voiceModel !== "sonic-2") {
    console.log(`           WARNING: voice model came back "${r.voiceModel}", expected sonic-2`);
  }
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length} of ${results.length} assistant(s) provisioned.\n`
);

if (failed.length) process.exitCode = 1;

const ok = results.filter((r) => r.ok);
if (ok.length) {
  console.log("Next steps");
  console.log("  1. Test each one as a WEB call from the Vapi dashboard. Listen for two");
  console.log("     things: the voice must be male (female means sonic-2 got changed),");
  console.log("     and it must never read annotations like \"[warm]\" aloud.");
  console.log("  2. These are assistants only — no phone numbers, and nothing reports to");
  console.log("     /api/vapi/call-report yet. For a trade you want to run ads to, it also");
  console.log("     needs: a Vapi number, an entry in the VERTICALS array in");
  console.log("     app/api/vapi/sync-verticals/route.ts, its id in PROTECTED_IDS in");
  console.log("     app/api/vapi/assistants/route.ts, and an app_config product mapping —");
  console.log("     without that last one call-report drops every report on the floor.");
  console.log("");
  console.log("  Assistant ids:");
  for (const r of ok) console.log(`    ${r.key}_assistant_id = ${r.id}`);
  console.log("");
}
