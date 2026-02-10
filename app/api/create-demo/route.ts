import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface CreateDemoRequest {
  businessName: string;
  phoneNumber: string;
  businessDescription: string;
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
    if (!body.businessDescription?.trim()) {
      return NextResponse.json(
        { error: "Business description is required" },
        { status: 400 }
      );
    }

    // Step 1: Generate custom receptionist system prompt with Claude
    const claudeResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Generate a voice AI receptionist system prompt for the following business:

Business Name: "${body.businessName}"
Business Description: ${body.businessDescription}

The receptionist system prompt you generate should instruct the AI to:
- Greet callers warmly using the business name "${body.businessName}"
- Sound professional, friendly, and knowledgeable about the specific services they offer
- Be able to answer common questions about their services based on the description provided
- Offer to schedule appointments or take a message with the caller's name and phone number
- Politely defer specific pricing questions (e.g., "I'd be happy to have the team get you a detailed quote — can I get your name and number?")
- Keep ALL responses short and conversational — 1 to 3 sentences maximum, since this is a voice conversation, not text
- Handle common contractor scenarios: emergency/urgent calls, after-hours calls, existing customer follow-ups
- Never fabricate information not provided in the business description
- If unsure about something, offer to take a message so the owner can call back with details
- Sound natural and human — use contractions, casual phrasing, and a warm tone
- Never mention being an AI unless directly asked

Return ONLY the system prompt text. No markdown formatting, no explanations, no surrounding quotes, no preamble.`,
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
        name: `Prime Demo - ${body.businessName}`,
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
      throw new Error("Failed to create AI assistant");
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
          error:
            "Our AI service is temporarily unavailable. Please try again in a moment.",
        },
        { status: 503 }
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
