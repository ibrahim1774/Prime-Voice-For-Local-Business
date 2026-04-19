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
  prompt: string;
}

interface ExtractedData {
  businessName: string;
  voiceGender: "female" | "male";
  systemPrompt: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateDemoRequest = await request.json();

    if (!body.prompt?.trim() || body.prompt.trim().length < 10) {
      return NextResponse.json(
        { error: "Please describe your business and what you'd like your AI to do." },
        { status: 400 }
      );
    }

    const userPrompt = body.prompt.trim();

    // Single Claude call: extract business name + voice gender + generate system prompt
    const claudeResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1536,
      messages: [
        {
          role: "user",
          content: `You are an expert at creating AI receptionist system prompts for local service businesses (HVAC, plumbing, landscaping, electrical, roofing, pest control, handyman, painting, cleaning, etc.). A business owner has described their business and what they want their AI receptionist to do. Your job is to:

1. Extract the business name from their description (if not explicitly mentioned, create a reasonable default like "Your Local Business")
2. Detect voice gender preference if mentioned (male or female — default to female if not specified)
3. Generate a custom system prompt tailored to what they described

Here's what the business owner wrote:
"""
${userPrompt}
"""

LOCAL BUSINESS CONTEXT (to inform the system prompt):
Primary goal: ${LOCAL_BUSINESS_KNOWLEDGE.primaryGoal}
Information to gather from callers: ${LOCAL_BUSINESS_KNOWLEDGE.keyInfo}
Common caller scenarios: ${LOCAL_BUSINESS_KNOWLEDGE.scenarios}
Pricing guidance: ${LOCAL_BUSINESS_KNOWLEDGE.pricingBehavior}
Scheduling notes: ${LOCAL_BUSINESS_KNOWLEDGE.schedulingNotes}

SYSTEM PROMPT REQUIREMENTS:
1. Greet callers warmly using the business name
2. Sound like a real human receptionist — use contractions, casual phrasing, warm tone
3. Ask ONE question at a time in natural conversational order — never dump multiple questions
4. Always work toward the primary goal: booking them or capturing their contact info
5. Handle the common scenarios naturally — be empathetic with urgent/emergency callers
6. Never make up specific prices — use the pricing guidance above
7. Keep every response to 1-3 sentences max (this is a phone call)
8. If caller asks something outside your knowledge, offer to have a team member call back
9. Always capture caller's name, address or service area, and callback number before ending
10. Never mention being AI unless directly asked
11. Use natural filler words ("sure thing", "absolutely", "of course", "gotcha", "no worries") sparingly
12. Use emotion tags like [warm], [reassuring], [enthusiastic] where appropriate to guide vocal delivery
13. Match caller energy — upbeat with upbeat, calm/steady with frustrated or stressed ones
14. Tailor the tone to what the business owner described above

Respond with ONLY a valid JSON object in this exact format — no markdown fences, no explanation:
{"businessName":"...","voiceGender":"female","systemPrompt":"..."}`,
        },
      ],
    });

    const rawText =
      claudeResponse.content[0].type === "text"
        ? claudeResponse.content[0].text
        : "";

    if (!rawText) {
      throw new Error("Failed to generate system prompt");
    }

    // Parse JSON response, tolerating possible code fences
    let extracted: ExtractedData;
    try {
      const cleaned = rawText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();
      extracted = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse Claude JSON:", rawText.slice(0, 500));
      throw new Error("Failed to parse AI response. Please try again.");
    }

    const businessName = extracted.businessName?.trim() || "Your Local Business";
    const voiceGender = extracted.voiceGender === "male" ? "male" : "female";
    const systemPrompt = extracted.systemPrompt?.trim();

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
