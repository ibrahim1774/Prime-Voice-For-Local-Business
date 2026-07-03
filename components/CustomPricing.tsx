"use client";

import { useState } from "react";
import { SETUP_CALL_URL } from "@/lib/constants";

interface CustomPricingProps {
  businessName: string;
}

type ButtonStyle = "outline" | "solid" | "dark";

interface Tier {
  id: string;
  name: string;
  price: number;
  minutes: number;
  tagline: string;
  inheritLine: string | null;
  features: string[];
  button: string;
  buttonStyle: ButtonStyle;
  popular?: boolean;
  /** Tailwind order class for the MOBILE stack (reset to DOM order at sm+). */
  mobileOrder: string;
}

// DOM order is ascending ($29 → $197) so tablet (2-col) and desktop (4-col)
// read naturally left-to-right. On mobile only, `order-*` floats the $97
// "Never Miss" hero to the top of the stack.
const TIERS: Tier[] = [
  {
    id: "after-hours",
    name: "After Hours",
    price: 29,
    minutes: 30,
    tagline: "Stop losing the calls that come in after you close.",
    inheritLine: null,
    features: [
      "Dedicated local business number (no forwarding)",
      "AI answers nights & weekends",
      "Trained on your services & pricing",
      "Every lead emailed to you by morning",
    ],
    button: "Start After Hours",
    buttonStyle: "outline",
    mobileOrder: "order-2 sm:order-none",
  },
  {
    id: "business-line",
    name: "Business Line",
    price: 49,
    minutes: 50,
    tagline: "Forward your existing number. You choose when the AI picks up.",
    inheritLine: "Everything in After Hours, plus:",
    features: [
      "Your current number forwards to us",
      "Coverage on your schedule — after-hours, lunch, weekends",
      "Custom greeting in your business name",
    ],
    button: "Start Business Line",
    buttonStyle: "outline",
    mobileOrder: "order-3 sm:order-none",
  },
  {
    id: "never-miss",
    name: "Never Miss",
    price: 97,
    minutes: 100,
    tagline: "Your phone rings first. If you can't grab it, the AI does — 24/7.",
    inheritLine: "Everything in Business Line, plus:",
    features: [
      "You always get the call first",
      "AI catches every call you miss, day or night",
      "Books appointments while you're on the job",
      "Lead summary emailed after every call",
    ],
    button: "Never Miss a Call →",
    buttonStyle: "solid",
    popular: true,
    mobileOrder: "order-1 sm:order-none",
  },
  {
    id: "full-front-desk",
    name: "Full Front Desk",
    price: 197,
    minutes: 200,
    tagline: "A complete receptionist, wired into the tools you already use.",
    inheritLine: "Everything in Never Miss, plus:",
    features: [
      "Full 24/7 answering or overflow — your choice",
      "Syncs leads straight into your CRM",
      "Instant SMS + email lead alerts",
      "Priority support & tuning",
    ],
    button: "Get Full Front Desk",
    buttonStyle: "dark",
    mobileOrder: "order-4 sm:order-none",
  },
];

const TRUST = [
  "No setup fees",
  "Cancel anytime",
  "No contracts",
  "Live within 24 hours",
];

const STEPS = [
  {
    title: "Pick your plan",
    body: "Checkout takes 60 seconds.",
  },
  {
    title: "We call you",
    body: "10 minutes to tailor it to your services and hours.",
  },
  {
    title: "You're live",
    body: "We hand you the number or flip on forwarding within 24 hours.",
  },
];

const FAQS: { q: string; a: string }[] = [
  {
    q: "Do I have to change my number?",
    a: "No. Business Line and up ($49+) forward your existing number straight to us — you keep it. After Hours ($29) gives you a new dedicated local number instead.",
  },
  {
    q: "What happens when someone calls?",
    a: "Your AI receptionist answers in your business's name, handles questions about your services and pricing, books the appointment, and emails you a summary of every call — in a natural voice, day or night.",
  },
  {
    q: "Can I still answer my own calls?",
    a: "Yes. On Never Miss, your phone always rings first — the AI only steps in on the calls you can't grab.",
  },
  {
    q: "What happens if I use up my minutes?",
    a: "It's a flat $1/minute after your included minutes — no surprise tiers, no penalty rates. The average call runs 2–3 minutes, and if you're going over regularly, moving up a tier is cheaper.",
  },
  {
    q: "Can I cancel or switch plans?",
    a: "Every plan is month-to-month. Cancel or switch anytime in one click — no fees, no contracts.",
  },
];

