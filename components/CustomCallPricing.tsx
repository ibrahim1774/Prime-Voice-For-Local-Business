"use client";

// /custom — call-the-live-demo hero (catch-all style, number never shown)
// with the three plans visible immediately: no generation step. Each plan
// checks out at its own price through /api/create-checkout, the same flow
// the old post-generate pricing used. Styled on the monochrome .mv2 ink
// system so the whole page reads as one premium surface.

import { useEffect, useRef, useState } from "react";
import BookingModal from "./BookingModal";
import { SETUP_CALL_URL } from "@/lib/constants";

// Dialed, never displayed — the button copy carries the CTA.
const CALL_NUMBER_TEL = "tel:+19289689136";

interface Plan {
  id: string;
  name: string;
  price: number;
  minutesLabel: string;
  summary: string;
  inherit?: string;
  bullets: string[];
  popular?: boolean;
}

const PLANS: Plan[] = [
  {
    id: "business-line",
    name: "Business Line",
    price: 49,
    minutesLabel: "50 minutes included / mo",
    summary: "Email notifications only.",
    bullets: [
      "Runs 24/7, after-hours only, or just overflow — your choice",
      "Every call answered — sounds like a real person",
      "Every lead emailed to you: name, number, what they need",
      "It knows your services, prices, and hours",
      "Keep your current business number",
    ],
  },
  {
    id: "never-miss",
    name: "Never Miss",
    price: 97,
    minutesLabel: "100 minutes included / mo",
    summary: "Email or call — your choice.",
    inherit: "Everything in Business Line, plus:",
    popular: true,
    bullets: [
      "Live call transfer — your phone rings first",
      "Missed calls get answered, day or night",
      "Appointments booked while you work",
      "Instant email the moment a lead calls",
    ],
  },
  {
    id: "full-front-desk",
    name: "Full Front Desk",
    price: 199,
    minutesLabel: "~250 minutes included / mo",
    summary: "CRM integration included.",
    inherit: "Everything in Never Miss, plus:",
    bullets: [
      "New leads go straight into your CRM",
      "Instant text + email the moment a lead calls",
      "Full 24/7 answering, or backup only — your choice",
      "Priority help whenever you need a change",
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

function Check() {
  return (
    <svg
      style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2 }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

const PAPER = "#f7f6f3";
const SMOKE = "#8f8f96";
const LINE = "rgba(247,246,243,0.14)";
const CARD_BG = "rgba(247,246,243,0.035)";

export default function CustomCallPricing() {
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // Horizontal plan gallery — native scroll-snap (swipeable on mobile)
  // driven by the arrows. Opens centered on the featured $97 plan.
  const trackRef = useRef<HTMLDivElement>(null);
  const [activePlan, setActivePlan] = useState(1);

  const scrollToPlan = (i: number) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.children[i] as HTMLElement | undefined;
    if (!card) return;
    track.scrollTo({
      left: card.offsetLeft - (track.clientWidth - card.clientWidth) / 2,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    // Center the $97 card on load, before paint settles.
    const track = trackRef.current;
    if (!track) return;
    const card = track.children[1] as HTMLElement | undefined;
    if (card) {
      track.scrollLeft = card.offsetLeft - (track.clientWidth - card.clientWidth) / 2;
    }
  }, []);

  const onTrackScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const center = track.scrollLeft + track.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    Array.from(track.children).forEach((el, i) => {
      const c = el as HTMLElement;
      const mid = c.offsetLeft + c.clientWidth / 2;
      const d = Math.abs(mid - center);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    setActivePlan(best);
  };

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
          trialDays: 3,
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
    <div className="mv2 mv2-catchall" style={{ paddingBottom: 40 }}>
      <style>{`.mv2-plans-track::-webkit-scrollbar{display:none}`}</style>
      <div
        className="mv2-catchall-shell"
        style={{ minHeight: "auto", padding: "34px 24px 0" }}
      >
        {/* Headline */}
        <h1
          className="mv2-catchall-h mv2-ca-in"
          style={{ animationDelay: "0.1s", marginTop: 0, fontSize: "clamp(22px, 3.6vw, 34px)" }}
        >
          <span className="mv2-catchall-h-muted">A Missed Call Can = Lost Money.</span>{" "}
          <span>The New 24/7 Human-Like Answering Agent for Local Businesses</span>
        </h1>

        {/* Subheadline */}
        <p className="mv2-catchall-sub mv2-ca-in" style={{ animationDelay: "0.24s" }}>
          Tap to call and talk like a real customer would &mdash; tell the voice
          agent what your business does and it&apos;ll show you exactly how it&apos;d
          answer your calls, book your jobs, and capture your leads.
        </p>

        {/* Test-it pill */}
        <a
          href={CALL_NUMBER_TEL}
          onClick={trackLead}
          className="mv2-catchall-test mv2-ca-in"
          style={{ animationDelay: "0.36s", marginTop: "16px" }}
        >
          <span className="mv2-catchall-test-dot" aria-hidden="true" />
          Test our live voice agent now
        </a>

        <div className="mv2-ca-in" style={{ animationDelay: "0.46s" }}>
          <MiniWave />
        </div>

        {/* Call button — no number anywhere on the page */}
        <a
          href={CALL_NUMBER_TEL}
          onClick={trackLead}
          className="mv2-btn mv2-btn-light mv2-catchall-call"
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
          Call the Live Demo — Test It Out for Yourself
        </a>

        <p className="mv2-catchall-hint mv2-ca-in" style={{ animationDelay: "0.6s" }}>
          One tap starts a real call with the voice agent
        </p>
      </div>

      {/* ── Pricing ── */}
      <section
        className="mv2-ca-in"
        style={{
          animationDelay: "0.72s",
          maxWidth: 1020,
          margin: "0 auto",
          padding: "30px 20px 0",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <p
            className="mv2-mono"
            style={{
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: SMOKE,
              marginBottom: 6,
            }}
          >
            Pricing
          </p>
          <h2
            style={{
              fontSize: "clamp(21px, 3.2vw, 27px)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
              color: PAPER,
            }}
          >
            Pick your plan. Start with a 3-day free trial.
          </h2>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              marginTop: 10,
              padding: "7px 15px",
              borderRadius: 999,
              border: "1px solid rgba(52,211,153,0.55)",
              background: "rgba(52,211,153,0.12)",
              color: "#34d399",
              fontSize: 13.5,
              fontWeight: 700,
            }}
          >
            <span
              aria-hidden="true"
              style={{ width: 7, height: 7, borderRadius: 999, background: "#34d399" }}
            />
            Try us for free &mdash; we&apos;ll get you set up within 24&ndash;48 hours
          </div>
          <p style={{ marginTop: 7, fontSize: 12.5, color: SMOKE }}>
            No setup fees. Cancel anytime.
          </p>
        </div>

        <div style={{ position: "relative" }}>
          <button
            type="button"
            aria-label="Previous plan"
            onClick={() => scrollToPlan(Math.max(0, activePlan - 1))}
            disabled={activePlan === 0}
            style={{
              position: "absolute",
              left: -6,
              top: "50%",
              transform: "translateY(-50%)",
              zIndex: 2,
              width: 40,
              height: 40,
              borderRadius: 999,
              border: `1px solid ${LINE}`,
              background: "rgba(11,11,12,0.85)",
              color: PAPER,
              fontSize: 17,
              cursor: activePlan === 0 ? "default" : "pointer",
              opacity: activePlan === 0 ? 0.3 : 1,
            }}
          >
            ←
          </button>
          <button
            type="button"
            aria-label="Next plan"
            onClick={() => scrollToPlan(Math.min(PLANS.length - 1, activePlan + 1))}
            disabled={activePlan === PLANS.length - 1}
            style={{
              position: "absolute",
              right: -6,
              top: "50%",
              transform: "translateY(-50%)",
              zIndex: 2,
              width: 40,
              height: 40,
              borderRadius: 999,
              border: `1px solid ${LINE}`,
              background: "rgba(11,11,12,0.85)",
              color: PAPER,
              fontSize: 17,
              cursor: activePlan === PLANS.length - 1 ? "default" : "pointer",
              opacity: activePlan === PLANS.length - 1 ? 0.3 : 1,
            }}
          >
            →
          </button>
          <div
            ref={trackRef}
            onScroll={onTrackScroll}
            className="mv2-plans-track"
            style={{
              display: "flex",
              gap: 12,
              overflowX: "auto",
              scrollSnapType: "x mandatory",
              padding: "10px calc(50% - 160px) 6px",
              scrollbarWidth: "none",
            }}
          >
          {PLANS.map((plan) => {
            const isPopular = !!plan.popular;
            return (
              <div
                key={plan.id}
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  flex: "0 0 320px",
                  scrollSnapAlign: "center",
                  transition: "opacity 0.25s ease, transform 0.25s ease",
                  opacity: PLANS[activePlan]?.id === plan.id ? 1 : 0.45,
                  borderRadius: 14,
                  border: `1px solid ${isPopular ? "rgba(52,211,153,0.45)" : LINE}`,
                  background: isPopular ? "rgba(52,211,153,0.05)" : CARD_BG,
                  padding: "16px 16px 14px",
                  boxShadow: isPopular ? "0 18px 44px rgba(0,0,0,0.45)" : "none",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: PAPER }}>{plan.name}</div>
                <div style={{ marginTop: 4, display: "flex", alignItems: "baseline", gap: 5 }}>
                  <span style={{ fontSize: 27, fontWeight: 700, letterSpacing: "-0.03em", color: PAPER }}>
                    ${plan.price}
                  </span>
                  <span style={{ fontSize: 13, color: SMOKE }}>/month</span>
                </div>
                <div className="mv2-mono" style={{ marginTop: 4, fontSize: 11, color: SMOKE }}>
                  {plan.minutesLabel}
                </div>
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    color: isPopular ? "#34d399" : PAPER,
                  }}
                >
                  {plan.summary}
                </div>
                {plan.inherit && (
                  <div style={{ marginTop: 7, fontSize: 11.5, fontWeight: 600, color: SMOKE }}>
                    {plan.inherit}
                  </div>
                )}
                <ul style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
                  {plan.bullets.map((b) => (
                    <li
                      key={b}
                      style={{
                        display: "flex",
                        gap: 8,
                        fontSize: 12.5,
                        lineHeight: 1.4,
                        color: "rgba(247,246,243,0.85)",
                      }}
                    >
                      <span style={{ color: "#34d399" }}>
                        <Check />
                      </span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => checkout(plan)}
                  disabled={!!loadingId}
                  style={{
                    marginTop: 12,
                    width: "100%",
                    borderRadius: 999,
                    border: isPopular ? "none" : `1px solid ${LINE}`,
                    background: isPopular ? PAPER : "transparent",
                    color: isPopular ? "#0b0b0c" : PAPER,
                    padding: "11px 14px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    opacity: loadingId && loadingId !== plan.id ? 0.6 : 1,
                  }}
                >
                  {loadingId === plan.id ? "Starting…" : `Start 3-Day Free Trial — then $${plan.price}/mo`}
                </button>
              </div>
            );
          })}
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 7, marginTop: 10 }}>
            {PLANS.map((plan, i) => (
              <button
                key={plan.id}
                type="button"
                aria-label={`Go to ${plan.name}`}
                onClick={() => scrollToPlan(i)}
                style={{
                  width: i === activePlan ? 18 : 7,
                  height: 7,
                  borderRadius: 999,
                  border: "none",
                  background: i === activePlan ? "#34d399" : "rgba(247,246,243,0.25)",
                  cursor: "pointer",
                  transition: "all 0.25s ease",
                  padding: 0,
                }}
              />
            ))}
          </div>
        </div>

        <p style={{ marginTop: 10, textAlign: "center", fontSize: 11, color: SMOKE }}>
          3-day free trial on every plan · $1/min after your included minutes · Cancel anytime
        </p>

        {/* Book-a-call fallback */}
        <div style={{ marginTop: 20, textAlign: "center" }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: PAPER }}>
            Want it custom-built for your business first?
          </p>
          <div style={{ marginTop: 8, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => setIsBookingOpen(true)}
              className="mv2-btn mv2-btn-ghost"
            >
              Book a call with the team
            </button>
            <a
              href={SETUP_CALL_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                alignSelf: "center",
                fontSize: 13,
                color: SMOKE,
                textDecoration: "underline",
                textUnderlineOffset: 4,
              }}
            >
              Not sure? Free 10-min call
            </a>
          </div>
        </div>
      </section>

      <BookingModal isOpen={isBookingOpen} onClose={() => setIsBookingOpen(false)} />
    </div>
  );
}
