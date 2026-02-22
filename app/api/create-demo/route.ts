import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const INDUSTRY_KNOWLEDGE: Record<
  string,
  {
    primaryGoal: string;
    keyInfo: string;
    scenarios: string;
    pricingBehavior: string;
    schedulingNotes: string;
  }
> = {
  "Home Services": {
    primaryGoal: "Book a service appointment or dispatch for emergency",
    keyInfo:
      "What is the issue or service needed, property type (home/commercial), urgency level (emergency vs routine), preferred date/time, address or service area",
    scenarios:
      "Emergency calls (burst pipe, no AC, power out), routine maintenance requests, quote requests, warranty or follow-up visits",
    pricingBehavior:
      'Offer free estimates if applicable, otherwise say "pricing depends on the scope of work and we\'d love to come take a look"',
    schedulingNotes:
      "Offer morning or afternoon windows, confirm address",
  },
  "Healthcare & Dental": {
    primaryGoal: "Book a patient appointment",
    keyInfo:
      "New patient or existing, insurance provider and member ID, reason for visit, preferred date/time, any urgency or pain level",
    scenarios:
      "New patient wanting to book, existing patient needing follow-up, insurance verification questions, emergency/urgent visits, prescription refill requests",
    pricingBehavior:
      'Say "we accept most major insurance plans — our front desk team will verify your specific coverage and any copay before your visit"',
    schedulingNotes:
      "Differentiate between new patient appointments (longer slots) and existing patient visits, ask about morning or afternoon preference",
  },
  "Food & Restaurant": {
    primaryGoal: "Book a reservation or take a takeout/catering order",
    keyInfo:
      "Party size, preferred date and time, any special occasions, dietary restrictions or allergies, indoor/outdoor preference if applicable",
    scenarios:
      "Reservation booking, large party or private event inquiry, takeout order, catering quote, hours and location questions",
    pricingBehavior:
      "Share general info about menu and pricing ranges if asked, direct to website for full menu",
    schedulingNotes:
      "Confirm party size and time, mention wait times if applicable",
  },
  "Beauty & Grooming": {
    primaryGoal:
      "Book a service appointment with a specific stylist/barber if requested",
    keyInfo:
      "What service they want (haircut, color, nails, facial, etc.), preferred stylist or provider, preferred date/time, new client or returning",
    scenarios:
      "Booking a cut or color, asking about service pricing, requesting a specific stylist, walk-in availability, cancellation/rescheduling",
    pricingBehavior:
      'Share starting prices for common services if known (e.g. "haircuts start at..."), otherwise say "pricing varies by service and stylist, we can go over that when you come in"',
    schedulingNotes:
      "Ask for preferred provider if they have one, offer next available slot",
  },
  "Fitness & Wellness": {
    primaryGoal: "Book a class, session, or consultation",
    keyInfo:
      "What they're interested in (membership, class, personal training, specific therapy), experience level, preferred days/times, any injuries or limitations",
    scenarios:
      "New member inquiry, class schedule questions, personal training booking, massage or therapy appointment, cancellation",
    pricingBehavior:
      'Mention free trial or intro offers if applicable, say "we have a few membership options — would you like to come in for a tour so we can find the right fit?"',
    schedulingNotes:
      "Differentiate between drop-in classes vs recurring memberships vs one-on-one sessions",
  },
  Automotive: {
    primaryGoal: "Book a service appointment or provide an estimate",
    keyInfo:
      "Vehicle year, make, model, what issue or service they need, urgency, preferred drop-off date/time",
    scenarios:
      "Oil change or routine maintenance, check engine light or breakdown, collision/body work estimate, tire service, warranty service",
    pricingBehavior:
      'Share pricing for standard services (oil change, tire rotation) if known, say "for that we\'d want to take a look first — can we get you scheduled for a diagnostic?"',
    schedulingNotes:
      "Ask about drop-off vs wait, offer shuttle service if applicable",
  },
  "Professional Services": {
    primaryGoal: "Book a consultation or initial meeting",
    keyInfo:
      "What they need help with (case type, tax situation, business challenge), urgency or deadlines, whether they've worked with a similar professional before, preferred meeting format (in-person, phone, video)",
    scenarios:
      "New client consultation request, case/matter inquiry, document deadline questions, billing or invoice questions",
    pricingBehavior:
      'Say "we offer a free initial consultation to understand your situation" or "our rates vary depending on the scope — we\'d love to discuss in a brief intro meeting"',
    schedulingNotes:
      "Offer phone or video consultations as options, confirm time zones if relevant",
  },
  "Pet Services": {
    primaryGoal: "Book an appointment for the pet",
    keyInfo:
      "Type of pet and breed, what service is needed, pet's name, any special needs or behavioral notes, preferred date/time, vaccination status if required",
    scenarios:
      "Grooming appointment, boarding reservation, vet appointment, training class enrollment, daycare drop-off",
    pricingBehavior:
      "Share pricing for standard services (basic groom, boarding per night), mention breed-based pricing if applicable",
    schedulingNotes:
      "Ask about drop-off and pick-up times, mention vaccination requirements if applicable",
  },
  "Education & Tutoring": {
    primaryGoal: "Book a lesson, session, or enrollment",
    keyInfo:
      "Student age/grade level, subject or instrument, current skill level, goals, preferred schedule (after school, weekends), in-person or virtual",
    scenarios:
      "New student enrollment, schedule change, progress check-in, pricing inquiry, trial lesson request",
    pricingBehavior:
      'Mention trial lesson if available, say "we have a few package options depending on frequency — can we set up a quick intro session to find the right fit?"',
    schedulingNotes:
      "Work around school schedules, offer trial or assessment sessions",
  },
  "Real Estate": {
    primaryGoal: "Book a showing, consultation, or property inquiry",
    keyInfo:
      "Buying or selling, property type, budget range or listing price, preferred neighborhoods or areas, timeline",
    scenarios:
      "Inquiry about a specific listing, wanting to list a property, general buying consultation, market valuation request, open house schedule",
    pricingBehavior:
      'Do not discuss commission rates — say "we\'d love to sit down and go over everything in detail"',
    schedulingNotes:
      "Offer virtual or in-person meetings, confirm property addresses for showings",
  },
  "Events & Entertainment": {
    primaryGoal:
      "Book a service for an event or check availability for a date",
    keyInfo:
      "Event type (wedding, corporate, birthday, etc.), event date, location, estimated guest count, budget range, specific service details",
    scenarios:
      "Availability check for a date, package pricing inquiry, custom event request, vendor coordination questions",
    pricingBehavior:
      'Share package starting prices if applicable, say "pricing depends on the event size and what\'s included — can we set up a quick call to build a custom quote?"',
    schedulingNotes:
      "Confirm date availability first, then discuss details",
  },
  Other: {
    primaryGoal: "Book an appointment, consultation, or service",
    keyInfo:
      "What they need, preferred date/time, any relevant details",
    scenarios:
      "General inquiries, appointment requests, service questions",
    pricingBehavior:
      "Explain that pricing depends on the specific service and offer to have someone follow up with details",
    schedulingNotes:
      "Ask about preferred dates and times, be flexible and accommodating",
  },
};

