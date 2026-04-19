import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

// Returns minimal, non-sensitive session data used by the thank-you page
// to fire an accurate Purchase event (value, interval, customer email).
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items", "subscription"],
    });

    const lineItem = session.line_items?.data?.[0];
    const unitAmount = lineItem?.price?.unit_amount ?? 0;
    const currency = (lineItem?.price?.currency || session.currency || "usd").toUpperCase();
    const interval = lineItem?.price?.recurring?.interval || "month";
    const email = session.customer_details?.email || session.customer_email || "";

    return NextResponse.json({
      value: unitAmount / 100,
      currency,
      interval,
      email,
      paymentStatus: session.payment_status,
    });
  } catch (error) {
    console.error("Stripe session lookup error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve session" },
      { status: 500 }
    );
  }
}
