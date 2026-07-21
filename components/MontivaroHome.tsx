"use client";

import { useEffect, useRef, useState } from "react";
import { DEMO_CALL_URL } from "@/lib/constants";

/*
 * Montivaro homepage ( / ) — "The Call Sheet".
 *
 * Monochrome premium redesign: carbon + warm paper, zero accent color.
 * Display type is expanded-width Archivo, utility type is IBM Plex Mono —
 * timecodes and call transcripts are the page's structural language because
 * a phone call is the product. Signature element: the live call window in
 * the hero (breathing waveform + a conversation that types itself out).
 *
 * All motion is CSS + one IntersectionObserver hook — no animation deps.
 * prefers-reduced-motion collapses every effect to static.
 * Styles live in globals.css under the .mv2 scope; nothing here touches
 * the funnel subpages.
 */

const LIVE_AGENT_TEL = "tel:+19289689136";

// ── scroll-reveal hook ──────────────────────────────────────────────────────

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("is-in");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.18 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={`mv2-reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

// ── the live call window (hero signature) ───────────────────────────────────

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
          // hold the finished call, then loop
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

// ── content ─────────────────────────────────────────────────────────────────

const TRADES = [
  "PLUMBERS", "HVAC", "BARBERSHOPS", "LANDSCAPERS", "ELECTRICIANS",
  "DENTAL CLINICS", "AUTO SHOPS", "SALONS", "ROOFERS", "CLEANERS",
];

const CAPABILITIES: { code: string; title: string; desc: string }[] = [
  {
    code: "CAP/01",
    title: "Sounds genuinely human",
    desc: "Natural pace, natural tone, real conversation. Callers don't realize they're talking to AI — they just feel taken care of.",
  },
  {
    code: "CAP/02",
    title: "Answers every call, 24/7",
    desc: "First ring, every time — mornings, nights, weekends, holidays. Voicemail stops costing you jobs.",
  },
  {
    code: "CAP/03",
    title: "Books the appointment",
    desc: "Schedules the job while you're on the tools and confirms the time with the caller before hanging up.",
  },
  {
    code: "CAP/04",
    title: "Captures every lead",
    desc: "Name, number, and what they need — collected on every call and sent to you by text and email the moment it ends.",
  },
  {
    code: "CAP/05",
    title: "Handles the hard calls",
    desc: "Pricing questions, after-hours emergencies, upset callers — answered calmly, with the right tone.",
  },
  {
    code: "CAP/06",
    title: "Trained on your business",
    desc: "Your services, your hours, your prices, your way of speaking. It answers like it works at your shop — because it does.",
  },
];

const TIMELINE: { t: string; title: string; desc: string }[] = [
  { t: "00:00", title: "The phone rings", desc: "A customer calls your business line. You're under a sink, mid-cut, or up a ladder." },
  { t: "00:01", title: "Answered on the first ring", desc: "A warm, human voice greets them by your business name. No hold music, no voicemail." },
  { t: "00:19", title: "The need is understood", desc: "A quote, a booking, a reschedule, an emergency — it works out what the caller wants and responds naturally." },
  { t: "01:04", title: "The appointment is booked", desc: "The job lands on your calendar and the day and time are confirmed back to the caller." },
  { t: "01:31", title: "The lead hits your phone", desc: "Name, number, and notes arrive by text and email the moment the call ends. Nothing slips." },
];

const SETUP: { title: string; desc: string }[] = [
  { title: "Keep your number", desc: "No new number to advertise. Your existing business line stays exactly as it is." },
  { title: "Forward the calls", desc: "One forwarding code from your phone — all calls or just the ones you miss. We handle the setup with your carrier." },
  { title: "Live in days", desc: "We tailor the agent to your services, hours, and tone, then it starts answering. Days, not months." },
];

// ── page ────────────────────────────────────────────────────────────────────

function ArrowUpRight() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 17L17 7M9 7h8v8" />
    </svg>
  );
}

function Nav() {
  return (
    <header className="mv2-nav">
      <nav>
        <a href="#top" className="mv2-wordmark">
          MONTIVARO<span className="mv2-wordmark-dot">●</span>
        </a>
        <div className="mv2-nav-links">
          <a href="#missed">The missed call</a>
          <a href="#capabilities">What it does</a>
          <a href="#how">How it works</a>
        </div>
        <div className="mv2-nav-cta">
          <a href={LIVE_AGENT_TEL} className="mv2-nav-tel">Call the live agent</a>
          <a href={DEMO_CALL_URL} target="_blank" rel="noopener noreferrer" className="mv2-btn mv2-btn-light">
            Book a demo
          </a>
        </div>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="mv2-hero">
      <div className="mv2-shell">
        <p className="mv2-eyebrow mv2-hero-eyebrow">
          <span className="mv2-live-dot" aria-hidden="true" />
          24/7 AI VOICE AGENT — FOR LOCAL BUSINESS
        </p>
        <h1 className="mv2-h1">
          <span className="mv2-h1-line"><span>You&rsquo;re on a job.</span></span>
          <span className="mv2-h1-line"><span>The phone rings.</span></span>
          <span className="mv2-h1-line"><span>Montivaro answers.</span></span>
        </h1>
        <p className="mv2-hero-sub">
          A human-sounding agent that picks up every call, books the appointment,
          and sends you the lead — while you stay on the tools.
        </p>
        <div className="mv2-hero-ctas">
          <a href={DEMO_CALL_URL} target="_blank" rel="noopener noreferrer" className="mv2-btn mv2-btn-light mv2-btn-lg">
            Book a demo <ArrowUpRight />
          </a>
          <a href={LIVE_AGENT_TEL} className="mv2-btn mv2-btn-ghost mv2-btn-lg">
            Hear it live — call the demo line
          </a>
        </div>
        <div className="mv2-hero-callwin">
          <CallWindow />
        </div>
      </div>
    </section>
  );
}

function TradesMarquee() {
  const row = [...TRADES, ...TRADES];
  return (
    <section className="mv2-marquee" aria-label="Built for local trades">
      <div className="mv2-marquee-track">
        {row.map((t, i) => (
          <span key={i} aria-hidden={i >= TRADES.length}>
            {t} <em>·</em>
          </span>
        ))}
      </div>
    </section>
  );
}

function MissedCallLedger() {
  return (
    <section id="missed" className="mv2-section mv2-paper">
      <div className="mv2-shell">
        <Reveal>
          <p className="mv2-eyebrow">CALL LOG — SIDE BY SIDE</p>
          <h2 className="mv2-h2">The call you miss calls the next shop.</h2>
        </Reveal>
        <div className="mv2-ledger">
          <Reveal className="mv2-ledger-col" delay={60}>
            <p className="mv2-ledger-head">WITHOUT MONTIVARO</p>
            <ul className="mv2-log mv2-log-dead">
              <li><span>00:00</span> <del>Incoming call — rings out</del></li>
              <li><span>00:24</span> <del>Voicemail picks up</del></li>
              <li><span>00:26</span> <del>Caller hangs up</del></li>
              <li><span>00:40</span> <del>Caller dials your competitor</del></li>
              <li className="mv2-log-verdict"><span>—</span> Job lost. You never knew it existed.</li>
            </ul>
          </Reveal>
          <Reveal className="mv2-ledger-col" delay={160}>
            <p className="mv2-ledger-head">WITH MONTIVARO</p>
            <ul className="mv2-log">
              <li><span>00:01</span> Answered on the first ring</li>
              <li><span>00:19</span> Quote question handled</li>
              <li><span>01:04</span> Appointment booked — Sat 9:00</li>
              <li><span>01:31</span> Lead texted + emailed to you</li>
              <li className="mv2-log-verdict"><span>—</span> Job won. You were on a ladder.</li>
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Capabilities() {
  return (
    <section id="capabilities" className="mv2-section mv2-carbon">
      <div className="mv2-shell">
        <Reveal>
          <p className="mv2-eyebrow">CAPABILITIES</p>
          <h2 className="mv2-h2">
            Everything a great receptionist does.
            <br />
            Nothing she forgets.
          </h2>
        </Reveal>
        <div className="mv2-caps">
          {CAPABILITIES.map((c, i) => (
            <Reveal key={c.code} className="mv2-cap" delay={(i % 2) * 90}>
              <p className="mv2-cap-code">{c.code}</p>
              <h3>{c.title}</h3>
              <p className="mv2-cap-desc">{c.desc}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Timeline() {
  return (
    <section id="how" className="mv2-section mv2-paper">
      <div className="mv2-shell">
        <Reveal>
          <p className="mv2-eyebrow">ONE CALL, START TO FINISH</p>
          <h2 className="mv2-h2">Ninety-one seconds to a booked job.</h2>
        </Reveal>
        <ol className="mv2-timeline">
          {TIMELINE.map((s, i) => (
            <li key={s.t}>
              <Reveal className="mv2-timeline-row" delay={i * 60}>
                <span className="mv2-timeline-t">{s.t}</span>
                <span className="mv2-timeline-node" aria-hidden="true" />
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Setup() {
  return (
    <section className="mv2-section mv2-paper mv2-setup-band">
      <div className="mv2-shell">
        <Reveal>
          <p className="mv2-eyebrow">GETTING SET UP</p>
          <h2 className="mv2-h2">Yours in days, not months.</h2>
        </Reveal>
        <div className="mv2-setup">
          {SETUP.map((s, i) => (
            <Reveal key={s.title} className="mv2-setup-col" delay={i * 90}>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="mv2-final mv2-carbon">
      <div className="mv2-shell">
        <Reveal>
          <h2 className="mv2-h1 mv2-final-h">
            <span className="mv2-h1-line is-in"><span>Stop losing jobs</span></span>
            <span className="mv2-h1-line is-in"><span>to voicemail.</span></span>
          </h2>
          <div className="mv2-hero-ctas">
            <a href={DEMO_CALL_URL} target="_blank" rel="noopener noreferrer" className="mv2-btn mv2-btn-light mv2-btn-lg">
              Book a demo <ArrowUpRight />
            </a>
            <a href={LIVE_AGENT_TEL} className="mv2-btn mv2-btn-ghost mv2-btn-lg">
              Call the live agent
            </a>
          </div>
        </Reveal>
      </div>
      <footer className="mv2-footer">
        <div className="mv2-shell">
          <span className="mv2-wordmark">MONTIVARO<span className="mv2-wordmark-dot">●</span></span>
          <span className="mv2-footer-note">24/7 AI VOICE AGENT — © {new Date().getFullYear()} MONTIVARO</span>
        </div>
      </footer>
    </section>
  );
}

export default function MontivaroHome() {
  return (
    <div className="mv2">
      <Nav />
      <main>
        <Hero />
        <TradesMarquee />
        <MissedCallLedger />
        <Capabilities />
        <Timeline />
        <Setup />
        <FinalCta />
      </main>
    </div>
  );
}
