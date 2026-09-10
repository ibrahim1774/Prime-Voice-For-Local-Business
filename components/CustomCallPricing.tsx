"use client";

// /custom — call-the-live-demo hero (catch-all style, number never shown)
// followed by the two plans, visible immediately with no generation step.
//
// Plans (owner, 2026-09-10): $49 Email alerts · $99 Email + SMS alerts.
// The channel a lead reaches the owner on is THE difference between the
// tiers, so each card leads with it. No free trial — the card is charged at
// checkout via /api/create-checkout. Styled on the monochrome .mv2 ink
// system: the $99 card is set in paper against the carbon page so hierarchy
// comes from material, not a colored border (see .mv2-cp-* in globals.css).

import { useState } from "react";
import BookingModal from "./BookingModal";
import { SETUP_CALL_URL } from "@/lib/constants";

// Dialed, never displayed — the button copy carries the CTA.
const CALL_NUMBER_TEL = "tel:+19289689136";

type Channel = "email" | "sms";

interface Plan {
  id: string;
  name: string;
  price: number;
  channels: Channel[];
  channelLabel: string;
  tagline: string;
  minutes: string;
  inherit?: string;
  bullets: string[];
  featured?: boolean;
}

const PLANS: Plan[] = [
  {
    id: "email-alerts",
    name: "Email Alerts",
    price: 49,
    channels: ["email"],
    channelLabel: "Email",
    tagline: "Every lead call lands in your inbox.",
    minutes: "45 minutes a month included, then $1 per extra minute",
    bullets: [
      "Every call answered, 24/7 — sounds like a real person",
      "Runs all day, after-hours only, or just overflow",
      "Live transfer — your phone rings first",
      "Appointments booked while you work",
      "Instant email with the caller's name, number, and what they need",
      "Knows your services, prices, and hours",
      "Keep your current business number",
    ],
  },
  {
    id: "email-sms-alerts",
    name: "Email + SMS Alerts",
    price: 99,
    channels: ["email", "sms"],
    channelLabel: "Email + SMS",
    tagline: "Every lead call texted to your phone, and emailed.",
    minutes: "80 minutes a month included, then $1 per extra minute",
    featured: true,
    inherit: "Everything in Email Alerts, plus",
    bullets: [
      "A text hits your phone the moment a lead calls — call them back in seconds",
      "Caller's name, number, and what they need in the text",
      "80 minutes a month instead of 45",
      "Priority help whenever you want something changed",
    ],
  },
];

function trackLead() {
  const eventId = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const fbq = (window as any).fbq;
  if (typeof fbq === "function") {
    fbq(
      "track",
      "Lead",
      { content_name: "/custom tap-to-call", content_category: "tap-to-call" },
      { eventID: eventId }
    );
  }
  fetch("/api/meta-lead-conversion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber: "+19289689136", eventId }),
    keepalive: true,
  }).catch(() => {});
}

function MiniWave() {
  return (
    <div className="mv2-catchall-wave" aria-hidden="true" style={{ marginTop: 0 }}>
      {Array.from({ length: 22 }, (_, i) => (
        <span
          key={i}
          style={{
            animationDelay: `${(i % 7) * 0.13}s`,
            animationDuration: `${0.9 + ((i * 5) % 4) * 0.14}s`,
          }}
        />
      ))}
    </div>
  );
}

function Check() {
  return (
    <svg className="mv2-cp-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 7.5 12 13l8.5-5.5" />
    </svg>
  );
}

function SmsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.6 3.2c-.5.35-1.4 0-1.4-.7z" />
      <path strokeLinecap="round" d="M8 9h8M8 12.5h5" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
      />
    </svg>
  );
}

