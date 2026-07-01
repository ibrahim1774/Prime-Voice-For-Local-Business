"use client";

import { DEMO_CALL_URL } from "@/lib/constants";

// Premium marketing homepage ( / ). A light rounded hero card with a blue
// glow (matching the reference design): black headline, a "Request a Demo"
// button that opens the Calendly scheduling link, and a "How It Works" button
// that scrolls to the call-flow. Six capability cards + a "what happens when a
// customer calls" flow follow. No pricing or live-demo form here — the $99
// funnel + demo live on /99. Scoped under .mv-home so other pages are untouched.

type IconName =
  | "voice"
  | "clock"
  | "calendar"
  | "contact"
  | "shield"
  | "tune";

function Icon({ name }: { name: IconName }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "voice":
      return (
        <svg {...common}>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
          <path d="M3 9h18M8 3v3M16 3v3M9 14l2 2 4-4" />
        </svg>
      );
    case "contact":
      return (
        <svg {...common}>
          <circle cx="12" cy="9" r="3.2" />
          <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case "tune":
      return (
        <svg {...common}>
          <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
          <circle cx="16" cy="7" r="2.2" />
          <circle cx="8" cy="17" r="2.2" />
        </svg>
      );
  }
}

const FEATURES: { icon: IconName; title: string; desc: string }[] = [
  {
    icon: "voice",
    title: "Sounds genuinely human",
    desc: "Natural, real-time conversation with the right pace and tone. Callers don't realize they're talking to AI.",
  },
  {
    icon: "clock",
    title: "Answers every call, 24/7",
    desc: "Picked up on the first ring — mornings, nights, weekends, holidays. You stop losing jobs to voicemail.",
  },
  {
    icon: "calendar",
    title: "Books the appointment",
    desc: "Schedules jobs straight into your calendar while you're on the tools, and confirms the time with the caller.",
  },
  {
    icon: "contact",
    title: "Captures every lead",
    desc: "Gets the caller's name, number, and reason for calling — every time — so nothing slips through.",
  },
  {
    icon: "shield",
    title: "Handles the hard calls",
    desc: "Pricing questions, after-hours, upset or urgent callers — answered calmly, with the right tone.",
  },
  {
    icon: "tune",
    title: "Trained on your business",
    desc: "Your services, pricing, hours, and voice style. It answers like it works at your shop, because it does.",
  },
];

const STEPS: { title: string; desc: string }[] = [
  {
    title: "The phone rings",
    desc: "A customer calls your business line — any hour, any day of the week.",
  },
  {
    title: "Montivaro answers instantly",
    desc: "It picks up on the first ring in a warm, human voice and greets them by your business name.",
  },
  {
    title: "It understands what they need",
    desc: "Booking, a quote, a reschedule, an emergency — it works out the caller's intent and responds naturally.",
  },
  {
    title: "It books the appointment",
    desc: "It drops the job straight into your calendar and confirms the day and time back to the caller.",
  },
  {
    title: "You get the details",
    desc: "Caller name, number, and notes land with you the moment the call ends. Nothing gets missed.",
  },
];

