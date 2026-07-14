"use client";

// /leaddemo — the catch-all demo behind an intake form. Same mv2 Call Sheet
// skin and copy as /catch-all, but the visitor gives name + business + mobile
// FIRST ("Hear Your Free Live Demo in Seconds"), which records a lead (Meta
// Lead event + dialer_leads row) even if they never dial. Submitting flips
// the card to the call panel: the live-demo call button, the number, and the
// schedule-appointment booker below it.

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

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 10,
  color: "#fff",
  fontSize: 16,
  outline: "none",
};

export default function LeadDemoIntake() {
  const [name, setName] = useState("");
  const [business, setBusiness] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isBookingOpen, setIsBookingOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const digits = phone.replace(/\D/g, "");
    if (!name.trim()) return setError("Please enter your name.");
    if (!business.trim()) return setError("Please enter your business name.");
    if (digits.length < 10) return setError("Please enter a valid mobile number.");
    setError("");
    setSubmitting(true);

    // The lead moment. Browser pixel + server (DB row + CAPI with hashed
    // contact info) share the eventID so Meta dedupes to one Lead.
    const eventId = `leaddemo_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const fbq = (window as any).fbq;
    if (typeof fbq === "function") {
      fbq(
        "track",
        "Lead",
        { content_name: "/leaddemo intake form", content_category: "intake-form" },
        { eventID: eventId }
      );
    }
    try {
      await fetch("/api/leaddemo-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), business: business.trim(), phone: digits, eventId }),
        keepalive: true,
      });
    } catch {
      // Never block the demo on tracking/storage — the visitor still gets
      // the call panel.
    }
    setSubmitting(false);
    setSubmitted(true);
  };

  return (
    <div className="mv2 mv2-catchall">
      <div className="mv2-catchall-shell">
        {/* Headline */}
        <h1 className="mv2-catchall-h mv2-ca-in" style={{ animationDelay: "0.1s" }}>
          <span className="mv2-catchall-h-muted">Don&apos;t Miss Another Customer Call &mdash;</span>{" "}
          <span>A 24/7 Human-Like Answering Agent for Local Businesses</span>
        </h1>

        {/* Subheadline */}
        <p className="mv2-catchall-sub mv2-ca-in" style={{ animationDelay: "0.24s" }}>
          Talk to the live voice agent like a real customer would &mdash; tell it
          what your business does and it&apos;ll show you exactly how it&apos;d
          answer your calls, book your jobs, and capture your leads.
        </p>

        {!submitted ? (
          <form
            onSubmit={handleSubmit}
            className="mv2-ca-in"
            style={{ animationDelay: "0.4s", width: "100%", maxWidth: 420, margin: "34px auto 0", display: "flex", flexDirection: "column", gap: 12 }}
          >
            <input
              style={inputStyle}
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
            <input
              style={inputStyle}
              type="text"
              placeholder="Business name"
              value={business}
              onChange={(e) => setBusiness(e.target.value)}
              autoComplete="organization"
            />
            <input
              style={inputStyle}
              type="tel"
              placeholder="Mobile number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
            />
            {error ? (
              <p style={{ color: "#ffb4b4", fontSize: 13, margin: 0 }}>{error}</p>
            ) : null}
            <button
              type="submit"
              disabled={submitting}
              className="mv2-btn mv2-btn-light mv2-catchall-call"
              style={{ width: "100%", opacity: submitting ? 0.7 : 1 }}
            >
              {submitting ? "One second…" : "Hear Your Free Live Demo in Seconds"}
            </button>
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, margin: 0 }}>
              By submitting, you agree to receive a call or text about your demo.
            </p>
          </form>
        ) : (
          <>
            <div className="mv2-ca-in" style={{ animationDelay: "0.05s" }}>
              <MiniWave />
            </div>

            {/* One-liner above the call button */}
            <p
              className="mv2-ca-in"
              style={{ animationDelay: "0.12s", color: "#fff", fontWeight: 800, fontSize: 15, marginBottom: 12 }}
            >
              Call our live demo right now to hear how it sounds.
            </p>

            {/* Call button */}
            <a href={CALL_NUMBER_TEL} className="mv2-btn mv2-btn-light mv2-catchall-call">
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
              Call the Live Demo
            </a>

            {/* Clickable number */}
            <a
              href={CALL_NUMBER_TEL}
              className="mv2-mono mv2-catchall-number mv2-ca-in"
              style={{ animationDelay: "0.2s" }}
            >
              {CALL_NUMBER_DISPLAY}
            </a>

            <p className="mv2-catchall-hint mv2-ca-in" style={{ animationDelay: "0.28s" }}>
              Tap the number to call from your phone
            </p>

            {/* Schedule-appointment calendar below the number */}
            <div className="mv2-catchall-book mv2-ca-in" style={{ animationDelay: "0.4s" }}>
              <p className="mv2-catchall-book-h">
                Prefer a time that works for you?
              </p>
              <p className="mv2-catchall-book-sub">
                Schedule an appointment and we&apos;ll call you then.
              </p>
              <button
                onClick={() => setIsBookingOpen(true)}
                className="mv2-btn mv2-btn-ghost mv2-btn-lg mv2-catchall-book-btn"
              >
                Schedule an appointment
              </button>
            </div>
          </>
        )}
      </div>

      <BookingModal isOpen={isBookingOpen} onClose={() => setIsBookingOpen(false)} />
    </div>
  );
}
