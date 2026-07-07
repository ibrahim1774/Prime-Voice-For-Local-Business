"use client";

// Catch-all landing — a click-to-call page. Tapping the button (or the number)
// dials the standing "Catch all" Montivaro voice agent assigned to this number
// in Vapi, which runs the full adaptive demo over a real phone call. Below it,
// a "Book a call with the team" button opens the setup-call booker so they can
// get the voice agent custom-built for their business.

import { useState } from "react";
import BookingModal from "./BookingModal";

const CALL_NUMBER_DISPLAY = "(928) 968-9136";
const CALL_NUMBER_TEL = "tel:+19289689136";

export default function CatchAllDemo() {
  const [isBookingOpen, setIsBookingOpen] = useState(false);

  return (
    <div className="min-h-[100dvh] w-full dotted-grid-bg">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col items-center justify-center px-4 py-12 text-center">
        {/* Badge */}
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#e3e3e0] bg-white px-4 py-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-sans text-xs font-medium uppercase tracking-wider text-muted">
            Live Demo
          </span>
        </div>

        {/* Headline */}
        <h1 className="font-serif text-2xl font-bold md:text-4xl">
          <span className="text-muted">Don&apos;t Miss Another Customer Call &mdash;</span>{" "}
          <span className="font-bold text-foreground">
            A 24/7 Human-Like Answering Agent for Local Businesses
          </span>
        </h1>

        {/* Subheadline */}
        <p className="mx-auto mt-3 max-w-lg font-sans text-sm leading-relaxed text-muted md:text-base">
          Tap to call and talk like a real customer would &mdash; tell the voice
          agent what your business does and it&apos;ll show you exactly how it&apos;d
          answer your calls, book your jobs, and capture your leads.
        </p>

        {/* Call button */}
        <a
          href={CALL_NUMBER_TEL}
          className="group relative mt-8 inline-flex items-center gap-3 rounded-full bg-foreground px-12 py-5 font-sans text-lg font-semibold text-background transition-all duration-300 hover:bg-gold-light hover:scale-[1.03] active:scale-[0.97]"
        >
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
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
          className="mt-5 font-sans text-xl font-bold tracking-wide text-foreground underline-offset-4 transition-colors hover:text-gold-light hover:underline"
        >
          {CALL_NUMBER_DISPLAY}
        </a>

        <p className="mt-2 font-sans text-xs text-muted">
          Tap the number to call from your phone
        </p>

        {/* Booking CTA — get it custom-built for their business */}
        <div className="mt-10 w-full max-w-md border-t border-[#e3e3e0] pt-8">
          <p className="font-serif text-lg font-bold text-foreground md:text-xl">
            Want this working in your business?
          </p>
          <p className="mx-auto mt-2 max-w-sm font-sans text-sm leading-relaxed text-muted">
            We&apos;ll set it up and custom-build your voice agent for your business.
          </p>
          <button
            onClick={() => setIsBookingOpen(true)}
            className="mt-5 inline-flex items-center gap-2 rounded-full border border-foreground/25 bg-transparent px-8 py-3.5 font-sans text-base font-semibold text-foreground transition-all duration-300 hover:bg-foreground/[0.04] hover:scale-[1.02] active:scale-[0.98]"
          >
            Book a call with the team
          </button>
        </div>
      </div>

      <BookingModal isOpen={isBookingOpen} onClose={() => setIsBookingOpen(false)} />
    </div>
  );
}
