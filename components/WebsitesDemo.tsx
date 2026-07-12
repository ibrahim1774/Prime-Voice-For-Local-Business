"use client";

// montivaro.com/websites — click-to-call line for the $97/month Website
// System for local businesses: a 20+ page custom site, live in 24–48 hours,
// with an owner account (edit text/images anytime) and on-page SEO included.
// Duplicates the Prime Barber page layout (mv2 Call Sheet skin); qualified
// callers get the follow-up SMS with the details.

import { useState } from "react";
import BookingModal from "./BookingModal";

const CALL_NUMBER_DISPLAY = "(984) 299-2378";
const CALL_NUMBER_TEL = "tel:+19842992378";

function trackLead() {
  const eventId = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const fbq = (window as any).fbq;
  if (typeof fbq === "function") {
    fbq(
      "track",
      "Lead",
      { content_name: "/websites tap-to-call", content_category: "tap-to-call" },
      { eventID: eventId }
    );
  }
  fetch("/api/meta-lead-conversion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber: "+19842992378", eventId }),
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

export default function WebsitesDemo() {
  const [isBookingOpen, setIsBookingOpen] = useState(false);

  return (
    <div className="mv2 mv2-catchall">
      <div className="mv2-catchall-shell">
        <h1 className="mv2-catchall-h mv2-ca-in" style={{ animationDelay: "0.1s" }}>
          <span className="mv2-catchall-h-muted">Local Business Owners:</span>{" "}
          <span>A 20+ Page Website, Live in 24&ndash;48 Hours &mdash; $97/month</span>
        </h1>

        <p className="mv2-catchall-sub mv2-ca-in" style={{ animationDelay: "0.24s" }}>
          Custom-built for your business with on-page SEO on every page &mdash;
          and it&apos;s your account, so you edit the text and swap the images
          anytime. Hosting included, $97/month flat. Tap to call and ask
          anything.
        </p>

        <a
          href={CALL_NUMBER_TEL}
          onClick={trackLead}
          className="mv2-catchall-test mv2-ca-in"
          style={{ animationDelay: "0.36s", marginTop: "30px" }}
        >
          <span className="mv2-catchall-test-dot" aria-hidden="true" />
          Ask anything about the $97 website
        </a>

        <div className="mv2-ca-in" style={{ animationDelay: "0.46s" }}>
          <MiniWave />
        </div>

        {/* One-liner above the call button */}
        <p
          className="mv2-ca-in"
          style={{ animationDelay: "0.5s", color: "#fff", fontWeight: 800, fontSize: 15, marginBottom: 12 }}
        >
          Call our team &mdash; ready to answer any questions you have, 24/7.
        </p>

        <a href={CALL_NUMBER_TEL} onClick={trackLead} className="mv2-btn mv2-btn-light mv2-catchall-call">
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

        <a
          href={CALL_NUMBER_TEL}
          onClick={trackLead}
          className="mv2-mono mv2-catchall-number mv2-ca-in"
          style={{ animationDelay: "0.6s" }}
        >
          {CALL_NUMBER_DISPLAY}
        </a>

        <p className="mv2-catchall-hint mv2-ca-in" style={{ animationDelay: "0.68s" }}>
          Tap the number to call from your phone
        </p>

        <div className="mv2-catchall-book mv2-ca-in" style={{ animationDelay: "0.8s" }}>
          <p className="mv2-catchall-book-h">
            Ready to get your site built?
          </p>
          <p className="mv2-catchall-book-sub">
            20+ pages, on-page SEO, your own editing account &mdash; live
            within 24&ndash;48 hours.
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
