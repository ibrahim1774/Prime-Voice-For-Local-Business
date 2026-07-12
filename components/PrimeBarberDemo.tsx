"use client";

// Prime Barber landing — the click-to-call demo line for the $97/month
// all-in-one barber system (branded site, booking, product store, payments,
// dedicated app). Tapping the button dials the "Prime Barber" Vapi assistant,
// which answers any question about the program; qualified callers get the
// Prime Barber follow-up text with the booking link.
//
// Same monochrome .mv2 Call Sheet skin as /catch-all. The phone number is
// provisioned at runtime by /api/vapi/sync-primebarber, so it's fetched from
// /api/vapi/primebarber-config instead of being hardcoded.

import { useEffect, useState } from "react";
import BookingModal from "./BookingModal";

function fmtNumber(e164: string): string {
  const d = e164.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10
    ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
    : e164;
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

export default function PrimeBarberDemo() {
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [number, setNumber] = useState("");

  useEffect(() => {
    fetch("/api/vapi/primebarber-config")
      .then((r) => r.json())
      .then((d) => setNumber(typeof d?.number === "string" ? d.number : ""))
      .catch(() => {});
  }, []);

  // Same dual Lead as CallCTAButton: browser pixel + server CAPI, deduped by
  // eventID. content_name tags it primebarber so it's filterable on the
  // shared pixel in Ads Manager.
  function trackLead() {
    const eventId = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const fbq = (window as any).fbq;
    if (typeof fbq === "function") {
      fbq(
        "track",
        "Lead",
        {
          content_name: "/primebarber tap-to-call",
          content_category: "tap-to-call",
        },
        { eventID: eventId }
      );
    }
    fetch("/api/meta-lead-conversion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber: number, eventId }),
      keepalive: true,
    }).catch(() => {});
  }

  // Until the line is provisioned, the call CTAs fall back to the booker —
  // a visible primary button must never be a dead tap.
  const tel = number ? `tel:${number}` : undefined;
  const callProps = tel
    ? { href: tel, onClick: trackLead }
    : ({ role: "button", tabIndex: 0, onClick: () => setIsBookingOpen(true) } as const);

  return (
    <div className="mv2 mv2-catchall">
      <div className="mv2-catchall-shell">
        {/* Headline */}
        <h1 className="mv2-catchall-h mv2-ca-in" style={{ animationDelay: "0.1s" }}>
          <span className="mv2-catchall-h-muted">Own Your Chair, Own Your Business &mdash;</span>{" "}
          <span>Your Own Branded Barbershop Site, Booking, Store &amp; App &mdash; $97/month</span>
        </h1>

        {/* Subheadline */}
        <p className="mv2-catchall-sub mv2-ca-in" style={{ animationDelay: "0.24s" }}>
          Tap to call and ask anything &mdash; the Prime Barber line walks you
          through how you get your own branded website, online booking, a
          product store, payments, and a dedicated app. You own the domain and
          your clients, no commission ever. All of it for $97/month.
        </p>

        {/* Highlighted test-it-now pill — right above the live audio demo */}
        <a
          {...callProps}
          className="mv2-catchall-test mv2-ca-in"
          style={{ animationDelay: "0.36s", marginTop: "30px" }}
        >
          <span className="mv2-catchall-test-dot" aria-hidden="true" />
          Ask the Prime Barber line anything
        </a>

        <div className="mv2-ca-in" style={{ animationDelay: "0.46s" }}>
          <MiniWave />
        </div>

        {/* Call button */}
        <a {...callProps} className="mv2-btn mv2-btn-light mv2-catchall-call">
          <svg
            width="20"
            height="20"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
            />
          </svg>
          Call Now
        </a>

        {/* Clickable number */}
        {number ? (
          <>
            <a
              href={tel}
              onClick={trackLead}
              className="mv2-mono mv2-catchall-number mv2-ca-in"
              style={{ animationDelay: "0.6s" }}
            >
              {fmtNumber(number)}
            </a>
            <p className="mv2-catchall-hint mv2-ca-in" style={{ animationDelay: "0.68s" }}>
              Tap the number to call from your phone
            </p>
          </>
        ) : (
          <p className="mv2-catchall-hint mv2-ca-in" style={{ animationDelay: "0.6s" }}>
            The line is coming online &mdash; book a call below and we&apos;ll
            walk you through it live.
          </p>
        )}

        {/* Booking CTA — get the whole system built for their shop */}
        <div className="mv2-catchall-book mv2-ca-in" style={{ animationDelay: "0.8s" }}>
          <p className="mv2-catchall-book-h">
            Ready to own your whole setup?
          </p>
          <p className="mv2-catchall-book-sub">
            Book a free setup call &mdash; we build your branded site, booking,
            and store for you.
          </p>
          <button
            onClick={() => setIsBookingOpen(true)}
            className="mv2-btn mv2-btn-ghost mv2-btn-lg mv2-catchall-book-btn"
          >
            Book a call with the team
          </button>
        </div>
      </div>

      <BookingModal isOpen={isBookingOpen} onClose={() => setIsBookingOpen(false)} />
    </div>
  );
}
