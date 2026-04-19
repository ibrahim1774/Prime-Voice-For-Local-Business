"use client";

export default function StartTrialButton() {
  function handleClick() {
    window.dispatchEvent(new Event("open-pricing-drawer"));
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-white/80 px-5 py-2.5 font-sans text-sm font-semibold text-foreground shadow-sm backdrop-blur-sm transition-all hover:border-foreground/30 hover:bg-white hover:shadow-md"
    >
      Start Free Trial — Then $99/Month
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
  );
}
