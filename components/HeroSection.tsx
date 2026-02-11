import IntakeForm from "./IntakeForm";

export default function HeroSection() {
  return (
    <section className="relative flex min-h-[100dvh] items-center justify-center px-4 py-8 md:py-16 grid-bg overflow-hidden">
      {/* Radial gold gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(201,168,76,0.06)_0%,transparent_70%)]" />

      {/* Top edge fade */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/20 to-transparent" />

      <div className="relative z-10 mx-auto max-w-4xl w-full text-center">
        {/* Main headline */}
        <h1 className="font-serif text-3xl font-bold leading-[1.15] text-white sm:text-4xl md:text-5xl lg:text-6xl">
          Generate a Custom Voice Receptionist for{" "}
          <span className="text-gold">Your Contracting Business Within 20 Seconds</span>
        </h1>

        {/* Subtext */}
        <p className="mx-auto mt-4 max-w-2xl font-sans text-base leading-relaxed text-muted md:mt-6 md:text-lg">
          Don&apos;t Lose a Big Job to a Missed Call Again. Get a 24/7
          receptionist for your contracting business.
        </p>

        {/* Intake Form */}
        <div className="mt-6 md:mt-8">
          <IntakeForm />
        </div>
      </div>
    </section>
  );
}
