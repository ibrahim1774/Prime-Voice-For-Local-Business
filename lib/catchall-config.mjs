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

// Cartesia voices (sonic-2) — same pair the rest of the demos use.
export const CATCHALL_MALE_VOICE_ID = "9fa83ce3-c3a8-4523-accc-173904582ced";
export const CATCHALL_FEMALE_VOICE_ID = "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4"; // Skylar

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

/*
 * Phone-line variant: the same receptionist, plus the ability to book the
 * Montivaro setup call straight into the connected calendar during the call.
 *
 * @param {object} booking
 * @param {string} booking.availabilityTool - name of the calendar
 *   availability-check tool attached to the assistant.
 * @param {string} booking.bookingTool - name of the create-event tool.
 * @param {string} [booking.contactTool] - GoHighLevel only: the contact-create
 *   tool that must run before the event is created.
 */
export const BOOKING_SECTION_START = "=== BOOKING THE SETUP CALL (managed by sync-config — edit the prompt above, not this block) ===";
export const BOOKING_SECTION_END = "=== END BOOKING ===";

export function buildBookingSection(booking) {
  const { availabilityTool, bookingTool, contactTool, video } = booking;
  const contactStep = contactTool
    ? `\n  - First call ${contactTool} with their first name, phone number, email and company name.`
    : "";
  // Video is offered only when the owner has set SETUP_CALL_VIDEO_URL — the
  // texts, invite and booking page carry the link; Keith never reads it out.
  const modeStep = video
    ? `\n  - Ask which they'd prefer: a regular phone call, or a video call. Don't read out any link — for video, say the join link comes in their text and calendar invite.`
    : "";
  const modeTag = video
    ? ` End the description with "MODE: video" or "MODE: phone" — whichever they chose.`
    : ` End the description with "MODE: phone".`;
  const confirmLine = video
    ? `"You're booked for {day} at {time} {their time zone}. You'll get a text confirmation and a calendar invite at {email}" — then, for video: "with the video link in both", for phone: "and we'll call you at this number" — "plus a reminder before the call."`
    : `"You're booked for {day} at {time} {their time zone}. You'll get a text confirmation and a calendar invite at {email}, plus a reminder before the call."`;
  return `${BOOKING_SECTION_START}
This phone line books the Montivaro setup call directly into Montivaro's calendar, during the call. This overrides anything above about booking on a page or not asking for contact details: on this line YOU book it, and the ONE detail you need is their email.
Right now in New York it is {{"now" | date: "%A, %B %d, %Y, %I:%M %p", "America/New_York"}}. Work out every date relative to that; never guess the year.
The caller's phone number is {{customer.number}} — you already have it, so never ask for a phone number.

When they're warm (or when you'd otherwise send them to a page), offer it once, naturally: "Want me to lock in a quick fifteen-minute setup call with the Montivaro team right now? Just takes a sec."

If they say yes:
  - Ask what day and time works for them. If they're vague, offer two concrete options within the next couple of business days — Monday to Friday, between 9am and 6pm New York time.
  - Use the caller's OWN time zone. If you know their city or state, use it (Arizona → America/Phoenix, California → America/Los_Angeles, Texas → America/Chicago, Florida or New York → America/New_York, and so on). If you don't know where they are, ask which time zone they're in.
  - Ask for their email so the calendar invite reaches them. Read it back letter by letter and only continue once they confirm it — one wrong letter means no invite.${modeStep}
  - Call ${availabilityTool} for that day, a 9am-to-6pm window in their time zone. If their time is taken, offer the nearest open times.${contactStep}
  - Once they confirm a free time, call ${bookingTool} with: summary "Montivaro setup call — {their business name}", a 15-minute event (end time = start time plus 15 minutes), start and end in ISO 8601 with their time zone, attendees = [their email], and a description with their name, business and {{customer.number}}.${modeTag}
  - Then confirm out loud: ${confirmLine}
  - If a tool fails, try once more at most. If it still fails, tell them the team will confirm the time by text, and carry on.

If they say no, don't push — close warmly and tell them the team will follow up at this number.
${BOOKING_SECTION_END}`;
}

/*
 * Append (or refresh) the managed booking block on whatever system prompt the
 * assistant currently has — the owner edits the personality in the Vapi
 * dashboard, and sync-config must never overwrite that. Re-running replaces
 * only the block between the markers.
 */
export function withBookingSection(basePrompt, booking) {
  const base = String(basePrompt || CATCHALL_SYSTEM_PROMPT);
  const start = base.indexOf(BOOKING_SECTION_START);
  const end = base.indexOf(BOOKING_SECTION_END);
  const stripped =
    start !== -1 && end !== -1 && end > start
      ? base.slice(0, start) + base.slice(end + BOOKING_SECTION_END.length)
      : base;
  return `${stripped.trimEnd()}\n\n${buildBookingSection(booking)}`;
}

// Kept for callers that want the code prompt with booking, e.g. scripts.
export function buildCatchallBookingPrompt(booking) {
  return withBookingSection(CATCHALL_SYSTEM_PROMPT, booking);
}

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
 * @param {"female"|"male"} [opts.voiceGender] - Which Cartesia voice to use.
 *   Defaults to "female" (Skylar), matching the other demos.
 */
export function buildCatchallAssistant(opts = {}) {
  const { serverUrl, voiceGender } = opts;
  const voiceId =
    voiceGender === "male" ? CATCHALL_MALE_VOICE_ID : CATCHALL_FEMALE_VOICE_ID;

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
      voiceId,
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
