import IntakeForm from "./IntakeForm";

export default function HeroSection() {
  return (
    <section className="relative flex min-h-[100dvh] items-center justify-center px-4 py-8 md:py-16 aurora-bg overflow-hidden">
      {/* === AURORA BACKGROUND SYSTEM === */}

      {/* Layer 1: Deep base radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_50%,rgba(201,168,76,0.08)_0%,transparent_70%)]" />

      {/* Layer 2: Top-left ambient orb */}
      <div
        className="ambient-orb animate-glow-pulse"
        style={{
          top: "10%",
          left: "15%",
          width: "400px",
          height: "400px",
          background: "rgba(201, 168, 76, 0.06)",
        }}
      />

      {/* Layer 3: Bottom-right ambient orb */}
      <div
        className="ambient-orb animate-glow-pulse"
        style={{
          bottom: "15%",
          right: "10%",
          width: "350px",
          height: "350px",
          background: "rgba(161, 127, 26, 0.05)",
          animationDelay: "2s",
        }}
      />

      {/* Layer 4: SVG Aurora Wave 1 — Primary curve */}
      <div className="absolute inset-0 animate-aurora-drift" style={{ zIndex: 0 }}>
        <svg
          className="absolute w-full h-full"
          viewBox="0 0 1440 900"
          preserveAspectRatio="none"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="aurora1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(201, 168, 76, 0)" />
              <stop offset="30%" stopColor="rgba(201, 168, 76, 0.15)" />
              <stop offset="50%" stopColor="rgba(232, 212, 139, 0.12)" />
              <stop offset="70%" stopColor="rgba(201, 168, 76, 0.15)" />
              <stop offset="100%" stopColor="rgba(201, 168, 76, 0)" />
            </linearGradient>
            <filter id="glow1">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path
            d="M0,450 C200,350 400,550 720,400 C1040,250 1240,500 1440,420"
            stroke="url(#aurora1)"
            strokeWidth="2"
            filter="url(#glow1)"
          />
          <path
            d="M0,450 C200,350 400,550 720,400 C1040,250 1240,500 1440,420"
            stroke="url(#aurora1)"
            strokeWidth="60"
            strokeOpacity="0.03"
            filter="url(#glow1)"
          />
        </svg>
      </div>

      {/* Layer 5: SVG Aurora Wave 2 — Secondary curve */}
      <div className="absolute inset-0 animate-aurora-drift-reverse" style={{ zIndex: 0 }}>
        <svg
          className="absolute w-full h-full"
          viewBox="0 0 1440 900"
          preserveAspectRatio="none"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="aurora2" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(201, 168, 76, 0)" />
              <stop offset="20%" stopColor="rgba(161, 127, 26, 0.1)" />
              <stop offset="50%" stopColor="rgba(201, 168, 76, 0.08)" />
              <stop offset="80%" stopColor="rgba(232, 212, 139, 0.1)" />
              <stop offset="100%" stopColor="rgba(201, 168, 76, 0)" />
            </linearGradient>
            <filter id="glow2">
              <feGaussianBlur stdDeviation="12" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path
            d="M0,300 C360,500 600,200 900,350 C1200,500 1350,280 1440,350"
            stroke="url(#aurora2)"
            strokeWidth="1.5"
            filter="url(#glow2)"
          />
          <path
            d="M0,300 C360,500 600,200 900,350 C1200,500 1350,280 1440,350"
            stroke="url(#aurora2)"
            strokeWidth="80"
            strokeOpacity="0.02"
            filter="url(#glow2)"
          />
        </svg>
      </div>

      {/* Layer 6: SVG Aurora Wave 3 — Subtle tertiary curve */}
      <div className="absolute inset-0 animate-aurora-drift-slow" style={{ zIndex: 0 }}>
        <svg
          className="absolute w-full h-full"
          viewBox="0 0 1440 900"
          preserveAspectRatio="none"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="aurora3" x1="100%" y1="0%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="rgba(201, 168, 76, 0)" />
              <stop offset="40%" stopColor="rgba(201, 168, 76, 0.06)" />
              <stop offset="60%" stopColor="rgba(232, 212, 139, 0.05)" />
              <stop offset="100%" stopColor="rgba(201, 168, 76, 0)" />
            </linearGradient>
            <filter id="glow3">
              <feGaussianBlur stdDeviation="15" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path
            d="M0,600 C240,450 480,700 720,550 C960,400 1200,650 1440,500"
            stroke="url(#aurora3)"
            strokeWidth="1"
            filter="url(#glow3)"
          />
          <path
            d="M0,600 C240,450 480,700 720,550 C960,400 1200,650 1440,500"
            stroke="url(#aurora3)"
            strokeWidth="100"
            strokeOpacity="0.015"
            filter="url(#glow3)"
          />
        </svg>
      </div>

      {/* Layer 7: Floating particles */}
      <div className="particle particle-sm animate-float-particle" style={{ top: "20%", left: "10%" }} />
      <div className="particle particle-md animate-float-particle-delayed" style={{ top: "30%", right: "15%" }} />
      <div className="particle particle-sm animate-float-particle-slow" style={{ top: "60%", left: "25%" }} />
      <div className="particle particle-lg animate-float-particle" style={{ top: "15%", right: "30%", animationDelay: "1s" }} />
      <div className="particle particle-sm animate-float-particle-delayed" style={{ top: "70%", right: "20%" }} />
      <div className="particle particle-md animate-float-particle-slow" style={{ top: "45%", left: "5%" }} />
      <div className="particle particle-sm animate-float-particle" style={{ top: "80%", left: "60%", animationDelay: "3s" }} />
      <div className="particle particle-md animate-float-particle-delayed" style={{ top: "10%", left: "50%" }} />
      <div className="particle particle-sm animate-float-particle-slow" style={{ top: "55%", right: "8%" }} />
      <div className="particle particle-lg animate-float-particle" style={{ top: "35%", left: "40%", animationDelay: "5s" }} />
      <div className="particle particle-sm animate-float-particle-delayed" style={{ top: "85%", right: "40%" }} />
      <div className="particle particle-md animate-float-particle-slow" style={{ top: "25%", left: "70%" }} />

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
