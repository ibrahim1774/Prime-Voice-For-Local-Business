"use client";

import { usePathname } from "next/navigation";

interface PriceInfo {
  amount: number;
  yearlyAmount?: number;
  trial: boolean;
  hasYearly: boolean;
}

export default function StartTrialButton() {
  const pathname = usePathname();

  const prefixMatch = (p: string) =>
    pathname === p || pathname.startsWith(p + "/");

  const priceInfo: PriceInfo | null = prefixMatch("/19")
    ? { amount: 19, trial: true, hasYearly: false }
    : prefixMatch("/29")
    ? { amount: 29, trial: true, hasYearly: false }
    : prefixMatch("/49")
    ? { amount: 49, trial: true, hasYearly: false }
    : prefixMatch("/1")
    ? { amount: 19, trial: false, hasYearly: false }
    : prefixMatch("/2")
    ? { amount: 19, trial: true, hasYearly: false }
    : prefixMatch("/3")
    ? null
    : { amount: 99, yearlyAmount: 599, trial: true, hasYearly: true };

  if (!priceInfo) return null;

  const buttonLabel = priceInfo.trial
    ? `Start Free Trial — Then $${priceInfo.amount}/Month`
    : `Get Started — $${priceInfo.amount}/Month`;

  const trustLine = priceInfo.hasYearly
    ? `3-day free trial · $${priceInfo.amount}/mo or $${priceInfo.yearlyAmount}/yr · Cancel anytime`
    : priceInfo.trial
    ? `3-day free trial · $${priceInfo.amount}/mo · Cancel anytime`
    : `$${priceInfo.amount}/mo · Cancel anytime`;

  function handleClick() {
    window.dispatchEvent(new Event("open-pricing-drawer"));
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-white/80 px-5 py-2.5 font-sans text-sm font-semibold text-foreground shadow-sm backdrop-blur-sm transition-all hover:border-foreground/30 hover:bg-white hover:shadow-md"
      >
        {buttonLabel}
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 5l7 7-7 7" />
        </svg>
      </button>
      <p className="text-xs text-muted/80">{trustLine}</p>
    </>
  );
}
