"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { BOOKING_URL } from "@/lib/constants";

const BENEFITS = [
  "Catch every lead \u2014 24/7 call answering",
  "Saves every caller\u2019s details for you",
  "Sounds professional on every call",
  "Books appointments built in",
  "Covers after-hours and emergencies",
  "Trained on your business and services",
  "Lead follow-up app included",
  "Replaces your costly answering service",
];

// Compact layout used for the $99/mo root page — fewer, higher-level bullets.
const ROOT_BENEFITS = [
  "24/7 call answering so you don\u2019t miss leads",
  "Books jobs straight into your calendar",
  "Trained on your business and services",
  "Replaces a $3,000/mo front desk at a fraction of the cost",
];

const HOW_IT_WORKS = [
  {
    step: "1",
    title: "Fill out a short onboarding form",
    detail: "After checkout, tell us about your business. Takes two minutes.",
  },
  {
    step: "2",
    title: "We build your AI for your business",
    detail:
      "Share your pricing, services, hours, and voice style. We train the AI to match.",
  },
  {
    step: "3",
    title: "We set up your number and connect everything",
    detail:
      "You get a business line wired into your calendar and CRM.",
  },
  {
    step: "4",
    title: "Live in 24\u201348 hours",
    detail: "You start getting calls, leads, and booked jobs.",
  },
];

const OPTIONAL_INTEGRATIONS = [
  {
    title: "Your own CRM",
    detail: "GoHighLevel, HubSpot, Salesforce, or others.",
  },
  {
    title: "Your existing phone number",
    detail: "Keep your current line. We answer the calls you don\u2019t pick up.",
  },
  {
    title: "Your own booking platform",
    detail: "Calendly, Acuity, Google Calendar, or custom endpoints.",
  },
  {
    title: "Zapier & webhooks",
    detail: "Send caller data and leads anywhere you want.",
  },
];

const INCLUDED_ITEMS = [
  {
    feature: "Lead Capture App",
    detail: "One app for all your leads. Follow up fast.",
  },
  {
    feature: "CRM System",
    detail: "Manage all your leads in one place.",
  },
  {
    feature: "Dedicated Phone Number",
    detail: "A real business number for your AI receptionist.",
  },
  {
    feature: "24-Hour Setup",
    detail: "We build your setup in 24 hours. You\u2019re ready to go.",
  },
  {
    feature: "Custom AI Training",
    detail:
      "We train the AI on your business, services, and customers.",
  },
  {
    feature: "Usage-Based Call Pricing",
    detail:
      "Extra charges apply for calls and minutes used.",
    italic: true,
  },
];

type BillingInterval = "month" | "year";

