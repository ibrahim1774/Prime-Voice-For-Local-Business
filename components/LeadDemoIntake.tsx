"use client";

// /leaddemo — the catch-all demo behind an intake form. Same mv2 Call Sheet
// skin and copy as /catch-all, but the visitor gives name + business + mobile
// FIRST ("Hear Your Free Live Demo in Seconds"), which records a lead (Meta
// Lead event + dialer_leads row) even if they never dial. Submitting flips
// the card to the call panel: the live-demo call button, the number, and the
// schedule-appointment booker below it.
//
// The form placeholders type themselves in like the agent is filling them,
// and the homepage's live call window (waveform + self-typing transcript)
// sits beside the form — one compact viewport, no scroll story.

import { useEffect, useRef, useState } from "react";
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

// ── animated example placeholders ────────────────────────────────────────────
// Types the example into the placeholder, holds, wipes, retypes — staggered
// per field so the form looks like it's being filled in live.
function useTypedPlaceholder(example: string, startDelay: number): string {
  const [text, setText] = useState("");
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setText(example);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const run = () => {
      let i = 0;
      const type = () => {
        i++;
        setText(example.slice(0, i));
        if (i < example.length) {
          timer = setTimeout(type, 65);
        } else {
          // hold the finished example, then wipe and go again
          timer = setTimeout(() => {
            setText("");
            timer = setTimeout(run, 700);
          }, 2400);
        }
      };
      type();
    };
    timer = setTimeout(run, startDelay);
    return () => clearTimeout(timer);
  }, [example, startDelay]);
  return text;
}

// ── the homepage's live call window, compact ────────────────────────────────
const TRANSCRIPT: { who: "caller" | "agent" | "status"; text: string }[] = [
  { who: "caller", text: "Hey — do you guys handle water heater replacements?" },
  { who: "agent", text: "We do, and I can get you booked right now. What's your name, and when works for a visit?" },
  { who: "caller", text: "It's Marcus. Could someone come Saturday morning?" },
  { who: "agent", text: "Saturday at 9:00 is open — you're on the schedule, Marcus. A confirmation text is on its way." },
  { who: "status", text: "→ LEAD SENT TO OWNER · SMS + EMAIL · 00:01:31" },
];

function Waveform({ bars = 36 }: { bars?: number }) {
  return (
    <div className="mv2-wave" aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          style={{
            animationDelay: `${(i % 9) * 0.11}s`,
            animationDuration: `${0.9 + ((i * 7) % 5) * 0.13}s`,
          }}
        />
      ))}
    </div>
  );
}

