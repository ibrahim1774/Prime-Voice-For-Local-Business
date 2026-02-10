import ScrollReveal from "./ScrollReveal";

const FEATURES = [
  "Dedicated AI receptionist for your business",
  "24/7 coverage — nights, weekends, holidays",
  "Appointment booking & scheduling",
  "Call summaries & transcripts",
  "Dedicated phone number",
  "Cancel anytime — no contracts",
];

export default function PricingTeaser() {
  return (
    <section className="px-4 py-28">
      <div className="mx-auto max-w-2xl">
        <ScrollReveal>
          <div className="gold-glow-border rounded-3xl bg-card p-10 text-center md:p-14 relative overflow-hidden">
            {/* Subtle radial glow inside card */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(201,168,76,0.04)_0%,transparent_60%)]" />

            <div className="relative">
              <p className="font-sans text-sm uppercase tracking-[0.25em] text-gold mb-6">
                Simple Pricing
              </p>

              <h2 className="font-serif text-4xl font-bold text-white md:text-5xl">
                Starting at
              </h2>
              <p className="mt-2 font-serif text-7xl font-bold text-gold md:text-8xl">
                $97
                <span className="text-3xl text-gold/60">/mo</span>
              </p>

              <p className="mt-6 font-sans text-muted max-w-md mx-auto">
                Everything you need to never miss a call again. No setup fees.
                No hidden charges. Cancel anytime.
              </p>

              <div className="mt-10 space-y-3 text-left max-w-sm mx-auto">
                {FEATURES.map((feature) => (
                  <div
                    key={feature}
                    className="flex items-start gap-3 font-sans text-muted"
                  >
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
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              <a
                href="#"
                className="mt-10 inline-block rounded-xl bg-gold px-10 py-4 font-sans text-base font-semibold text-background transition-all duration-300 hover:bg-gold-light hover:scale-[1.02] active:scale-[0.98]"
              >
                Get Started
              </a>

              <p className="mt-4 font-sans text-xs text-subtle">
                Or{" "}
                <a href="#hero" className="text-gold hover:text-gold-light transition-colors">
                  try the free demo above first
                </a>
              </p>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
