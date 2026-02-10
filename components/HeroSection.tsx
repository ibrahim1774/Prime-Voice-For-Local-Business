import IntakeForm from "./IntakeForm";

export default function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center px-4 py-24 grid-bg overflow-hidden">
      {/* Radial gold gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(201,168,76,0.06)_0%,transparent_70%)]" />

      {/* Top edge fade */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/20 to-transparent" />

      <div className="relative z-10 mx-auto max-w-4xl text-center">
        {/* Tagline */}
        <p className="mb-6 font-sans text-sm uppercase tracking-[0.25em] text-gold/80">
          Better Than Your Answering Service. Better Than Voicemail.
        </p>

        {/* Main headline */}
        <h1 className="font-serif text-5xl font-bold leading-[1.1] text-white md:text-7xl lg:text-8xl">
          Never Lose a Big Job
          <br />
          <span className="text-gold">to a Missed Call</span>
          <br />
          Again
        </h1>

        {/* Subheadline */}
        <p className="mx-auto mt-8 max-w-2xl font-sans text-lg leading-relaxed text-muted md:text-xl">
          While you&apos;re on the roof, your phone is ringing. Your next $10,000
          job just went to voicemail — and then to your competitor.{" "}
          <span className="text-white">
            Prime answers every call, 24/7, like your best front desk employee.
          </span>
        </p>

        {/* Badge */}
        <div className="mt-10 mb-12 inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/5 px-6 py-3 backdrop-blur-sm">
          <div className="h-2 w-2 rounded-full bg-gold animate-pulse" />
          <span className="font-sans text-sm font-medium text-gold">
            Try It Free — Hear Your AI Receptionist in 60 Seconds
          </span>
        </div>

        {/* Intake Form */}
        <div className="mt-2">
          <IntakeForm />
        </div>
      </div>
    </section>
  );
}
