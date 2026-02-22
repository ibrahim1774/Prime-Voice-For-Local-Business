import IntakeForm from "./IntakeForm";

export default function HeroSection() {
  return (
    <section className="relative flex min-h-[100dvh] items-center justify-center px-4 py-8 md:py-16 aurora-bg overflow-hidden">
      {/* Subtle radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_50%,rgba(201,168,76,0.08)_0%,transparent_70%)]" />

      {/* Static ambient orb for depth */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          top: "20%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "500px",
          height: "400px",
          background: "rgba(201, 168, 76, 0.04)",
          filter: "blur(60px)",
        }}
      />

      {/* Top edge glow line */}
      <div
        className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent"
        style={{ boxShadow: "0 0 15px rgba(201, 168, 76, 0.2)" }}
      />

      {/* === CONTENT === */}
      <div className="relative z-10 mx-auto max-w-4xl w-full text-center">
        {/* Main headline */}
        <h1 className="font-serif text-3xl font-bold leading-[1.15] text-white sm:text-4xl md:text-5xl lg:text-6xl">
          An AI Receptionist Built for Your Business,{" "}
          <span className="text-gold">Custom Sample Live in 20 Seconds.</span>
        </h1>

        {/* Subtext */}
        <p className="mx-auto mt-3 max-w-2xl font-sans text-sm leading-relaxed text-muted md:mt-4 md:text-base">
          Missed calls cost contractors thousands. Your custom AI receptionist
          can answer every missed call, day or night — capturing leads and
          booking jobs while you&#39;re on-site, after hours, or just busy. Tell us
          your business, and we&#39;ll build a working demo you can call right now
          and talk to, to see how it can be implemented in your business to can
          help start saving you money
        </p>

        {/* Intake Form */}
        <div className="mt-4 md:mt-6">
          <IntakeForm />
        </div>
      </div>
    </section>
  );
}
