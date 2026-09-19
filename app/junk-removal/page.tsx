import JunkRemovalCallPricing from "@/components/JunkRemovalCallPricing";

export const metadata = {
  title: "Montivaro | Junk Removal Voice Agent — $99/mo",
  description:
    "Answers when your hands are full — nights, weekends and mid-haul. Gets the load, the address and when, then texts you the lead. Call the live demo line and hear it work.",
};

export default function PageJunkRemoval() {
  return (
    <main>
      <JunkRemovalCallPricing />
    </main>
  );
}
