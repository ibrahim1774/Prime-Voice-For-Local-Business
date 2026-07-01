import HeroSection from "@/components/HeroSection";

// /99 — the $99/mo self-serve funnel. This is the original homepage (hero +
// live-demo form + $99 Stripe checkout via StickyCartBar/StartTrialButton),
// moved off the marketing homepage. Pricing is route-detected as $99 by the
// shared components (StickyCartBar, StartTrialButton, DemoExperience).
export default function Page99() {
  return (
    <main>
      <HeroSection
        headline={
          <>
            <span className="text-muted">Never Miss Another Customer Call &mdash;</span>{" "}
            <span className="font-bold text-foreground">
              A 24/7 Human-Like AI Receptionist for $99/Month
            </span>
          </>
        }
        subtext="Generate Your Free Live Demo in 20 Seconds."
      />
    </main>
  );
}