function CallWindow() {
  const [lines, setLines] = useState<{ who: string; text: string }[]>([]);
  const [clock, setClock] = useState(0);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setLines(TRANSCRIPT.map((l) => ({ who: l.who, text: l.text })));
      setClock(91);
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    let clockTimer: ReturnType<typeof setInterval> | null = null;

    const run = () => {
      let li = 0;
      let ci = 0;
      setLines([]);
      setClock(0);
      clockTimer = setInterval(() => setClock((c) => c + 1), 1000);

      const tick = () => {
        const line = TRANSCRIPT[li];
        if (!line) {
          if (clockTimer) clearInterval(clockTimer);
          timer = setTimeout(run, 6000);
          return;
        }
        ci++;
        const partial = line.text.slice(0, ci);
        setLines((prev) => {
          const next = prev.slice(0, li);
          next[li] = { who: line.who, text: partial };
          return next;
        });
        if (ci >= line.text.length) {
          li++;
          ci = 0;
          timer = setTimeout(tick, line.who === "status" ? 400 : 700);
        } else {
          timer = setTimeout(tick, line.who === "status" ? 8 : 22);
        }
      };
      timer = setTimeout(tick, 900);
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !started.current) {
          started.current = true;
          run();
          io.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    io.observe(el);

    return () => {
      io.disconnect();
      if (timer) clearTimeout(timer);
      if (clockTimer) clearInterval(clockTimer);
    };
  }, []);

  const mm = String(Math.floor(clock / 60)).padStart(2, "0");
  const ss = String(clock % 60).padStart(2, "0");

  return (
    <div ref={boxRef} className="mv2-callwin" role="img" aria-label="Example of Montivaro answering a customer call and booking the job">
      <div className="mv2-callwin-head">
        <span className="mv2-dot" aria-hidden="true" />
        <span>INCOMING CALL — RIVERSIDE PLUMBING</span>
        <span className="mv2-callwin-clock">00:{mm}:{ss}</span>
      </div>
      <div className="mv2-callwin-wave">
        <Waveform />
      </div>
      <div className="mv2-callwin-body">
        {lines.map((l, i) =>
          l.who === "status" ? (
            <p key={i} className="mv2-transcript-status">{l.text}</p>
          ) : (
            <p key={i} className="mv2-transcript-line">
              <span className={l.who === "agent" ? "mv2-tag mv2-tag-agent" : "mv2-tag"}>
                {l.who === "agent" ? "MONTIVARO" : "CALLER"}
              </span>
              <span>{l.text}</span>
            </p>
          )
        )}
        {lines.length === 0 && <p className="mv2-transcript-line mv2-transcript-idle">RINGING…</p>}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  color: "rgba(255,255,255,0.72)",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 10,
  color: "#fff",
  fontSize: 16,
  fontWeight: 400,
  letterSpacing: "normal",
  textTransform: "none",
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

  const namePh = useTypedPlaceholder("Mike Johnson", 400);
  const businessPh = useTypedPlaceholder("Johnson's Plumbing & Heating", 1300);
  const phonePh = useTypedPlaceholder("(555) 234-8890", 2400);

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
      <div className="mv2-catchall-shell" style={!submitted ? { maxWidth: 1060 } : undefined}>
        {/* Headline */}
        <h1
          className="mv2-catchall-h mv2-ca-in"
          style={{ animationDelay: "0.1s", ...(!submitted ? { fontSize: "clamp(26px, 4.2vw, 44px)" } : {}) }}
        >
          <span className="mv2-catchall-h-muted">Don&apos;t Miss Another Customer Call &mdash;</span>{" "}
          <span>A 24/7 Human-Like Answering Agent for Local Businesses</span>
        </h1>

        {/* Subheadline */}
        <p className="mv2-catchall-sub mv2-ca-in" style={{ animationDelay: "0.24s" }}>
          Talk to the live voice agent like a real customer would &mdash; tell it
          what your business does and it&apos;ll show you exactly how it&apos;d
          answer your calls, book your jobs, and capture your leads.
        </p>

        {/* Price anchor */}
        <p
          className="mv2-mono mv2-ca-in"
          style={{ animationDelay: "0.3s", color: "#fff", fontWeight: 700, fontSize: 14, letterSpacing: "0.06em", marginTop: 14 }}
        >
          Starting at $199/month
        </p>

        {!submitted ? (
          <div
            className="mv2-ca-in"
            style={{
              animationDelay: "0.4s",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 26,
              alignItems: "start",
              width: "100%",
              maxWidth: 980,
              margin: "30px auto 0",
              textAlign: "left",
            }}
          >
            <form
              onSubmit={handleSubmit}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <label style={labelStyle}>
                Your Name
                <input
                  style={inputStyle}
                  type="text"
                  placeholder={namePh}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </label>
              <label style={labelStyle}>
                Business Name
                <input
                  style={inputStyle}
                  type="text"
                  placeholder={businessPh}
                  value={business}
                  onChange={(e) => setBusiness(e.target.value)}
                  autoComplete="organization"
                />
              </label>
              <label style={labelStyle}>
                Mobile Number
                <input
                  style={inputStyle}
                  type="tel"
                  placeholder={phonePh}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                />
              </label>
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
              <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, margin: 0, textAlign: "center" }}>
                By submitting, you agree to receive a call or text about your demo.
              </p>
            </form>

            <CallWindow />
          </div>
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