function Check({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`h-[18px] w-[18px] shrink-0 ${className}`}
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

export default function CustomPricing({ businessName }: CustomPricingProps) {
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  async function checkout(tier: Tier) {
    if (loadingTier) return;
    setLoadingTier(tier.id);
    try {
      const res = await fetch("/api/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          price: tier.price,
          trialDays: 0,
          interval: "month",
          embedded: false,
        }),
      });
      const data: { url?: string; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error("Checkout failed:", data.error || "no url returned");
        alert("Something went wrong starting checkout. Please try again or contact support.");
        setLoadingTier(null);
      }
    } catch (err) {
      console.error("Checkout error:", err);
      alert("Something went wrong starting checkout. Please try again or contact support.");
      setLoadingTier(null);
    }
  }

  const buttonClasses = (style: ButtonStyle) => {
    const base =
      "block w-full min-h-[52px] rounded-full px-5 py-3.5 text-center font-sans text-[15px] font-semibold transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed active:scale-[0.99]";
    if (style === "solid") {
      // Sits on the inverted (black) Never Miss card.
      return `${base} bg-white text-[#0a0a0a] hover:bg-white/90`;
    }
    if (style === "dark") {
      return `${base} bg-foreground text-background hover:bg-gold-light`;
    }
    // outline
    return `${base} border border-foreground/25 bg-transparent text-foreground hover:bg-foreground/[0.04]`;
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden overscroll-contain dotted-grid-bg">
      <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10 sm:px-6">
        {/* ===== Success hero ===== */}
        <div className="mx-auto max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#e3e3e0] bg-white px-4 py-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="font-sans text-xs font-semibold uppercase tracking-wider text-muted">
              Demo complete
            </span>
          </div>

          <h1 className="mt-5 font-serif text-[32px] font-bold leading-[1.12] tracking-tight text-foreground sm:text-5xl">
            You Just Heard It. Now Put It on the Phones
            {businessName ? `, ${businessName}` : ""}.
          </h1>

          <p className="mx-auto mt-4 max-w-xl font-sans text-[15px] leading-relaxed text-muted sm:text-base">
            That was your receptionist — trained on your business in 20 seconds.
            Pick when it answers, and it&apos;s live within 24 hours.
          </p>

          {/* Trust strip */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {TRUST.map((item) => (
              <span
                key={item}
                className="inline-flex items-center gap-1.5 font-sans text-[13px] font-medium text-muted"
              >
                <Check className="text-emerald-600" />
                {item}
              </span>
            ))}
          </div>
        </div>

        {/* ===== Pricing cards ===== */}
        <div className="mt-10 grid grid-cols-1 gap-5 sm:mt-12 sm:grid-cols-2 lg:grid-cols-4">
          {TIERS.map((tier) => {
            const isPopular = !!tier.popular;
            return (
              <div
                key={tier.id}
                className={`relative flex ${tier.mobileOrder} ${
                  isPopular ? "lg:z-10 lg:-my-2" : ""
                }`}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-500 px-3 py-1 font-sans text-[11px] font-bold uppercase tracking-wider text-white shadow-sm">
                      ★ Most Popular
                    </span>
                  </div>
                )}

                <div
                  className={`flex w-full flex-col rounded-3xl border p-6 ${
                    isPopular
                      ? "border-[#0a0a0a] bg-[#0a0a0a] text-white shadow-xl lg:scale-[1.035] lg:py-8"
                      : "border-[#e3e3e0] bg-white text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_30px_rgba(0,0,0,0.05)]"
                  }`}
                >
                  <div
                    className={`font-sans text-[11px] font-bold uppercase tracking-[0.18em] ${
                      isPopular ? "text-white/60" : "text-muted"
                    }`}
                  >
                    {tier.name}
                  </div>

                  <div className="mt-3 flex items-baseline gap-1.5">
                    <span className="font-serif text-[42px] font-bold leading-none">
                      ${tier.price}
                    </span>
                    <span
                      className={`font-sans text-sm ${
                        isPopular ? "text-white/60" : "text-subtle"
                      }`}
                    >
                      /mo
                    </span>
                  </div>

                  <div className="mt-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 font-sans text-[12px] font-medium ${
                        isPopular
                          ? "border-white/15 bg-white/10 text-white/85"
                          : "border-[#e3e3e0] bg-[#f4f4f3] text-muted"
                      }`}
                    >
                      {tier.minutes} minutes included
                    </span>
                  </div>

                  <p
                    className={`mt-4 font-sans text-[15px] leading-snug ${
                      isPopular ? "text-white/80" : "text-muted"
                    }`}
                  >
                    {tier.tagline}
                  </p>

                  {tier.inheritLine && (
                    <p
                      className={`mt-5 font-sans text-[13px] font-semibold ${
                        isPopular ? "text-white/70" : "text-foreground/70"
                      }`}
                    >
                      {tier.inheritLine}
                    </p>
                  )}

                  <ul className="mt-3 flex-1 space-y-2.5">
                    {tier.features.map((f) => (
                      <li
                        key={f}
                        className="flex items-start gap-2.5 font-sans text-[15px] leading-snug"
                      >
                        <Check
                          className={`mt-0.5 ${
                            isPopular ? "text-emerald-400" : "text-emerald-600"
                          }`}
                        />
                        <span className={isPopular ? "text-white/90" : "text-foreground/85"}>
                          {f}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <p
                    className={`mt-5 font-sans text-[12px] ${
                      isPopular ? "text-white/55" : "text-subtle"
                    }`}
                  >
                    $1/min after included minutes · Cancel anytime
                  </p>

                  <button
                    type="button"
                    onClick={() => checkout(tier)}
                    disabled={loadingTier === tier.id}
                    className={`mt-3 ${buttonClasses(tier.buttonStyle)}`}
                  >
                    {loadingTier === tier.id ? "Starting…" : tier.button}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* ===== Reassurance line ===== */}
        <p className="mx-auto mt-10 max-w-2xl text-center font-sans text-[14.5px] leading-relaxed text-muted">
          Every plan is custom-tailored to your business on a quick setup call —
          your services, your hours, your voice. All plans are month-to-month with
          no contract. Go over your minutes? It&apos;s a flat $1/minute — no
          surprise tiers, no penalty rates. Cancel anytime in one click.
        </p>

        {/* ===== 3 steps ===== */}
        <div className="mx-auto mt-14 max-w-3xl">
          <h2 className="text-center font-serif text-2xl font-bold text-foreground sm:text-3xl">
            Live on your phones in 3 steps
          </h2>
          <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <div
                key={step.title}
                className="rounded-3xl border border-[#e3e3e0] bg-white p-5 text-center"
              >
                <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-foreground font-sans text-sm font-bold text-background">
                  {i + 1}
                </div>
                <div className="mt-3 font-sans text-[15px] font-semibold text-foreground">
                  {step.title}
                </div>
                <p className="mt-1.5 font-sans text-[14px] leading-relaxed text-muted">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ===== FAQ accordion ===== */}
        <div className="mx-auto mt-14 max-w-2xl">
          <h2 className="text-center font-serif text-2xl font-bold text-foreground sm:text-3xl">
            Questions, answered
          </h2>
          <div className="mt-6 space-y-3">
            {FAQS.map((faq, i) => {
              const open = openFaq === i;
              return (
                <div
                  key={faq.q}
                  className="overflow-hidden rounded-2xl border border-[#e3e3e0] bg-white"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(open ? null : i)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                    aria-expanded={open}
                  >
                    <span className="font-sans text-[15px] font-semibold text-foreground">
                      {faq.q}
                    </span>
                    <svg
                      className={`h-5 w-5 shrink-0 text-subtle transition-transform duration-200 ${
                        open ? "rotate-45" : ""
                      }`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                    </svg>
                  </button>
                  {open && (
                    <p className="px-5 pb-4 font-sans text-[14.5px] leading-relaxed text-muted">
                      {faq.a}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ===== Footer CTA (undecided) ===== */}
        <div className="mx-auto mt-14 max-w-2xl rounded-3xl border border-[#e3e3e0] bg-white p-7 text-center">
          <p className="mx-auto max-w-md font-sans text-[15px] leading-relaxed text-muted">
            Still deciding? Book a free 10-minute call and we&apos;ll match you to
            the right plan — no pressure.
          </p>
          <a
            href={SETUP_CALL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex min-h-[52px] w-full items-center justify-center rounded-full border border-foreground/25 bg-transparent px-6 py-3.5 font-sans text-[15px] font-semibold text-foreground transition-all duration-300 hover:bg-foreground/[0.04] sm:w-auto"
          >
            Book a free 10-minute call
          </a>
        </div>
      </div>
    </div>
  );
}
