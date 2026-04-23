import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

export async function POST(request: NextRequest) {
  try {
    const stripe = getStripe();
    const body = await request.json().catch(() => ({}));
    const businessName: string = body.businessName || "";
    const interval: "month" | "year" = body.interval === "year" ? "year" : "month";
    const defaultAmount = interval === "year" ? 59900 : 9900;
    const unitAmount: number = body.price ? Math.round(body.price * 100) : defaultAmount;
    const trialDays: number = body.trialDays ?? 3;
    const embedded: boolean = body.embedded === true;

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.primevoiceai.com";
    const successUrl = `${siteUrl}/thank-you?session_id={CHECKOUT_SESSION_ID}`;

    // Typed as `any` because Stripe v22 types narrow `ui_mode` per overload,
    // which blocks conditional mutation between 'hosted' and 'embedded'. The
    // Stripe runtime accepts both shapes just fine.
    const params: any = {
      mode: "subscription",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "PrimeVoice AI Receptionist",
              description: businessName
                ? `AI Receptionist for ${businessName}`
                : "AI Receptionist — 24/7 call answering for your business",
            },
            unit_amount: unitAmount,
            recurring: { interval },
          },
          quantity: 1,
        },
      ],
      subscription_data: {
        metadata: { businessName, interval },
        ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
      },
      metadata: { businessName, interval },
    };

    if (embedded) {
      params.ui_mode = "embedded";
      params.redirect_on_completion = "always";
      params.return_url = successUrl;
    } else {
      params.success_url = successUrl;
      params.cancel_url = siteUrl;
    }

    const session = await stripe.checkout.sessions.create(params);

    return NextResponse.json(
      embedded
        ? { clientSecret: session.client_secret }
        : { url: session.url }
    );
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
