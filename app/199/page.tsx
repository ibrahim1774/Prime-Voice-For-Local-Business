import HeroSection from "@/components/HeroSection";

export default function Page199() {
  return (
    <main>
      <HeroSection
        headline={
          <>
            <span className="text-muted">Don&apos;t Miss Another Customer Call &mdash;</span>{" "}
            <span className="font-bold text-foreground">
              24/7 Human-Like Answering Agent for $199/Month For Local Businesses
            </span>
          </>
        }
        subtext="Generate Your Free Live Demo in 20 Seconds."
      />
    </main>
  );
}