interface CreateDemoRequest {
  industry: string;
  specialty: string;
  businessName: string;
  phoneNumber: string;
  customInstructions?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateDemoRequest = await request.json();

    // Validate input
    if (!body.businessName?.trim()) {
      return NextResponse.json(
        { error: "Business name is required" },
        { status: 400 }
      );
    }
    if (!body.industry?.trim()) {
      return NextResponse.json(
        { error: "Industry is required" },
        { status: 400 }
      );
    }
    if (!body.specialty?.trim()) {
      return NextResponse.json(
        { error: "Specialty is required" },
        { status: 400 }
      );
    }

    // Step 1: Generate custom receptionist system prompt with Claude
    const knowledge =
      INDUSTRY_KNOWLEDGE[body.industry] || INDUSTRY_KNOWLEDGE["Other"];

    const customInstructions = body.customInstructions?.trim() || "";

    const customInstructionsBlock = customInstructions
      ? `

The business owner has provided these additional instructions for how the receptionist should behave. These take priority over general industry defaults when there is a conflict:

${customInstructions}

Interpret the owner's instructions and weave them naturally into the receptionist's behavior. For example:
- If they mention promotions or deals, the receptionist should mention them naturally during the call when relevant (not as the first thing said)
- If they mention after-hours behavior, the receptionist should adjust its tone and urgency for calls outside business hours (e.g. "We're currently closed but I'd love to get you on the schedule for tomorrow morning")
- If they mention lead capture as the priority, the receptionist should be more assertive about collecting name, number, and service needed before the caller hangs up
- If they mention 24/7 coverage, the receptionist should never say "call back during business hours" and should always offer to book or take a message regardless of time
- If they mention screening calls, the receptionist should gather the caller's purpose and basic info before saying "let me see if someone is available"`
      : "";