export default function StickyCartBar() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("month");
  const pathname = usePathname();
  const isHomePage = pathname === "/";

  // Route-aware pricing.
  //   /      + /demo          → $99/mo or $599/yr toggle, 3-day trial
  //   /19    + /19/demo       → $19/month, 3-day trial
  //   /29    + /29/demo       → $29/month, 3-day trial
  //   /49    + /49/demo       → $49/month, 3-day trial
  //   /1, /2 (legacy)         → $19/month (A/B historical variants)
  //   /3                      → booking-only (no Stripe)
  const prefixMatch = (prefix: string) =>
    pathname === prefix || pathname.startsWith(prefix + "/");

  const isBookingRoute = prefixMatch("/3");
  const isRootPricing =
    isHomePage || pathname === "/demo" || pathname.startsWith("/demo?");
  const supportsYearlyToggle = isRootPricing;

  const fixedMonthly = (price: number) => ({
    price,
    trialDays: 3,
    interval: "month" as BillingInterval,
    label: `$${price}/mo`,
    labelLong: `$${price}/month`,
    trialText: " \u2014 3-day free trial",
  });

  const priceConfig = prefixMatch("/19")
    ? fixedMonthly(19)
    : prefixMatch("/29")
    ? fixedMonthly(29)
    : prefixMatch("/49")
    ? fixedMonthly(49)
    : prefixMatch("/1")
    ? {
        price: 19,
        trialDays: 0,
        interval: "month" as BillingInterval,
        label: "$19/mo",
        labelLong: "$19/month",
        trialText: "",
      }
    : prefixMatch("/2")
    ? {
        price: 19,
        trialDays: 3,
        interval: "month" as BillingInterval,
        label: "$19/mo",
        labelLong: "$19/month",
        trialText: " \u2014 3-day trial",
      }
    : isBookingRoute
    ? null
    : billingInterval === "year"
    ? {
        price: 599,
        trialDays: 3,
        interval: "year" as BillingInterval,
        label: "$599/yr",
        labelLong: "$599/year",
        trialText: " \u2014 3-day free trial",
      }
    : {
        price: 99,
        trialDays: 3,
        interval: "month" as BillingInterval,
        label: "$99/mo",
        labelLong: "$99/month",
        trialText: " \u2014 3-day free trial",
      };

  async function handleCheckout() {
    if (isCheckingOut || !priceConfig) return;
    setIsCheckingOut(true);
    try {
      const businessName =
        new URLSearchParams(window.location.search).get("businessName") || "";
      const res = await fetch("/api/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          price: priceConfig.price,
          trialDays: priceConfig.trialDays,
          interval: priceConfig.interval,
        }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      setIsCheckingOut(false);
    }
  }

  // Listen for custom event to open drawer (used by demo page CTA)
  useEffect(() => {
    const handler = () => setIsDrawerOpen(true);
    window.addEventListener("open-pricing-drawer", handler);
    return () => window.removeEventListener("open-pricing-drawer", handler);
  }, []);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isDrawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isDrawerOpen]);

  const openDrawer = useCallback(() => setIsDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);

  // Hide sticky bar on all landing pages + demo + post-checkout pages.
  const showStickyBar =
    !isHomePage &&
    !pathname.includes("/demo") &&
    pathname !== "/1" &&
    pathname !== "/2" &&
    pathname !== "/3" &&
    pathname !== "/19" &&
    pathname !== "/29" &&
    pathname !== "/49" &&
    !pathname.startsWith("/call") &&
    !pathname.startsWith("/booking-confirmation") &&
    !pathname.startsWith("/thank-you");

  return (
    <>
      {/* Sticky Bottom Bar */}
      {showStickyBar && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 border-t border-gold/30 bg-background/95 backdrop-blur-md"
          style={{
            boxShadow: "0 -4px 20px rgba(201, 168, 76, 0.15)",
          }}
        >
          <a
            href={BOOKING_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-between px-4 py-3.5 md:px-8"
          >
            <p className="font-sans text-sm text-muted md:text-base">
              <span className="hidden md:inline">
                Get a 24/7 AI Receptionist for Your Business
              </span>
              <span className="md:hidden">
                24/7 AI Receptionist
              </span>
            </p>
            <span className="shrink-0 rounded-lg bg-gold px-5 py-2.5 font-sans text-sm font-semibold text-background transition-all duration-300 hover:bg-gold-light md:px-6">
              Book a Call
            </span>
          </a>
        </div>
      )}

      {/* Drawer Overlay + Panel */}
      <div
        className={`fixed inset-0 z-50 transition-all duration-300 ${isDrawerOpen
          ? "visible opacity-100"
          : "invisible opacity-0 pointer-events-none"
          }`}
      >
        {/* Backdrop (solid — no blur for smooth open) */}
        <div
          className="absolute inset-0 bg-black/70"
          onClick={closeDrawer}
        />

        {/* Drawer Panel */}
        <div
          className={`absolute bottom-0 left-0 right-0 max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-gold/20 bg-card custom-scrollbar transition-transform duration-300 ease-out ${isDrawerOpen ? "translate-y-0" : "translate-y-full"
            }`}
          style={{
            boxShadow: "0 -8px 40px rgba(201, 168, 76, 0.1)",
            willChange: "transform",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <div className="relative p-6 md:p-10">
            <div className="mx-auto max-w-2xl">
              {/* Close Button */}
              <button
                onClick={closeDrawer}
                className="absolute right-4 top-4 rounded-full p-2 text-subtle transition-colors hover:text-white md:right-6 md:top-6"
                aria-label="Close"
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>

              {/* Drag Handle */}
              <div className="mx-auto mb-6 h-1 w-12 rounded-full bg-gold/40" />

              {/* No Setup Fee badge (all paid plans) */}
              {priceConfig && (
                <div className="mb-4 flex items-center justify-center">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/15 px-3 py-1 font-sans text-[11px] font-bold uppercase tracking-[0.15em] text-gold"
                    style={{ boxShadow: "0 0 16px rgba(201, 168, 76, 0.25)" }}
                  >
                    <svg
                      className="h-3 w-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    No Setup Fee
                  </span>
                </div>
              )}

              {/* Header */}
              {supportsYearlyToggle ? (
                <>
                  <p className="mb-2 text-center font-sans text-[11px] font-bold uppercase tracking-[0.2em] text-gold/80">
                    Built for Local Businesses
                  </p>
                  <h3 className="mx-auto max-w-md text-balance text-center font-serif text-2xl font-bold leading-tight text-white md:text-3xl">
                    Don&apos;t Miss a Call. <span className="text-gold">Don&apos;t Lose a Job.</span>
                  </h3>
                  <div className="mx-auto mt-3 h-px w-20 bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
                  <p className="mx-auto mt-3 max-w-md text-center font-sans text-sm leading-relaxed text-muted">
                    A 24/7 AI receptionist for local businesses. It answers calls
                    and books jobs. Trained on your business.
                  </p>
                </>
              ) : (
                <>
                  <p className="mb-2 text-center font-sans text-[11px] font-bold uppercase tracking-[0.2em] text-gold/80">
                    Built for Local Businesses
                  </p>
                  <h3 className="text-center font-serif text-xl font-bold leading-snug text-white md:text-2xl">
                    A Smart AI Receptionist for Local Businesses{" "}
                    <span className="text-gold">
                      So You Don&apos;t Lose Work to Competitors.
                    </span>
                  </h3>
                  <div className="mx-auto mt-3 h-px w-20 bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
                  <p className="mt-3 text-center font-sans text-sm leading-relaxed text-muted">
                    Every missed call could be worth $1,000 to $10,000 in lost
                    jobs. You&apos;re probably missing them now. This is a foundation
                    for your business.
                  </p>
                </>
              )}

              {/* Benefits List (compact on root) */}
              <div className={supportsYearlyToggle ? "mt-6 space-y-2.5" : "mt-8 space-y-3"}>
                {(supportsYearlyToggle ? ROOT_BENEFITS : BENEFITS).map((benefit) => (
                  <div key={benefit} className="flex items-start gap-3">
                    <svg
                      className="mt-0.5 h-5 w-5 shrink-0 text-gold"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span className="font-sans text-sm text-muted">
                      {benefit}
                    </span>
                  </div>
                ))}
              </div>

              {/* Billing interval toggle (root/demo only) */}
              {supportsYearlyToggle && priceConfig && (
                <div className="mt-8 flex items-center justify-center">
                  <div className="inline-flex rounded-full border border-gold/30 bg-charcoal/60 p-1">
                    <button
                      type="button"
                      onClick={() => setBillingInterval("month")}
                      className={`rounded-full px-4 py-1.5 font-sans text-xs font-semibold transition-colors ${
                        billingInterval === "month"
                          ? "bg-gold text-background"
                          : "text-muted hover:text-white"
                      }`}
                    >
                      Monthly
                    </button>
                    <button
                      type="button"
                      onClick={() => setBillingInterval("year")}
                      className={`rounded-full px-4 py-1.5 font-sans text-xs font-semibold transition-colors ${
                        billingInterval === "year"
                          ? "bg-gold text-background"
                          : "text-muted hover:text-white"
                      }`}
                    >
                      Yearly <span className="ml-1 text-[10px] opacity-80">save ~50%</span>
                    </button>
                  </div>
                </div>
              )}

              {/* CTA — Stripe checkout or Booking URL */}
              <div className="mt-6">
                {priceConfig ? (
                  <>
                    <p className="text-center font-sans text-sm font-semibold text-white mb-1">
                      Start for {priceConfig.labelLong}{priceConfig.trialText}. Cancel anytime.
                    </p>
                    <p className="text-center font-sans text-xs text-subtle mb-4">
                      No setup fees. Takes 2 minutes.
                    </p>
                    <button
                      onClick={handleCheckout}
                      disabled={isCheckingOut}
                      className="block w-full rounded-xl bg-gold py-4 text-center font-sans text-base font-semibold text-background transition-all duration-300 hover:bg-gold-light hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100"
                      style={{
                        boxShadow: "0 0 20px rgba(201, 168, 76, 0.3)",
                      }}
                    >
                      {isCheckingOut ? "Redirecting..." : "Set This Up For My Business"}
                    </button>
                    <p className="mt-3 text-center font-sans text-xs italic text-subtle">
                      *Extra charges apply for calls and minutes used.
                    </p>
                  </>
                ) : (
                  <>
                    <a
                      href={BOOKING_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full rounded-xl bg-gold py-4 text-center font-sans text-base font-semibold text-background transition-all duration-300 hover:bg-gold-light hover:scale-[1.01] active:scale-[0.99]"
                      style={{
                        boxShadow: "0 0 20px rgba(201, 168, 76, 0.3)",
                      }}
                    >
                      Book a Call to Set This Up
                    </a>
                    <p className="mt-3 text-center font-sans text-xs text-subtle">
                      We walk you through setup. You go live in 24 hours.
                    </p>
                  </>
                )}
              </div>

              {/* How It Works (root/demo only) OR What's Included table (legacy routes) */}
              {supportsYearlyToggle ? (
                <div className="mt-8">
                  <h4 className="mb-4 text-center font-sans text-xs uppercase tracking-[0.2em] text-gold">
                    How It Works
                  </h4>
                  <div className="space-y-3">
                    {HOW_IT_WORKS.map((s) => (
                      <div
                        key={s.step}
                        className="flex items-start gap-3 rounded-xl border border-gold/10 bg-card/60 px-4 py-3"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold/15 font-sans text-xs font-bold text-gold">
                          {s.step}
                        </span>
                        <div>
                          <p className="font-sans text-sm font-medium text-white">
                            {s.title}
                          </p>
                          <p className="mt-0.5 font-sans text-xs text-muted">
                            {s.detail}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-10">
                  <h4 className="mb-4 font-sans text-xs uppercase tracking-[0.2em] text-gold">
                    What&apos;s Included
                  </h4>
                  <div className="gold-glow-border overflow-hidden rounded-xl">
                    {INCLUDED_ITEMS.map((item, i) => (
                      <div
                        key={item.feature}
                        className={`px-5 py-3.5 font-sans text-sm ${i % 2 === 0 ? "bg-card" : "bg-charcoal/50"
                          }`}
                      >
                        <p className="font-medium text-white">{item.feature}</p>
                        <p
                          className={`mt-0.5 text-muted ${
                            "italic" in item && item.italic ? "italic" : ""
                          }`}
                        >
                          {item.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Optional Integrations (root/demo only) */}
              {supportsYearlyToggle && (
                <div className="mt-8">
                  <h4 className="mb-1 text-center font-sans text-xs uppercase tracking-[0.2em] text-gold">
                    Optional Integrations
                  </h4>
                  <p className="mb-4 text-center font-sans text-xs text-subtle">
                    Already have tools? We plug right in.
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {OPTIONAL_INTEGRATIONS.map((item) => (
                      <div
                        key={item.title}
                        className="rounded-lg border border-gold/10 bg-card/60 px-4 py-3"
                      >
                        <p className="font-sans text-sm font-medium text-white">
                          {item.title}
                        </p>
                        <p className="mt-0.5 font-sans text-xs text-muted">
                          {item.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bottom section — price or booking CTA */}
              <div className={supportsYearlyToggle ? "mt-6 text-center" : "mt-10 text-center"}>
                {priceConfig ? (
                  <>
                    <p className="font-serif text-5xl font-bold text-gold md:text-6xl">
                      ${priceConfig.price}
                      <span className="text-2xl text-gold/60">
                        /{priceConfig.interval === "year" ? "year" : "month"}
                      </span>
                    </p>
                    <p className="mt-2 font-sans text-sm text-muted">
                      {priceConfig.trialDays > 0
                        ? `${priceConfig.trialDays}-day free trial. `
                        : ""}
                      Cancel anytime. No contracts.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-serif text-2xl font-bold text-white md:text-3xl">
                      Ready to Catch Every Call?
                    </p>
                    <p className="mt-2 font-sans text-sm text-muted">
                      Book a quick call. We set you up in 24 hours.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
