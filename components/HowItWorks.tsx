import ScrollReveal from "./ScrollReveal";

const STEPS = [
  {
    number: "01",
    title: "Tell Us About Your Business",
    description:
      "Enter your business name and what you do. Takes 30 seconds.",
  },
  {
    number: "02",
    title: "We Build Your AI Receptionist",
    description:
      "Our AI instantly creates a custom receptionist trained on your services.",
  },
  {
    number: "03",
    title: "Test It Live, Right Now",
    description:
      "Talk to your receptionist right in your browser. No downloads. No setup.",
  },
];

export default function HowItWorks() {
  return (
    <section className="px-4 py-28 relative section-glow-divider overflow-hidden">
      <div className="relative mx-auto max-w-6xl">
        <ScrollReveal className="text-center mb-20">
          <p className="font-sans text-sm uppercase tracking-[0.25em] text-gold mb-4">
            How It Works
          </p>
          <h2 className="font-serif text-4xl font-bold text-white md:text-5xl lg:text-6xl">
            Up and Running in{" "}
            <span className="text-gold">60 Seconds</span>
          </h2>
        </ScrollReveal>

        <div className="grid gap-6 md:grid-cols-3 md:gap-8">
          {STEPS.map((step) => (
            <ScrollReveal key={step.number}>
              <div className="gold-glow-border rounded-2xl p-8 md:p-10 h-full transition-all duration-500">
                <span className="font-serif text-6xl font-bold text-gold/15">
                  {step.number}
                </span>
                <h3 className="mt-4 font-serif text-xl font-semibold text-white md:text-2xl">
                  {step.title}
                </h3>
                <p className="mt-3 font-sans text-muted leading-relaxed">
                  {step.description}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
