"use client";

import { useEffect, useRef, useState } from "react";
import { SETUP_CALL_URL } from "@/lib/constants";

interface CustomPricingSectionProps {
  businessName: string;
}

interface Plan {
  id: string;
  name: string;
  price: number;
  minutes: number;
  tagline: string;
  inherit?: string;
  bullets: string[];
  popular?: boolean;
}

const PLANS: Plan[] = [
  {
    id: "after-hours",
    name: "After Hours",
    price: 29,
    minutes: 30,
    tagline: "Closed for the day? Calls still get answered.",
    bullets: [
      "A new local number for nights and weekends",
      "Callers get a real answer, not voicemail",
      "It knows your services and prices",
      "Every lead in your inbox by morning",
    ],
  },
  {
    id: "business-line",
    name: "Business Line",
    price: 49,
    minutes: 50,
    tagline: "Keep your same number. We answer when you can't.",
    inherit: "Everything in After Hours, plus:",
    bullets: [
      "Your current number stays the same",
      "You pick the hours it answers — lunch, nights, weekends",
      "Callers hear your business name, not a generic greeting",
    ],
  },
  {
    id: "never-miss",
    name: "Never Miss",
    price: 97,
    minutes: 100,
    popular: true,
    tagline:
      "On a job? Hands full? Your voice agent picks up before the caller gives up.",
    inherit: "Everything in Business Line, plus:",
    bullets: [
      "Your phone always rings first",
      "Missed calls get answered — 24/7",
      "Appointments get booked while you work",
      "A summary of every call, sent right to you",
    ],
  },
  {
    id: "full-front-desk",
    name: "Full Front Desk",
    price: 197,
    minutes: 200,
    tagline: "Every call handled, 24/7. You run the business. We run the phone.",
    inherit: "Everything in Never Miss, plus:",
    bullets: [
      "Full 24/7 answering, or backup only — your choice",
      "New leads go straight into your CRM",
      "Instant text + email the moment a lead calls",
      "Priority help whenever you need a change",
    ],
  },
];

function Check({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`h-3.5 w-3.5 shrink-0 ${className}`}
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

export default function CustomPricingSection({ businessName }: CustomPricingSectionProps) {
  const [selectedId, setSelectedId] = useState("never-miss");
  const [loading, setLoading] = useState(false);
  const [inView, setInView] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  const selected = PLANS.find((p) => p.id === selectedId) ?? PLANS[2];

  // Show the pinned mobile checkout bar only while the pricing section is on screen.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: "0px 0px -40% 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  async function checkout() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          price: selected.price,
          trialDays: 0,
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
        setLoading(false);
      }
    } catch (err) {
      console.error("Checkout error:", err);
      alert("Something went wrong starting checkout. Please try again or contact support.");
      setLoading(false);
    }
  }

  const ctaLabel = loading
    ? "Starting…"
    : `Continue — ${selected.name} · $${selected.price}/mo →`;

  return (
    <section ref={sectionRef} className="mx-auto w-full max-w-3xl px-4 pb-32 pt-6 lg:pb-10">
      {/* Compact header */}
      <div className="text-center">
        <h2 className="font-serif text-[26px] font-bold leading-[1.15] tracking-tight text-foreground md:text-[30px]">
          A 24/7 Human-Like Voice Agent That Can Help You Get More Customers.
        </h2>
        <p className="mt-1.5 font-sans text-[13px] text-muted">
          Plans start at $29/mo.
        </p>
        <p className="mx-auto mt-2 max-w-xl font-sans text-[13px] leading-relaxed text-muted">
          When you can&apos;t pick up, your voice agent answers — day or night. It
          sounds like a real person, books the caller in, and texts or emails you
          their name, number, and what they need. Set up for your business in 24
          hours.
        </p>
      </div>

      {/* Plan picker — 2x2 on mobile, 4-across on desktop */}
      <div className="mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {PLANS.map((plan) => {
          const active = plan.id === selectedId;
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => setSelectedId(plan.id)}
              aria-pressed={active}
              className={`relative flex min-h-[64px] flex-col items-start justify-center rounded-2xl border px-3.5 py-2 text-left transition-all duration-200 active:scale-[0.97] ${
                active
                  ? "border-[#0a0a0a] bg-[#0a0a0a] text-white shadow-md"
                  : "border-[#e3e3e0] bg-white text-foreground hover:border-[#c9c9c4]"
              }`}
            >
              {plan.popular && (
                <span
                  className={`absolute -right-1.5 -top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white ${
                    active ? "bg-emerald-500" : "bg-emerald-500"
                  }`}
                >
                  Popular
                </span>
              )}
              <span
                className={`font-sans text-[13px] font-semibold leading-tight ${
                  active ? "text-white" : "text-foreground"
                }`}
              >
                {plan.name}
              </span>
              <span className="mt-0.5 font-serif text-[18px] font-bold leading-none">
                ${plan.price}/mo
              </span>
              <span
                className={`mt-0.5 font-sans text-[11px] ${
                  active ? "text-white/60" : "text-subtle"
                }`}
              >
                {plan.minutes} min/mo
              </span>
            </button>
          );
        })}
      </div>

      {/* Detail panel — fixed height, content fades on swap */}
      <div className="mt-4 h-[264px] rounded-3xl border border-[#e3e3e0] bg-white p-4">
        <div key={selected.id} className="animate-fade-in-up">
          <p className="font-sans text-[14px] font-medium leading-snug text-foreground">
            {selected.tagline}
          </p>
          {selected.inherit && (
            <p className="mt-2.5 font-sans text-[13px] font-semibold text-foreground/70">
              {selected.inherit}
            </p>
          )}
          <ul className="mt-2.5 space-y-2">
            {selected.bullets.map((b) => (
              <li
                key={b}
                className="flex items-center gap-1.5 font-sans text-[13px] leading-snug text-foreground/85"
              >
                <Check className="text-emerald-600" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 font-sans text-[11.5px] text-subtle">
            $1/min after your included minutes · Cancel anytime
          </p>
        </div>
      </div>

      {/* Desktop inline checkout button */}
      <button
        type="button"
        onClick={checkout}
        disabled={loading}
        className="mt-4 hidden min-h-[52px] w-full items-center justify-center rounded-full bg-foreground px-6 py-3.5 text-center font-sans text-[15px] font-semibold text-background transition-all duration-300 hover:bg-gold-light disabled:opacity-70 lg:flex"
      >
        {ctaLabel}
      </button>

      {/* Not-sure text link */}
      <div className="mt-4 text-center">
        <a
          href={SETUP_CALL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-sans text-[13px] font-medium text-muted underline decoration-[#c9c9c4] underline-offset-4 transition-colors hover:text-foreground"
        >
          Not sure? Book a free 10-min call
        </a>
      </div>

      {/* Sticky mobile checkout bar (safe-area aware) */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 transition-opacity duration-300 lg:hidden ${
          inView ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        style={{
          background:
            "linear-gradient(to top, #fafafa 55%, rgba(250,250,250,0.9) 80%, rgba(250,250,250,0))",
        }}
      >
        <button
          type="button"
          onClick={checkout}
          disabled={loading}
          className="flex min-h-[54px] w-full items-center justify-center rounded-full bg-foreground px-5 py-3.5 text-center font-sans text-[15px] font-semibold text-background shadow-lg transition-all duration-200 hover:bg-gold-light active:scale-[0.99] disabled:opacity-70"
        >
          {ctaLabel}
        </button>
      </div>
    </section>
  );
}
