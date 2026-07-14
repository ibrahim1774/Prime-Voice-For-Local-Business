import LeadDemoIntake from "@/components/LeadDemoIntake";

export const metadata = {
  title: "Montivaro | Hear Your Free Live Demo",
  description:
    "Tell us your name, business, and mobile number — then call the live demo line and hear exactly how a 24/7 answering agent would handle your calls.",
};

export default function LeadDemoPage() {
  return (
    <main>
      <LeadDemoIntake />
    </main>
  );
}
