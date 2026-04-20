import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const LOCAL_BUSINESS_KNOWLEDGE = {
  primaryGoal: "Book the caller for a service appointment or capture their contact info",
  keyInfo:
    "Type of service needed, reason for the call (emergency, routine, quote, follow-up), preferred date/time, address or service area, any urgency",
  scenarios:
    "Existing customer wanting to book a follow-up or routine service, new customer requesting a quote, emergency/urgent service calls (leak, outage, breakdown), after-hours inquiries, cancellation or rescheduling, insurance estimates, pricing questions",
  pricingBehavior:
    'Say "pricing depends on the specifics — I can have our team send you a free quote after we gather a few details"',
  schedulingNotes:
    "Ask about morning or afternoon preference, whether it's urgent or can wait, and confirm the service address",
};

interface CreateDemoRequest {
  businessName: string;
  phoneNumber: string;
  voiceGender?: "female" | "male";
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateDemoRequest = await request.json();

    if (!body.businessName?.trim()) {
      return NextResponse.json(
        { error: "Business name is required" },
        { status: 400 }
      );
    }

    const phoneDigits = (body.phoneNumber || "").replace(/\D/g, "");
    if (phoneDigits.length < 10) {
      return NextResponse.json(
        { error: "A valid phone number is required" },
        { status: 400 }
      );
    }

    const businessName = body.businessName.trim();
    const voiceGender = body.voiceGender === "male" ? "male" : "female";

    // Generate custom local-business receptionist system prompt with Claude
    const claudeResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `You are an expert at creating AI receptionist system prompts for local service businesses (HVAC, plumbing, landscaping, electrical, roofing, pest control, handyman, painting, cleaning, etc.). Generate a custom system prompt for this business:

Business Name: "${businessName}"

This receptionist answers phone calls for this local business. The goal is to book service appointments, answer customer inquiries, handle emergencies, and capture leads. Here is what you need to know:

Primary goal: ${LOCAL_BUSINESS_KNOWLEDGE.primaryGoal}
Information to gather from callers: ${LOCAL_BUSINESS_KNOWLEDGE.keyInfo}
Common caller scenarios to handle: ${LOCAL_BUSINESS_KNOWLEDGE.scenarios}
How to handle pricing questions: ${LOCAL_BUSINESS_KNOWLEDGE.pricingBehavior}
Scheduling notes: ${LOCAL_BUSINESS_KNOWLEDGE.schedulingNotes}

The system prompt you generate must:

1. Greet callers warmly using the business name: "${businessName}"
2. Sound like a real human receptionist — use contractions, casual phrasing, and a friendly, warm tone
3. Ask ONE question at a time, wait for the answer, then ask the next — never dump multiple questions at once
4. Always work toward the primary goal: booking the caller or capturing their contact info
5. Handle common local-service scenarios naturally — be especially empathetic with emergency/urgent callers
6. Never make up specific prices — use the pricing guidance above
7. Keep every response to 1-3 sentences max — this is a phone call, not an email
8. If the caller asks something outside your knowledge, say "Let me have someone from our team get back to you on that — can I grab your name and number?"
9. Always capture the caller's name, service address (or zip code), and callback number before ending the call
10. Never mention being AI unless directly asked
11. Never fabricate specifics about the business (owner names, exact hours, specific services not mentioned)
12. Match the caller's energy — upbeat with upbeat, calm/steady with stressed or frustrated callers
13. Use natural filler words occasionally ("sure thing", "absolutely", "of course", "gotcha", "no worries")
14. Inject light, appropriate wit when the conversation allows — warm and professional, never corporate
15. Show genuine enthusiasm when a caller wants to book
16. Use emotion tags like [warm], [reassuring], [enthusiastic] in appropriate places to guide vocal delivery
17. When a caller describes an emergency (leak, outage, breakdown), respond with genuine concern — slow your pace, use a softer tone
18. Vary your speaking pace naturally — don't speak at the same speed throughout

Return ONLY the system prompt text. No markdown formatting, no explanations, no quotation marks wrapping it.`,
        },
      ],
    });

    const systemPrompt =
      claudeResponse.content[0].type === "text"
        ? claudeResponse.content[0].text.trim()
        : "";

    if (!systemPrompt) {
      throw new Error("Failed to generate system prompt");
    }

    const voiceId =
      voiceGender === "male"
        ? "a167e0f3-df7e-4d52-a9c3-f949145efdab" // Customer Support Man
        : "e3827ec5-697a-4b7c-9704-1a23041bbc51"; // Sweet Lady

    // Create Vapi assistant
    const vapiResponse = await fetch("https://api.vapi.ai/assistant", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `PrimeVoice Demo - ${businessName}`.substring(0, 40),
        model: {
          provider: "anthropic",
          model: "claude-sonnet-4-5-20250929",
          systemPrompt: systemPrompt,
          temperature: 0.7,
          maxTokens: 300,
        },
        voice: {
          provider: "cartesia",
          voiceId: voiceId,
          model: "sonic-3",
        },
        transcriber: {
          provider: "deepgram",
          model: "nova-3",
          language: "en-US",
          smartFormat: true,
          endpointing: 300,
          confidenceThreshold: 0.4,
        },
        backgroundSpeechDenoisingPlan: {
          smartDenoisingPlan: { enabled: true },
        },
        firstMessage: `Thanks for calling ${businessName}, how can I help you today?`,
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
      businessName: businessName,
    });
  } catch (error) {
    console.error("Create demo error:", error);

    if (error instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `AI service error: ${error.message}` },
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
