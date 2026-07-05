/*
 * Single source of truth for the "Catch all" adaptive demo assistant.
 *
 * Both consumers import from here so the phone assistant and the /catch-all
 * web demo can never drift:
 *   - scripts/create-catchall.mjs  -> creates the ONE persistent assistant a
 *     Vapi phone number attaches to (server.url = your Make.com webhook).
 *   - components/CatchAllDemo.tsx  -> starts a transient assistant inline in
 *     the browser (no pre-created id, no env var).
 *
 * Plain .mjs (no TS-only syntax) so the Node ESM script and the Next/TS
 * client component can both import it (tsconfig has allowJs).
 */

// Cartesia male voice (sonic-2) — same one the rest of the demos use.
export const CATCHALL_MALE_VOICE_ID = "9fa83ce3-c3a8-4523-accc-173904582ced";

export const CATCHALL_SYSTEM_PROMPT = `You are the AI receptionist for Montivaro, and this call is a LIVE demo. Whoever is calling is a local business owner trying you out to see how you'd answer their phones. Your job: instantly adapt to THEIR business, wow them, and capture their details so the Montivaro team can set it up on their line.

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

export const CATCHALL_FIRST_MESSAGE =
  "Hey there, thanks for calling! I'm your AI receptionist — before I show you what I can do, tell me a little about your business. What's it called, and what do you do?";

// Extracted at end of call -> call.analysis.structuredData (dashboard + webhook).
export const CATCHALL_STRUCTURED_DATA_SCHEMA = {
  type: "object",
  properties: {
    callerName: { type: "string", description: "The caller's name." },
    callbackNumber: { type: "string", description: "Best phone number to reach the caller." },
    businessName: { type: "string", description: "The caller's business name." },
    industry: { type: "string", description: "Their industry or type of business." },
    location: { type: "string", description: "City/state or area the business serves." },
    services: { type: "string", description: "Services the business offers." },
    interest: {
      type: "string",
      description:
        "What they want the AI receptionist to do (after-hours answering, full receptionist, overflow, emergency dispatch, booking).",
    },
  },
};

/*
 * Build the full Catch-all assistant config.
 *
 * @param {object} [opts]
 * @param {string} [opts.serverUrl] - When set (phone assistant), Vapi POSTs the
 *   end-of-call report + structured lead here (point it straight at Make.com).
 *   When omitted (web demo), no server is attached: web conversations are still
 *   captured in the Vapi dashboard, and no webhook URL ends up in the browser
 *   bundle.
 */
export function buildCatchallAssistant(opts = {}) {
  const { serverUrl } = opts;

  const assistant = {
    name: "Catch all",
    firstMessage: CATCHALL_FIRST_MESSAGE,
    firstMessageMode: "assistant-speaks-first",
    model: {
      provider: "anthropic",
      model: "claude-sonnet-4-5-20250929",
      temperature: 0.7,
      maxTokens: 300,
      messages: [{ role: "system", content: CATCHALL_SYSTEM_PROMPT }],
    },
    voice: {
      provider: "cartesia",
      voiceId: CATCHALL_MALE_VOICE_ID,
      model: "sonic-2",
      // Vapi's runtime wants emotion as an ARRAY (one entry per emotion type);
      // a plain string fails. chunkPlan feeds fuller phrases for smoother prosody.
      experimentalControls: {
        speed: "normal",
        emotion: ["positivity:high"],
      },
      chunkPlan: { enabled: true, minCharacters: 40 },
    },
    transcriber: {
      provider: "deepgram",
      model: "nova-3",
      language: "en-US",
      smartFormat: true,
      endpointing: 300,
      confidenceThreshold: 0.4,
    },
    // Office ambiance so it sounds like a real staffed front desk.
    backgroundSound: "office",
    backgroundSpeechDenoisingPlan: { smartDenoisingPlan: { enabled: true } },
    analysisPlan: {
      minMessagesThreshold: 2,
      summaryPlan: { enabled: true },
      structuredDataPlan: {
        enabled: true,
        schema: CATCHALL_STRUCTURED_DATA_SCHEMA,
      },
    },
  };

  if (serverUrl) {
    // Vapi POSTs the end-of-call report (with the structured lead) here.
    assistant.server = { url: serverUrl };
    assistant.serverMessages = ["end-of-call-report"];
  }

  return assistant;
}