function Sparkle({ className, size = 22 }: { className?: string; size?: number }) {
  // Faint four-point star accents in the hero's blue glow (matches reference).
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 0c.6 5.7 2.3 9.4 12 12-9.7 2.6-11.4 6.3-12 12-.6-5.7-2.3-9.4-12-12 9.7-2.6 11.4-6.3 12-12z" />
    </svg>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--mv-line)] bg-white/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <a href="#top" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[var(--mv-blue)] text-white shadow-sm">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
          </span>
          <span className="mv-display text-[17px] font-extrabold tracking-tight text-[var(--mv-ink)]">
            Montivaro
          </span>
        </a>

        <div className="hidden items-center gap-8 md:flex">
          <a href="#how" className="mv-nav-link font-sans text-sm font-medium">How it works</a>
          <a href="#features" className="mv-nav-link font-sans text-sm font-medium">Features</a>
        </div>

        <a
          href={DEMO_CALL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-[var(--mv-blue)] px-4 py-2 font-sans text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--mv-blue-600)]"
        >
          Request a Demo
        </a>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="bg-[#eef1f6] px-5 pt-8 pb-14 md:pt-12 md:pb-20">
      <div className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-[28px] mv-hero-card md:rounded-[40px]">
          {/* Blue glow rising from the bottom + faint sparkles (reference look) */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[60%] mv-hero-glow" />
          <Sparkle className="pointer-events-none absolute bottom-[15%] left-[15%] text-white/70" size={26} />
          <Sparkle className="pointer-events-none absolute bottom-[27%] right-[17%] text-white/55" size={17} />
          <Sparkle className="pointer-events-none absolute bottom-[9%] right-[36%] text-white/45" size={13} />

          <div className="relative z-10 mx-auto max-w-3xl px-6 pt-16 pb-28 text-center md:px-10 md:pt-24 md:pb-40">
            <h1 className="mv-display text-balance text-[34px] font-extrabold leading-[1.06] text-[var(--mv-ink)] sm:text-5xl md:text-[64px]">
              A 24/7 human-like voice agent that books appointments and gets you leads.
            </h1>

            <p className="mx-auto mt-5 max-w-xl font-sans text-base leading-relaxed text-[var(--mv-muted)] md:text-lg">
              Montivaro answers every call in a natural, human voice — booking
              appointments and capturing leads around the clock, so you never
              lose a customer to a missed call.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={DEMO_CALL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--mv-blue)] px-6 py-3.5 font-sans text-sm font-semibold text-white shadow-[0_10px_24px_rgba(47,107,255,0.35)] transition-all hover:bg-[var(--mv-blue-600)] hover:shadow-[0_12px_28px_rgba(47,107,255,0.45)] sm:w-auto"
              >
                Request a Demo
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
              </a>
              <a
                href="#how"
                className="inline-flex w-full items-center justify-center rounded-xl border border-[var(--mv-line)] bg-white px-6 py-3.5 font-sans text-sm font-semibold text-[var(--mv-ink)] shadow-sm transition-colors hover:border-[#cfd6e6] hover:bg-[#f7f9fc] sm:w-auto"
              >
                How It Works
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 md:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <p className="font-sans text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--mv-blue-600)]">
          Built for real operations
        </p>
        <h2 className="mv-display mt-3 text-3xl font-extrabold leading-tight text-[var(--mv-ink)] md:text-[42px]">
          Everything a great receptionist does — on autopilot.
        </h2>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="mv-card p-6">
            <span className="mv-chip">
              <Icon name={f.icon} />
            </span>
            <h3 className="mv-display mt-5 text-lg font-bold text-[var(--mv-ink)]">
              {f.title}
            </h3>
            <p className="mt-2 font-sans text-[14.5px] leading-relaxed text-[var(--mv-muted)]">
              {f.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function CallFlow() {
  return (
    <section id="how" className="scroll-mt-20 bg-[#f7f8fb] py-20 md:py-28">
      <div className="mx-auto max-w-3xl px-5">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-sans text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--mv-blue-600)]">
            How it works
          </p>
          <h2 className="mv-display mt-3 text-3xl font-extrabold leading-tight text-[var(--mv-ink)] md:text-[42px]">
            What happens when a customer calls.
          </h2>
        </div>

        <ol className="mt-14 space-y-0">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative flex gap-5 pb-8 last:pb-0">
              {/* Node + connector */}
              <div className="relative flex flex-col items-center">
                <span className="z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--mv-blue)] font-sans text-sm font-bold text-white shadow-[0_6px_18px_rgba(47,107,255,0.35)]">
                  {i + 1}
                </span>
                {i < STEPS.length - 1 && (
                  <span className="mv-flow-line absolute top-11 h-[calc(100%-1rem)] w-[2px]" />
                )}
              </div>
              {/* Card */}
              <div className="mv-card flex-1 p-5">
                <h3 className="mv-display text-lg font-bold text-[var(--mv-ink)]">
                  {s.title}
                </h3>
                <p className="mt-1.5 font-sans text-[14.5px] leading-relaxed text-[var(--mv-muted)]">
                  {s.desc}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export default function PremiumHome() {
  return (
    <div className="mv-home min-h-screen bg-white">
      <Nav />
      <Hero />
      <Features />
      <CallFlow />
    </div>
  );
}
