"use client";

// /junk-removal — the /custom page, cut down and aimed at one trade.
//
// Shaped like CustomCallPricing: call-the-live-demo hero, then pricing.
// Junk-removal copy, ONE plan at $99/mo. NO book-a-call block (owner,
// 2026-09-18) — the page offers exactly two actions, hear it or buy it.
// There is no generation step and no business-name field; every caller
// reaches the same line.
//
// The hero owns the "call the demo" action; the card owns the buy. They were
// briefly the same button, which wasted the card (owner, 2026-09-17) — hear
// it in the hero, buy it in the card.
//
// Styled on the existing monochrome .mv2 ink system (.mv2-cp-* in
// globals.css). The only new CSS is `.is-single` on the plan row: that row is
// a 2-up grid on phones sized to fit two cards at 390px, so one card alone
// would sit in the left column at 10px type.

import { useState } from "react";

// Clearlot Junk Removal (assistant bd1d7544…) answers this line.
const CALL_NUMBER_DISPLAY = "(929) 281-0251";
const CALL_NUMBER_E164 = "+19292810251";
const CALL_NUMBER_TEL = `tel:${CALL_NUMBER_E164}`;

const PRICE = 99;

// What the agent actually collects on a junk call — these mirror the intake
// order in the assistant's prompt, so the page never promises more than the
// line delivers.
const INCLUDED = [
  "Answers 24/7 — mid-haul, after hours, weekends",
  "Gets the item list, the volume and where it's sitting",
  "Flags the heavy and hazardous stuff before you roll",
  "Captures the address, access and when they need it gone",
  "Texts you every lead before the caller hangs up",
  "Setup done for you — live in 24–48 hours",
];

// Tap-to-call fires Lead on BOTH rails with one shared eventID so Meta
// dedupes them: the browser pixel (blocked for plenty of visitors) and the
// server CAPI, which also sends the hashed number for matching.
//
// A browser cannot observe whether the tap actually became a call — the tel:
// handoff is the last thing we see. So Lead here means intent. The stricter
// signal is QualifiedLead, fired server-side by /api/vapi/call-report only
// after the caller has really stayed on the line. Optimise on whichever
// matches the campaign.
function trackLead() {
  const eventId = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const fbq = (window as any).fbq;
  if (typeof fbq === "function") {
    fbq(
      "track",
      "Lead",
      { content_name: "/junk-removal tap-to-call", content_category: "tap-to-call" },
      { eventID: eventId }
    );
  }
  // keepalive so the POST survives the browser handing off to the dialer.
  fetch("/api/meta-lead-conversion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber: CALL_NUMBER_E164, eventId }),
    keepalive: true,
  }).catch(() => {});
}

function MiniWave() {
  return (
    <div className="mv2-catchall-wave" aria-hidden="true">
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

function CheckIcon() {
  return (
    <svg className="mv2-cp-check" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

export default function JunkRemovalCallPricing() {
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  async function checkout() {
    if (isCheckingOut) return;
    setIsCheckingOut(true);
    try {
      const res = await fetch("/api/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: "Junk Removal Answering — /junk-removal",
          price: PRICE,
          // Explicit: /api/create-checkout defaults trialDays to 3 when the
          // field is absent, and this plan has no trial.
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
        setIsCheckingOut(false);
      }
    } catch (err) {
      console.error("Checkout error:", err);
      alert("Something went wrong starting checkout. Please try again or contact support.");
      setIsCheckingOut(false);
    }
  }

  return (
    <div className="mv2 mv2-catchall mv2-cp">
      {/* ── Hero: headline + live-demo call card ── */}
      <div className="mv2-catchall-shell mv2-cp-hero">
        <h1 className="mv2-catchall-h mv2-ca-in" style={{ animationDelay: "0.08s", marginTop: 0 }}>
          Junk removal voice agent
        </h1>
        <p className="mv2-cp-sub mv2-ca-in" style={{ animationDelay: "0.16s" }}>
          A missed call is the next guy&rsquo;s job. This one picks up nights,
          weekends and mid-haul &mdash; gets the load, the address and when
          &mdash; then texts you the lead.
        </p>

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
            Call the junk removal demo line
          </a>
          <p className="mv2-cp-demo-hint">
            {CALL_NUMBER_DISPLAY} &middot; call it like a customer with a garage to clear. Try to stump it.
          </p>
        </div>
      </div>

      {/* ── Pricing: one plan, and the CTA is the call ── */}
      <section
        className="mv2-cp-pricing mv2-ca-in"
        style={{ animationDelay: "0.4s" }}
        aria-labelledby="mv2-jr-plan-h"
      >
        <div className="mv2-cp-pricing-head">
          <h2 id="mv2-jr-plan-h">One line. One price.</h2>
          <p>
            We set it up for you and you&rsquo;re live in 24&ndash;48 hours.
            Cancel anytime &mdash; hear it first, then decide.
          </p>
        </div>

        <div className="mv2-cp-row is-single">
          <article className="mv2-cp-card is-featured">
            <div className="mv2-cp-top">
              <div className="mv2-cp-price">
                <span className="mv2-cp-amount">
                  <span className="mv2-cp-currency">$</span>
                  {PRICE}
                </span>
                <span className="mv2-cp-per">/mo</span>
              </div>
            </div>

            <h3 className="mv2-cp-name">Your own custom junk removal voice agent</h3>
            <div className="mv2-cp-minutes mv2-mono">
              80 min/mo included, then $1/min
            </div>

            <ul className="mv2-cp-list">
              {INCLUDED.map((item) => (
                <li key={item}>
                  <CheckIcon />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={checkout}
              disabled={isCheckingOut}
              className="mv2-cp-cta"
              aria-busy={isCheckingOut}
            >
              {isCheckingOut ? "Opening checkout…" : `Get started at $${PRICE}/mo`}
            </button>
            <p className="mv2-cp-cta-note">
              Heard it already? Start today &mdash; cancel anytime.
            </p>
          </article>
        </div>

      </section>

    </div>
  );
}