export default function CustomCallPricing() {
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function checkout(plan: Plan) {
    if (loadingId) return;
    setLoadingId(plan.id);
    try {
      const res = await fetch("/api/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: `${plan.name} plan — /custom`,
          price: plan.price,
          trialDays: 0,
          interval: "month",
          embedded: false,
        }),
      });
      const data: { url?: string; error?: string } = await res.json().catch(() => ({}));
      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error("Checkout failed:", data.error || "no url returned");
        alert("Something went wrong starting checkout. Please try again or contact support.");
        setLoadingId(null);
      }
    } catch (err) {
      console.error("Checkout error:", err);
      alert("Something went wrong starting checkout. Please try again or contact support.");
      setLoadingId(null);
    }
  }

  return (
    <div className="mv2 mv2-catchall mv2-cp">
      {/* ── Hero: headline + live demo call card ── */}
      <div className="mv2-catchall-shell mv2-cp-hero">
        <h1 className="mv2-catchall-h mv2-ca-in" style={{ animationDelay: "0.1s", marginTop: 0 }}>
          <span className="mv2-catchall-h-muted">A Missed Call Can = Lost Money.</span>{" "}
          <span>The New 24/7 Human-Like Answering Agent for Local Businesses</span>
        </h1>

        <p className="mv2-catchall-sub mv2-ca-in" style={{ animationDelay: "0.24s" }}>
          Call it and talk like a real customer would. Tell the agent what your
          business does and hear how it answers your calls, books your jobs, and
          captures your leads.
        </p>

        <div className="mv2-cp-democard mv2-ca-in" style={{ animationDelay: "0.36s" }}>
          <div className="mv2-cp-demo-status">
            <span className="mv2-cp-demo-dot" aria-hidden="true" />
            Live demo line is open
          </div>
          <MiniWave />
          <a
            href={CALL_NUMBER_TEL}
            onClick={trackLead}
            className="mv2-btn mv2-btn-light mv2-catchall-call mv2-cp-call"
          >
            <PhoneIcon />
            Call the live demo
          </a>
          <p className="mv2-cp-demo-hint">
            One tap starts a real call. Try to stump it.
          </p>
        </div>
      </div>

      {/* ── Pricing ── */}
      <section className="mv2-cp-pricing mv2-ca-in" style={{ animationDelay: "0.72s" }} aria-labelledby="mv2-cp-plans-h">
        <div className="mv2-cp-pricing-head">
          <h2 id="mv2-cp-plans-h">Pick how you want to hear about every lead.</h2>
          <p>
            Same agent on both plans. We set it up for you within 24–48 hours.
            No setup fee, cancel anytime.
          </p>
        </div>

        <div className="mv2-cp-grid">
          {PLANS.map((plan) => {
            const featured = !!plan.featured;
            return (
              <article
                key={plan.id}
                className={`mv2-cp-card${featured ? " is-featured" : ""}`}
              >
                {featured && <div className="mv2-cp-flag">Most owners choose this</div>}

                <div className="mv2-cp-channels" aria-label={`Alerts by ${plan.channelLabel}`}>
                  <span className={`mv2-cp-chip${plan.channels.includes("email") ? " on" : ""}`}>
                    <MailIcon /> Email
                  </span>
                  <span className={`mv2-cp-chip${plan.channels.includes("sms") ? " on" : ""}`}>
                    <SmsIcon /> SMS
                  </span>
                </div>

                <h3 className="mv2-cp-name">{plan.name}</h3>
                <p className="mv2-cp-tagline">{plan.tagline}</p>

                <div className="mv2-cp-price">
                  <span className="mv2-cp-amount">
                    <span className="mv2-cp-currency">$</span>
                    {plan.price}
                  </span>
                  <span className="mv2-cp-per">per month</span>
                </div>
                <div className="mv2-cp-minutes mv2-mono">{plan.minutes}</div>

                <button
                  type="button"
                  onClick={() => checkout(plan)}
                  disabled={!!loadingId}
                  className="mv2-cp-cta"
                  aria-busy={loadingId === plan.id}
                >
                  {loadingId === plan.id ? "Opening checkout…" : `Get started at $${plan.price}/mo`}
                </button>

                {plan.inherit && <p className="mv2-cp-inherit">{plan.inherit}</p>}
                <ul className="mv2-cp-list">
                  {plan.bullets.map((b) => (
                    <li key={b}>
                      <Check />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>

        <p className="mv2-cp-fine">
          Cancel whenever you like.
        </p>

        {/* Book-a-call fallback */}
        <div className="mv2-cp-book">
          <p>Rather talk it through first?</p>
          <div className="mv2-cp-book-actions">
            <button onClick={() => setIsBookingOpen(true)} className="mv2-btn mv2-btn-ghost">
              Book a call with the team
            </button>
            <a href={SETUP_CALL_URL} target="_blank" rel="noopener noreferrer" className="mv2-cp-book-link">
              Free 10-minute call
            </a>
          </div>
        </div>
      </section>

      <BookingModal isOpen={isBookingOpen} onClose={() => setIsBookingOpen(false)} />
    </div>
  );
}