    const rule13 = customInstructions
      ? "\n13. Follow the business owner's custom instructions above — integrate them naturally into the call flow without making them sound scripted or forced"
      : "";

    const claudeResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `You are an expert at creating AI receptionist system prompts for local businesses. Generate a custom system prompt for this business:

Industry: ${body.industry}
Specialty: ${body.specialty}
Business Name: "${body.businessName}"

This receptionist answers phone calls for this business. Here is what you need to know about this industry:

Primary booking goal: ${knowledge.primaryGoal}
Information to gather from callers: ${knowledge.keyInfo}
Common caller scenarios to handle: ${knowledge.scenarios}
How to handle pricing questions: ${knowledge.pricingBehavior}
Scheduling notes: ${knowledge.schedulingNotes}${customInstructionsBlock}

The system prompt you generate must:

1. Greet callers warmly using the business name: "${body.businessName}"
2. Sound like a real human receptionist — use contractions, casual phrasing, and a friendly tone
3. Follow the industry-specific booking flow above — ask the right questions in a natural conversational order, not all at once
4. Ask ONE question at a time, wait for the answer, then ask the next
5. Always work toward the primary goal: getting the caller booked or their info captured
6. Handle the common scenarios listed above naturally
7. Use the pricing guidance above when pricing comes up — never make up specific prices
8. Keep every response to 1-3 sentences max — this is a phone call, not an email
9. If the caller asks something outside your knowledge, say "Let me have someone from the team get back to you on that — can I grab your name and number?"
10. Always capture the caller's name and callback number before ending the call
11. Never mention being AI unless directly asked
12. Never fabricate information about the business${rule13}

Return ONLY the system prompt text. No markdown formatting, no explanations, no quotation marks wrapping it.`,
        },
      ],
    });

    const systemPrompt =
      claudeResponse.content[0].type === "text"
        ? claudeResponse.content[0].text
        : "";

    if (!systemPrompt) {
      throw new Error("Failed to generate system prompt");
    }

    // Step 2: Create Vapi assistant with the custom prompt
    const vapiResponse = await fetch("https://api.vapi.ai/assistant", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `PrimeVoice Demo - ${body.businessName}`,
        model: {
          provider: "anthropic",
          model: "claude-sonnet-4-5-20250929",
          systemPrompt: systemPrompt,
          temperature: 0.7,
          maxTokens: 300,
        },
        voice: {
          provider: "11labs",
          voiceId: "paula",
        },
        transcriber: {
          provider: "deepgram",
          model: "nova-2",
          language: "en-US",
        },
        firstMessage: `Thanks for calling ${body.businessName}, how can I help you today?`,
        firstMessageMode: "assistant-speaks-first",
      }),
    });

    if (!vapiResponse.ok) {
      const vapiError = await vapiResponse.json().catch(() => ({}));
      console.error("Vapi API error:", vapiError);
      const errorMessage = vapiError?.message || vapiError?.error || JSON.stringify(vapiError);
      throw new Error(`Failed to create AI assistant: ${errorMessage}`);
    }

    const assistant = await vapiResponse.json();

    return NextResponse.json({
      assistantId: assistant.id,
      businessName: body.businessName,
    });
  } catch (error) {
    console.error("Create demo error:", error);

    if (error instanceof Anthropic.APIError) {
      return NextResponse.json(
        {
          error: `AI service error: ${error.message}`,
        },
        { status: error.status || 503 }
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "We hit a snag building your receptionist. Please try again.",
      },
      { status: 500 }
    );
  }
}
