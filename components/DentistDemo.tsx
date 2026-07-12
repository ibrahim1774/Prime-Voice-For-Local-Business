"use client";

// montivaro.com/dentist — the dental vertical's demo line, in the "Porcelain
// Clinic" skin (the one light page in a dark site). The hero's transcript
// card plays itself: three looping patient scenarios that type out and stamp
// a mint "Booked" chip, exactly what a caller is about to experience live.

import { useEffect, useRef, useState } from "react";
import BookingModal from "./BookingModal";

const CALL_DISPLAY = "(657) 246-4071";
const CALL_TEL = "tel:+16572464071";

type Turn = { who: "patient" | "desk"; text: string };
type Scenario = { label: string; clock: string; turns: Turn[]; stamp: string };

const SCENARIOS: Scenario[] = [
  {
    label: "Emergency",
    clock: "TODAY · 1:12 PM",
    turns: [
      { who: "patient", text: "I think I chipped a molar at lunch — it's throbbing." },
      { who: "desk", text: "Oh no — let's get you seen today. Any swelling?" },
      { who: "patient", text: "No, just really sore." },
      { who: "desk", text: "Okay. Dr. Hale has 2:40 this afternoon — does that work?" },
    ],
    stamp: "Same-day visit · Today 2:40 PM",
  },
  {
    label: "New patient",
    clock: "MON · 10:03 AM",
    turns: [
      { who: "patient", text: "Hi — are you taking new patients?" },
      { who: "desk", text: "We'd love to have you. First visit runs about an hour, x-rays included." },
      { who: "patient", text: "Great — mornings are best for me." },
      { who: "desk", text: "Tuesday 9:10 just opened up. Want me to hold it for you?" },
    ],
    stamp: "New patient · Tue 9:10 AM",
  },
  {
    label: "After hours",
    clock: "FRI · 11:48 PM",
    turns: [
      { who: "patient", text: "Do you take Delta Dental PPO?" },
      { who: "desk", text: "We work with most major PPO plans — I'll note your carrier so the office verifies it before your visit." },
      { who: "patient", text: "Perfect. Can I book a cleaning?" },
      { who: "desk", text: "Of course — Thursday 4:15, and your text confirmation is on its way." },
    ],
    stamp: "Cleaning · Thu 4:15 PM",
  },
];

function trackLead() {
  const eventId = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const fbq = (window as any).fbq;
  if (typeof fbq === "function") {
    fbq(
      "track",
      "Lead",
      { content_name: "/dentist tap-to-call", content_category: "tap-to-call" },
      { eventID: eventId }
    );
  }
  fetch("/api/meta-lead-conversion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber: "+16572464071", eventId }),
    keepalive: true,
  }).catch(() => {});
}

// Plays one scenario: turns appear one by one (a typing indicator precedes
// each front-desk reply), the stamp lands, then the next scenario loads.
function TranscriptCard() {
  const [scenario, setScenario] = useState(0);
  const [shown, setShown] = useState(1);
  const [typing, setTyping] = useState(false);
  const [stamped, setStamped] = useState(false);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced.current) {
      setShown(SCENARIOS[0].turns.length);
      setStamped(true);
    }
  }, []);

  useEffect(() => {
    if (reduced.current) return;
    const turns = SCENARIOS[scenario].turns;
    let t: ReturnType<typeof setTimeout>;
    if (shown < turns.length) {
      const next = turns[shown];
      if (next.who === "desk") {
        setTyping(true);
        t = setTimeout(() => { setTyping(false); setShown(shown + 1); }, 1100);
      } else {
        t = setTimeout(() => setShown(shown + 1), 1400);
      }
    } else if (!stamped) {
      t = setTimeout(() => setStamped(true), 700);
    } else {
      t = setTimeout(() => {
        setScenario((scenario + 1) % SCENARIOS.length);
        setShown(1);
        setStamped(false);
      }, 3400);
    }
    return () => clearTimeout(t);
  }, [scenario, shown, stamped]);

  const s = SCENARIOS[scenario];
  return (
    <div className="dnt-card" aria-label="Sample call transcript">
      <div className="dnt-card-top">
        <span className="dnt-card-dot" aria-hidden="true" />
        <span className="dnt-card-title">Incoming call</span>
        <span className="dnt-card-clock">{s.clock}</span>
      </div>
      <div className="dnt-card-tabs" role="tablist" aria-hidden="true">
        {SCENARIOS.map((sc, i) => (
          <span key={sc.label} className={`dnt-card-tab${i === scenario ? " on" : ""}`}>{sc.label}</span>
        ))}
      </div>
      <div className="dnt-card-body">
        {s.turns.slice(0, shown).map((turn, i) => (
          <p key={`${scenario}-${i}`} className={`dnt-msg ${turn.who}`}>
            <span className="dnt-msg-who">{turn.who === "patient" ? "Patient" : "Front desk"}</span>
            {turn.text}
          </p>
        ))}
        {typing && (
          <p className="dnt-msg desk dnt-typing" aria-hidden="true">
            <span className="dnt-msg-who">Front desk</span>
            <span className="dnt-dots"><i /><i /><i /></span>
          </p>
        )}
        {stamped && (
          <p className="dnt-stamp">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            Booked — {s.stamp}
          </p>
        )}
      </div>
    </div>
  );
}

