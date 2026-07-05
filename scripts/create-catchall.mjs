/*
 * One-time creator for the standing "Catch all" Vapi assistant.
 *
 * This is the adaptive phone/web demo: whoever calls (a local business owner)
 * gets an AI receptionist that discovers their business live, shows how it
 * would handle their calls, and captures their lead. You assign a phone
 * number to it in the Vapi dashboard; the /catch-all web page talks to the
 * same assistant via the browser.
 *
 * Run once, locally, with your Vapi key + site URL in the environment:
 *
 *   VAPI_API_KEY=xxxx SITE_URL=https://<your-montivaro-domain> \
 *     node scripts/create-catchall.mjs
 *
 * It prints the new assistant id. Then:
 *   1. Set NEXT_PUBLIC_CATCHALL_ASSISTANT_ID=<printed id> in Vercel env.
 *   2. Set CATCHALL_LEAD_WEBHOOK_URL=<your Make.com webhook> in Vercel env.
 *   3. In Vapi, assign a phone number to the "Catch all" assistant.
 *
 * Re-running creates a NEW assistant (Vapi has no upsert here) — only run it
 * again if you want a fresh one.
 */

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const SITE_URL = (process.env.SITE_URL || '').replace(/\/+$/, '');

if (!VAPI_API_KEY) {
  console.error('Missing VAPI_API_KEY. Run: VAPI_API_KEY=xxx SITE_URL=https://... node scripts/create-catchall.mjs');
  process.exit(1);
}
if (!SITE_URL) {
  console.error('Missing SITE_URL (your Montivaro domain, e.g. https://www.montivaro.com). It becomes the lead webhook: <SITE_URL>/api/catchall-lead');
  process.exit(1);
}

// Cartesia male voice (sonic-2) — same one the rest of the demos use.
const MALE_VOICE_ID = '9fa83ce3-c3a8-4523-accc-173904582ced';

const SYSTEM_PROMPT = `You are the AI receptionist for Montivaro, and this call is a LIVE demo. Whoever is calling is a local business owner trying you out to see how you'd answer their phones. Your job: instantly adapt to THEIR business, wow them, and capture their details so the Montivaro team can set it up on their line.

Work through this flow naturally, like a warm, sharp human receptionist — ONE question at a time:

1. GREETING (already sent): you've thanked them for calling and asked what their business is called and what they do.
2. DISCOVER: from their answers, learn their business name, their industry, the services they offer, and the city or area they serve. If something is missing, ask for it — but only one thing at a time, conversationally.
3. SHOW, DON'T TELL: reflect a concrete, tailored scenario back to them, specific to THEIR industry. Shape it like: "Perfect — so say someone calls {business} at 9pm about {a relevant problem}. Here's exactly what I'd do: I'd answer in your name, get their details, book them in for the morning, and text you the lead — you wouldn't lift a finger." Adapt the example to them (plumbing -> emergency + job booking; barber/salon -> appointment booking; clinic -> intake + scheduling; contractor -> quote requests; restaurant -> reservations/orders).
4. UNDERSTAND THEIR NEED: ask what they'd most want handled — after-hours answering, a full-time receptionist, overflow when they're slammed, or emergency dispatch — then react with exactly how you'd do that for them.
5. CAPTURE THE LEAD: naturally ask for their name and the best phone number to reach them, framed as "so our team can get this set up on your line." Read the number back to confirm it.
6. CLOSE: give a short recap tailored to them ("So for {business}, I'd handle {their need} 24/7 and send you every lead") and tell them someone from Montivaro will follow up shortly at that number to get it live. Thank them warmly.

Rules:
- Keep replies short and conversational — a sentence or two, then a question. This is a phone call, not a monologue.
- Ask ONE question at a time. Never stack questions.
- Sound like a real person: contractions, natural warmth, a little enthusiasm when they're into it. Match their energy.
- NEVER speak stage directions, emotion labels, or bracketed/asterisked text (e.g. "[warm]", "(pause)", "*laughs*"). Convey warmth through your actual words, never annotations.
- If asked directly, don't pretend to be human — you're Montivaro's AI receptionist, and that's the whole point of the demo.
- Don't invent specifics you weren't told (owner names, exact prices). Ask, or keep it general.
- If they ask about Montivaro, answer briefly and helpfully, then steer back to learning their business and getting their details.
- If they seem ready to hang up, grab their name and number if you can, then close warmly.`;

const FIRST_MESSAGE =
  "Hey there, thanks for calling! I'm your AI receptionist — before I show you what I can do, tell me a little about your business. What's it called, and what do you do?";

const assistant = {
  name: 'Catch all',
  firstMessage: FIRST_MESSAGE,
  firstMessageMode: 'assistant-speaks-first',
  model: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5-20250929',
    temperature: 0.7,
    maxTokens: 300,
    messages: [{ role: 'system', content: SYSTEM_PROMPT }],
  },
  voice: {
    provider: 'cartesia',
    voiceId: MALE_VOICE_ID,
    model: 'sonic-2',
    // Vapi's runtime wants emotion as an ARRAY (one entry per emotion type);
    // a plain string fails. chunkPlan feeds fuller phrases for smoother prosody.
    experimentalControls: {
      speed: 'normal',
      emotion: ['positivity:high'],
    },
    chunkPlan: { enabled: true, minCharacters: 40 },
  },
  transcriber: {
    provider: 'deepgram',
    model: 'nova-3',
    language: 'en-US',
    smartFormat: true,
    endpointing: 300,
    confidenceThreshold: 0.4,
  },
  // Office ambiance so it sounds like a real staffed front desk.
  backgroundSound: 'office',
  backgroundSpeechDenoisingPlan: { smartDenoisingPlan: { enabled: true } },
  // Extract the lead from the conversation at end of call -> call.analysis.structuredData.
  analysisPlan: {
    minMessagesThreshold: 2,
    summaryPlan: { enabled: true },
    structuredDataPlan: {
      enabled: true,
      schema: {
        type: 'object',
        properties: {
          callerName: { type: 'string', description: "The caller's name." },
          callbackNumber: { type: 'string', description: 'Best phone number to reach the caller.' },
          businessName: { type: 'string', description: "The caller's business name." },
          industry: { type: 'string', description: 'Their industry or type of business.' },
          location: { type: 'string', description: 'City/state or area the business serves.' },
          services: { type: 'string', description: 'Services the business offers.' },
          interest: {
            type: 'string',
            description:
              'What they want the AI receptionist to do (after-hours answering, full receptionist, overflow, emergency dispatch, booking).',
          },
        },
      },
    },
  },
  // Vapi POSTs the end-of-call report (with the structured lead) here.
  server: { url: `${SITE_URL}/api/catchall-lead` },
  serverMessages: ['end-of-call-report'],
};

const res = await fetch('https://api.vapi.ai/assistant', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${VAPI_API_KEY}`,
    'Content-Type': 'application/json',
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
  console.error('Unexpected non-JSON response:', text.slice(0, 500));
  process.exit(1);
}

console.log('\n✅ Created "Catch all" assistant');
console.log('   assistantId:', data.id);
console.log('   lead webhook:', `${SITE_URL}/api/catchall-lead`);
console.log('\nNext steps:');
console.log('  1. Set NEXT_PUBLIC_CATCHALL_ASSISTANT_ID =', data.id, '(Vercel env)');
console.log('  2. Set CATCHALL_LEAD_WEBHOOK_URL = <your Make.com webhook> (Vercel env)');
console.log('  3. In Vapi, assign a phone number to the "Catch all" assistant.\n');
