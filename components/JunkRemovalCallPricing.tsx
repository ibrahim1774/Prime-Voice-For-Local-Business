"use client";

// /junk-removal — the /custom page, cut down and aimed at one trade.
//
// Same shape as CustomCallPricing: call-the-live-demo hero, then pricing,
// then the book-a-call fallback. Three deliberate differences (owner,
// 2026-09-17): copy is junk-removal specific, there is ONE plan at $99/mo,
// and the card's CTA is the demo call rather than Stripe checkout — nobody
// is asked to buy before they've heard it answer. There is no generation
// step and no business-name field; every caller reaches the same line.
//
// Styled on the existing monochrome .mv2 ink system (.mv2-cp-* in
// globals.css). The only new CSS is `.is-single` on the plan row: that row is
// a 2-up grid on phones sized to fit two cards at 390px, so one card alone
// would sit in the left column at 10px type.

import { useState } from "react";
import BookingModal from "./BookingModal";
import { SETUP_CALL_URL } from "@/lib/constants";

// Clearlot Junk Removal (assistant bd1d7544…) answers this line.
const CALL_NUMBER_DISPLAY = "(929) 281-0251";
const CALL_NUMBER_TEL = "tel:+19292810251";

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
];

// Tap-to-call fires Contact only. The Meta Lead for this page is sent
// server-side by /api/vapi/call-report once the caller has actually stayed
// on the demo line long enough to count.
function trackLead() {
  const eventId = `contact_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const fbq = (window as any).fbq;
  if (typeof fbq === "function") {
    fbq(
      "track",
      "Contact",
      { content_name: "/junk-removal tap-to-call", content_category: "tap-to-call" },
      { eventID: eventId }
    );
  }
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
  const [isBookingOpen, setIsBookingOpen] = useState(false);

  return (
    <div className="mv2 mv2-catchall mv2-cp">
      {/* ── Hero: headline + live-demo call card ── */}
      <div className="mv2-catchall-shell mv2-cp-hero">
        <h1 className="mv2-catchall-h mv2-ca-in" style={{ animationDelay: "0.08s", marginTop: 0 }}>
          You can&rsquo;t answer the phone with a couch in your hands.
        </h1>
        <p className="mv2-cp-sub mv2-ca-in" style={{ animationDelay: "0.16s" }}>
          The 24/7 answering agent that books junk jobs while your crew is on a route.
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
            Call for a live demo
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
          <p>Live in 24&ndash;48 hours, cancel anytime. Hear it first &mdash; then decide.</p>
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

            <h3 className="mv2-cp-name">Junk Removal Answering</h3>

            <ul className="mv2-cp-list">
              {INCLUDED.map((item) => (
                <li key={item}>
                  <CheckIcon />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <a
              href={CALL_NUMBER_TEL}
              onClick={trackLead}
              className="mv2-cp-cta mv2-cp-cta-call"
            >
              <PhoneIcon />
              Call for a live demo
            </a>
          </article>
        </div>

        {/* Book-a-call fallback, same as /custom */}
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
