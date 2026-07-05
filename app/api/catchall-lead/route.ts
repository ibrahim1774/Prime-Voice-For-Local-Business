import { NextRequest, NextResponse } from "next/server";

/*
 * Receives Vapi's end-of-call report for the "Catch all" demo assistant and
 * forwards the captured lead to a Make.com webhook.
 *
 * Vapi is configured (see scripts/create-catchall.mjs) with serverMessages:
 * ["end-of-call-report"] and an analysisPlan.structuredDataPlan, so it POSTs
 * { message: { type: "end-of-call-report", analysis: { structuredData, summary },
 *   customer, call, ... } } here when a call ends.
 *
 * Best-effort: always returns 200 so Vapi never retries on our-side issues.
 * Set CATCHALL_LEAD_WEBHOOK_URL to your Make.com webhook to receive leads.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = body?.message ?? {};

    // Only act on the end-of-call report; ignore any other server messages.
    if (message?.type !== "end-of-call-report") {
      return NextResponse.json({ received: true, ignored: message?.type ?? "unknown" });
    }

    const analysis = message?.analysis ?? {};
    const structured = analysis?.structuredData ?? {};
    const customer = message?.customer ?? message?.call?.customer ?? {};

    const lead = {
      source: "montivaro-catchall",
      // The AI-captured fields (may be partial if the caller hung up early).
      callerName: structured.callerName ?? null,
      callbackNumber: structured.callbackNumber ?? customer?.number ?? null,
      businessName: structured.businessName ?? null,
      industry: structured.industry ?? null,
      location: structured.location ?? null,
      services: structured.services ?? null,
      interest: structured.interest ?? null,
      // Context for follow-up.
      summary: analysis?.summary ?? null,
      callerPhone: customer?.number ?? null,
      endedReason: message?.endedReason ?? null,
      callId: message?.call?.id ?? null,
      timestamp: new Date().toISOString(),
    };

    const webhookUrl = process.env.CATCHALL_LEAD_WEBHOOK_URL;
    if (!webhookUrl) {
      console.warn("[catchall-lead] CATCHALL_LEAD_WEBHOOK_URL not set; lead not forwarded", lead);
      return NextResponse.json({ received: true, forwarded: false });
    }

    try {
      const r = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lead),
      });
      if (!r.ok) {
        console.error("[catchall-lead] webhook returned", r.status, (await r.text()).slice(0, 300));
      }
    } catch (err) {
      console.error("[catchall-lead] webhook post failed", err);
    }

    return NextResponse.json({ received: true, forwarded: true });
  } catch (err) {
    console.error("[catchall-lead] handler error", err);
    // Still 200 so Vapi doesn't retry on our-side failures.
    return NextResponse.json({ received: true, error: true });
  }
}
