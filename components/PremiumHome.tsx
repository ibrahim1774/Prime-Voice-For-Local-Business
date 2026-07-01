"use client";

import IntakeForm from "./IntakeForm";

// Premium marketing homepage ( / ). Clean white layout with a blue-gradient
// hero, the live-demo form as the hero's primary action (the product's magic),
// six capability cards, and a "what happens when a customer calls" flow.
// No pricing anywhere — the $99 checkout lives on /99. Everything is scoped
// under .mv-home (see globals.css) so it can't affect the other pages.

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

function Waveform() {
  // Live-call waveform — the signature element. Bars bounce on a stagger.
  const bars = [0, 0.18, 0.36, 0.12, 0.42, 0.24, 0.06, 0.3];
  return (
    <div className="mv-wave" aria-hidden="true">
      {bars.map((delay, i) => (
        <span key={i} style={{ animationDelay: `${delay}s` }} />
      ))}
    </div>
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
          href="#demo"
          className="rounded-full bg-[var(--mv-ink)] px-4 py-2 font-sans text-sm font-semibold text-white transition-colors hover:bg-black"
        >
          Generate my demo
        </a>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="mx-auto max-w-6xl px-5 pt-8 md:pt-12">
      {/* Blue gradient hero panel */}
      <div className="relative overflow-hidden rounded-[28px] px-6 py-14 text-center mv-hero-panel md:rounded-[36px] md:px-10 md:py-20">
        <div className="pointer-events-none absolute inset-0 mv-hero-sheen" />
        <div className="relative mx-auto max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-blue-700/40 px-3.5 py-1.5 font-sans text-[11px] font-bold uppercase tracking-[0.18em] text-white shadow-sm backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
            24/7 AI Voice Receptionist
          </span>

          <h1 className="mv-display mt-6 text-balance text-4xl font-extrabold leading-[1.05] text-white sm:text-5xl md:text-6xl">
            A voice agent so human, your callers just book the appointment.
          </h1>

          <p className="mx-auto mt-5 max-w-xl font-sans text-base leading-relaxed text-white/90 md:text-lg">
            Montivaro answers every call day and night, books jobs into your
            calendar, and captures every lead — in a natural voice your callers
            won&apos;t know is AI.
          </p>

          <div className="mt-8 flex items-center justify-center">
            <Waveform />
          </div>
        </div>
      </div>

      {/* Live-demo form — the hero's primary action, directly below the panel */}
      <div id="demo" className="mx-auto mt-10 max-w-lg scroll-mt-24 px-1 md:mt-12">
        <div className="mb-4 text-center">
          <h2 className="mv-display text-xl font-bold text-[var(--mv-ink)] md:text-2xl">
            Hear it answer your calls
          </h2>
          <p className="mt-1.5 font-sans text-sm text-[var(--mv-muted)]">
            Enter your business and number — your live demo is ready in 20 seconds.
          </p>
        </div>
        <IntakeForm />
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