// A quiet vitals line between sections — the page's pulse.
function VitalsDivider() {
  return (
    <div className="dnt-vitals" aria-hidden="true">
      <svg viewBox="0 0 600 40" preserveAspectRatio="none">
        <path
          className="dnt-vitals-path"
          d="M0 20 H210 L228 20 238 6 250 34 260 20 H600"
          fill="none"
          strokeWidth="1.6"
        />
      </svg>
    </div>
  );
}

export default function DentistDemo() {
  const [isBookingOpen, setIsBookingOpen] = useState(false);

  return (
    <div className="dnt">
      {/* Hero */}
      <header className="dnt-shell dnt-hero">
        <div className="dnt-hero-copy">
          <p className="dnt-eyebrow dnt-in" style={{ animationDelay: "0.05s" }}>
            Montivaro · Dental
          </p>
          <h1 className="dnt-h1">
            <span className="dnt-in" style={{ animationDelay: "0.14s" }}>The front desk that</span>{" "}
            <span className="dnt-h1-accent dnt-in" style={{ animationDelay: "0.26s" }}>never misses a patient.</span>
          </h1>
          <p className="dnt-sub dnt-in" style={{ animationDelay: "0.4s" }}>
            This is a live demo line. Call it the way a patient would — chipped
            tooth, new-patient question, insurance — and hear exactly how an AI
            receptionist answers for your practice. Every hour, every call.
          </p>
          <div className="dnt-cta dnt-in" style={{ animationDelay: "0.54s" }}>
            <a href={CALL_TEL} onClick={trackLead} className="dnt-call">
              <span className="dnt-live" aria-hidden="true" />
              Call the demo line
            </a>
            <a href={CALL_TEL} onClick={trackLead} className="dnt-number">{CALL_DISPLAY}</a>
          </div>
          <p className="dnt-hint dnt-in" style={{ animationDelay: "0.64s" }}>
            Answers live right now · takes about a minute
          </p>
        </div>
        <div className="dnt-hero-card dnt-in" style={{ animationDelay: "0.5s" }}>
          <TranscriptCard />
        </div>
      </header>

      <VitalsDivider />

      {/* One-line close: Brooklyn + booking, nothing else */}
      <section className="dnt-shell dnt-strip dnt-in" style={{ animationDelay: "0.7s" }}>
        <p className="dnt-badge">Based in Brooklyn, NY</p>
        <p className="dnt-strip-copy">
          We come to your office and set it up with you — $199–$997/month,
          usage minutes included.
        </p>
        <button onClick={() => setIsBookingOpen(true)} className="dnt-call dnt-book">
          Choose a time for your call
        </button>
      </section>

      <BookingModal isOpen={isBookingOpen} onClose={() => setIsBookingOpen(false)} />
    </div>
  );
}
