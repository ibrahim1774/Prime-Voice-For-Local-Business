"use client";

// Catch-all landing — a click-to-call page. Tapping the button (or the number)
// dials the standing "Catch all" Montivaro voice agent assigned to this number
// in Vapi, which runs the full adaptive demo over a real phone call. Below it,
// a "Book a call with the team" button opens the setup-call booker so they can
// get the voice agent custom-built for their business.
//
// Styled on the homepage's monochrome .mv2 system (carbon + paper, Archivo
// display, Plex Mono details) — same copy, same length, premium skin.

import { useState } from "react";
import BookingModal from "./BookingModal";

const CALL_NUMBER_DISPLAY = "(928) 968-9136";
const CALL_NUMBER_TEL = "tel:+19289689136";

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

export default function CatchAllDemo() {
  const [isBookingOpen, setIsBookingOpen] = useState(false);

  return (
    <div className="mv2 mv2-catchall">
      <div className="mv2-catchall-shell">
        {/* Badge */}
        <p className="mv2-eyebrow mv2-catchall-badge mv2-ca-in" style={{ animationDelay: "0.05s" }}>
          <span className="mv2-live-dot" aria-hidden="true" />
          Live Demo
        </p>

        {/* Headline */}
        <h1 className="mv2-catchall-h mv2-ca-in" style={{ animationDelay: "0.15s" }}>
          <span className="mv2-catchall-h-muted">Don&apos;t Miss Another Customer Call &mdash;</span>{" "}
          <span>A 24/7 Human-Like Answering Agent for Local Businesses</span>
        </h1>

        {/* Subheadline */}
        <p className="mv2-catchall-sub mv2-ca-in" style={{ animationDelay: "0.28s" }}>
          Tap to call and talk like a real customer would &mdash; tell the voice
          agent what your business does and it&apos;ll show you exactly how it&apos;d
          answer your calls, book your jobs, and capture your leads.
        </p>

        <div className="mv2-ca-in" style={{ animationDelay: "0.4s" }}>
          <MiniWave />
        </div>

        {/* Call button */}
        <a
          href={CALL_NUMBER_TEL}
          className="mv2-btn mv2-btn-light mv2-catchall-call mv2-ca-in"
          style={{ animationDelay: "0.5s" }}
        >
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
        <a
          href={CALL_NUMBER_TEL}
          className="mv2-mono mv2-catchall-number mv2-ca-in"
          style={{ animationDelay: "0.6s" }}
        >
          {CALL_NUMBER_DISPLAY}
        </a>

        <p className="mv2-catchall-hint mv2-ca-in" style={{ animationDelay: "0.68s" }}>
          Tap the number to call from your phone
        </p>

        {/* Booking CTA — get it custom-built for their business */}
        <div className="mv2-catchall-book mv2-ca-in" style={{ animationDelay: "0.8s" }}>
          <p className="mv2-catchall-book-h">
            Get your custom-tailored voice agent implemented in your business
          </p>
          <p className="mv2-catchall-book-sub">
            We&apos;ll set it up and custom-build your voice agent for your business.
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
