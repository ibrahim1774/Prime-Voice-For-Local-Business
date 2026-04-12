import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface CreateDemoRequest {
  businessName: string;
  phoneNumber: string;
  goal: string;
  voiceGender?: "female" | "male";
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
    if (!body.goal?.trim()) {
      return NextResponse.json(
        { error: "Goal is required" },
        { status: 400 }
      );
    }

    // Voice selection
    const voiceId = body.voiceGender === "male"
      ? "34575e71-908f-4ab6-ab54-b08c95d6597d"
      : "e3827ec5-697a-4b7c-9704-1a23041bbc51";

    // Step 1: Generate custom receptionist system prompt with Claude
    const claudeResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `You are an expert at creating AI receptionist system prompts for local businesses. Generate a custom system prompt for this business:

Goal: ${body.goal}
Business Name: "${body.businessName}"

The system prompt you generate must:

1. Greet callers warmly using the business name: "${body.businessName}"
2. Sound like a real human receptionist — use contractions, casual phrasing, and a friendly tone
3. Focus on the business's primary goal: "${body.goal}" — tailor your questions and conversation flow around achieving this
4. Ask ONE question at a time, wait for the answer, then ask the next
5. Always work toward the primary goal: getting the caller booked or their info captured
6. Keep every response to 1-3 sentences max — this is a phone call, not an email
7. If the caller asks something outside your knowledge, say "Let me have someone from the team get back to you on that — can I grab your name and number?"
8. Always capture the caller's name and callback number before ending the call
9. Never mention being AI unless directly asked
10. Never fabricate information about the business
11. Match the caller's energy — if they're upbeat, be upbeat back; if they're serious, be more professional
12. Use natural filler words occasionally like "sure thing", "absolutely", "of course", "gotcha", "no worries"
13. Show genuine enthusiasm when helping — "Oh that's great!", "Awesome, let me get you set up"
14. Add light wit when appropriate — keep it warm and human, never robotic
15. Use emotion and personality — laugh when something's funny, show empathy when someone has a problem

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
        name: `PrimeVoice Demo - ${body.businessName}`.substring(0, 40),
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
