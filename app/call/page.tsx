import type { Metadata } from "next";
import CallCTAButton from "@/components/CallCTAButton";

export const metadata: Metadata = {
  title: "PrimeVoice | 24/7 AI Receptionist — $99/mo",
  description:
    "Stop paying $3,000/mo for a front desk. Our AI answers, screens, and fills your calendar while you keep your existing number.",
};

const PHONE_NUMBER = process.env.NEXT_PUBLIC_INTAKE_PHONE_NUMBER || "";

function formatPhoneDisplay(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
}

export default function CallPage() {
  const telHref = PHONE_NUMBER ? `tel:${PHONE_NUMBER.replace(/[^+\d]/g, "")}` : undefined;
  const displayPhone = PHONE_NUMBER ? formatPhoneDisplay(PHONE_NUMBER) : "+1 (555) 000-0000";

  return (
    <div className="relative min-h-screen bg-white font-sans text-[#0c1a4b]">
      <main className="mx-auto flex max-w-md flex-col px-5 pt-6 pb-12 sm:pt-10">
        {/* Header */}
        <header className="mb-10 flex items-center justify-between">
          <span className="font-serif text-2xl font-bold tracking-tight text-[#0c1a4b]">
            prime<span className="text-[#f4c01c]">voice</span>
          </span>
          <a
            href={telHref}
            className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            {displayPhone}
          </a>
        </header>

        {/* Hero headline */}
        <h1 className="text-center font-serif text-[28px] font-bold leading-tight text-[#0c1a4b] sm:text-3xl">
          24/7 AI Receptionist: $99/mo
        </h1>

        <p className="mt-5 text-center text-base leading-relaxed text-[#0c1a4b]/85 sm:text-lg">
          Stop paying $3,000/mo for a front desk. Our AI answers, screens, and
          fills your calendar while you keep your existing number.
        </p>

        {/* Setup fee */}
        <div className="mt-7 text-center">
          <p className="text-lg font-bold text-[#0c1a4b] sm:text-xl">
            Setup Fee:{" "}
            <span className="font-normal text-red-600 line-through decoration-red-600 decoration-2">
              $250
            </span>{" "}
            <span className="text-[#0c1a4b]">$0</span>
          </p>
          <p className="mt-1 text-sm text-[#0c1a4b]/70">(Limited Time Only)</p>
        </div>

        {/* Offer card */}
        <div className="mt-8 rounded-2xl bg-[#f4c01c] p-5 shadow-[0_4px_24px_rgba(244,192,28,0.35)] sm:p-6">
          <p className="text-center text-sm font-bold uppercase tracking-wide text-[#0c1a4b]">
            $0 Setup Fee — Limited Time
          </p>

          <div className="mt-5">
            <CallCTAButton phone={PHONE_NUMBER}>
              <span className="block text-base font-bold uppercase leading-tight sm:text-lg">
                Tap to Call &amp; Lock In Free Setup
              </span>
              <span className="mt-1 block text-sm font-normal text-white/90">
                Hear a Live Demo in 60 Seconds
              </span>
            </CallCTAButton>
          </div>
        </div>

        {/* Trust chips */}
        <div className="mt-8 grid grid-cols-1 gap-2 text-center text-sm text-[#0c1a4b]/80 sm:grid-cols-3 sm:gap-3">
          <div className="rounded-lg border border-[#0c1a4b]/10 px-3 py-2">
            Keep your number
          </div>
          <div className="rounded-lg border border-[#0c1a4b]/10 px-3 py-2">
            Books your calendar
          </div>
          <div className="rounded-lg border border-[#0c1a4b]/10 px-3 py-2">
            Live in 24 hrs
          </div>
        </div>

        <p className="mt-10 text-center text-xs text-[#0c1a4b]/50">
          © {new Date().getFullYear()} PrimeVoice. All rights reserved.
        </p>
      </main>
    </div>
  );
}
