"use client";

// /custom — call-the-live-demo hero (catch-all style, number never shown)
// followed by the two plans, visible immediately with no generation step.
//
// Plans (owner, 2026-09-13): $97 Email alerts · $197 Email + SMS alerts.
// The channel a lead reaches the owner on is THE difference between the
// tiers, so each card leads with it. No free trial — the card is charged at
// checkout via /api/create-checkout. Styled on the monochrome .mv2 ink
// system: the $197 card is set in paper against the carbon page so hierarchy
// comes from material, not a colored border (see .mv2-cp-* in globals.css).

import { useEffect, useRef, useState } from "react";
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
    price: 97,
    channels: ["email"],
    channelLabel: "Email",
    tagline: "Every lead call lands in your inbox.",
    minutes: "45 min a month included, then $1 per extra minute",
    bullets: [
      "Every call answered 24/7, sounds like a real person",
      "Live transfer, your phone rings first",
      "Appointments booked while you work",
      "Instant email: caller's name, number, what they need",
      "Keep your current business number",
    ],
  },
  {
    id: "email-sms-alerts",
    name: "Email + SMS Alerts",
    price: 197,
    channels: ["email", "sms"],
    channelLabel: "Email + SMS",
    tagline: "Every lead call texted to your phone, and emailed.",
    minutes: "80 min a month included, then $1 per extra minute",
    featured: true,
    inherit: "Everything in Email Alerts, plus",
    bullets: [
      "A text hits your phone the moment a lead calls",
      "Caller's name, number, and what they need, in the text",
      "80 minutes a month instead of 45",
      "Priority help whenever you want something changed",
    ],
  },
];

// Tap-to-call fires Contact only. The Meta Lead for this page is sent
// server-side by /api/vapi/call-report once the caller has actually stayed
// on the demo line for 20+ seconds (owner call 2026-09-11); Purchase fires
// on /thank-you after Stripe checkout.
function trackLead() {
  const eventId = `contact_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const fbq = (window as any).fbq;
  if (typeof fbq === "function") {
    fbq(
      "track",
      "Contact",
      { content_name: "/custom tap-to-call", content_category: "tap-to-call" },
      { eventID: eventId }
    );
  }
}

function MiniWave() {
  return (
    <div className="mv2-catchall-wave mv2-cp-wave" aria-hidden="true">
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
  const [activeCard, setActiveCard] = useState(0);
  const rowRef = useRef<HTMLDivElement>(null);

  // Swipe dots: which card is mostly in view on the phone-width row.
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const onScroll = () => {
      const first = row.firstElementChild as HTMLElement | null;
      const second = first?.nextElementSibling as HTMLElement | null;
      // Measure the real card pitch so the dots stay correct when the gap
      // or the card width changes in CSS.
      const step =
        first && second
          ? second.offsetLeft - first.offsetLeft
          : (first?.offsetWidth || row.clientWidth || 1);
      setActiveCard(Math.round(row.scrollLeft / Math.max(step, 1)));
    };
    row.addEventListener("scroll", onScroll, { passive: true });
    return () => row.removeEventListener("scroll", onScroll);
  }, []);

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
      {/* ── Hero: headline + compact live-demo call card ── */}
      <div className="mv2-catchall-shell mv2-cp-hero">
        <p className="mv2-cp-kicker mv2-ca-in" style={{ animationDelay: "0.06s" }}>
          Local businesses miss calls every day. Every missed call = lost money.
        </p>
        <h1 className="mv2-catchall-h mv2-ca-in" style={{ animationDelay: "0.1s", marginTop: 0 }}>
          The New 24/7 Human-Like Answering Agent for Local Businesses
        </h1>

        <div className="mv2-cp-democard mv2-ca-in" style={{ animationDelay: "0.24s" }}>
          <div className="mv2-cp-demo-top">
            <span className="mv2-cp-demo-dot" aria-hidden="true" />
            <span className="mv2-cp-demo-status">Live demo line is open</span>
            <MiniWave />
          </div>
          <a
            href={CALL_NUMBER_TEL}
            onClick={trackLead}
            className="mv2-btn mv2-btn-light mv2-catchall-call mv2-cp-call"
          >
            <PhoneIcon />
            Call the live demo
          </a>
          <p className="mv2-cp-demo-hint">Talk to it like a real customer would. Try to stump it.</p>
        </div>
      </div>

      {/* ── Pricing ── */}
      <section className="mv2-cp-pricing mv2-ca-in" style={{ animationDelay: "0.4s" }} aria-labelledby="mv2-cp-plans-h">
        <div className="mv2-cp-pricing-head">
          <h2 id="mv2-cp-plans-h">Pick how you hear about every lead.</h2>
          <p>Same agent on both. Set up for you within 24–48 hours. No setup fee, cancel anytime.</p>
        </div>

        <div className="mv2-cp-row" ref={rowRef}>
          {PLANS.map((plan) => {
            const featured = !!plan.featured;
            return (
              <article key={plan.id} className={`mv2-cp-card${featured ? " is-featured" : ""}`}>
                <div className="mv2-cp-top">
                  <div className="mv2-cp-channels" aria-label={`Alerts by ${plan.channelLabel}`}>
                    <span className={`mv2-cp-chip${plan.channels.includes("email") ? " on" : ""}`}>
                      <MailIcon /> Email
                    </span>
                    <span className={`mv2-cp-chip${plan.channels.includes("sms") ? " on" : ""}`}>
                      <SmsIcon /> SMS
                    </span>
                  </div>
                  <div className="mv2-cp-price">
                    <span className="mv2-cp-amount">
                      <span className="mv2-cp-currency">$</span>
                      {plan.price}
                    </span>
                    <span className="mv2-cp-per">/mo</span>
                  </div>
                </div>

                <h3 className="mv2-cp-name">{plan.name}</h3>
                <p className="mv2-cp-tagline">{plan.tagline}</p>
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
        <div className="mv2-cp-dots" aria-hidden="true">
          {PLANS.map((p, i) => (
            <span key={p.id} className={i === activeCard ? "on" : ""} />
          ))}
        </div>

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
