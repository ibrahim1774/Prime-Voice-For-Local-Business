import IntakeForm from "./IntakeForm";
import StartTrialButton from "./StartTrialButton";

export default function HeroSection() {
  return (
    <section className="relative min-h-[100dvh] overflow-hidden dotted-grid-bg">
      {/* Soft radial glow overlay */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(255,255,255,0.9) 0%, rgba(250,250,250,0) 70%)",
        }}
      />

      {/* Logo */}
      <div className="absolute top-5 left-5 z-20 md:top-7 md:left-8">
        <span className="font-serif text-lg font-bold text-foreground md:text-xl">
          Prime<span className="text-muted">Voice</span>
        </span>
      </div>

      {/* === CONTENT === */}
      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-4xl flex-col items-center justify-center px-5 py-24 text-center">
        {/* Main headline */}
        <h1 className="font-serif text-3xl font-semibold leading-[1.15] tracking-tight text-foreground sm:text-4xl md:text-5xl lg:text-[56px]">
          <span className="text-muted">Generate Your Custom AI Local Business Receptionist Demo</span>{" "}
          <span className="font-bold text-foreground">in 20 Seconds</span>
        </h1>

        {/* Subtext */}
        <p className="mx-auto mt-5 max-w-2xl font-sans text-sm leading-relaxed text-muted md:mt-6 md:text-base">
          Stop losing big jobs to missed calls. Your AI receptionist answers
          24/7 — booking appointments, answering pricing questions, and handling
          emergencies while you&apos;re on the job.
        </p>

        {/* Intake Form */}
        <div className="mt-10 w-full md:mt-12">
          <IntakeForm />
        </div>

        {/* Secondary CTA — direct to checkout (route-aware price) */}
        <div className="mt-5 flex flex-col items-center gap-2">
          <StartTrialButton />
        </div>

        {/* Trust Badge */}
        <div className="mt-6 flex items-center justify-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white/70 px-3 py-1 backdrop-blur-sm">
            <svg
              className="h-3.5 w-3.5 text-muted"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
            <span className="text-xs font-medium tracking-wide text-muted">
              Built for Local Service Pros
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
