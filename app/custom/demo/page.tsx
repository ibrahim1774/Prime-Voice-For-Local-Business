import { redirect } from "next/navigation";
import DemoExperience from "@/components/DemoExperience";
import CustomPricing from "@/components/CustomPricing";

interface DemoPageProps {
  searchParams: Promise<{ assistantId?: string; businessName?: string; voiceGender?: string }>;
}

export default async function DemoCustomPage({ searchParams }: DemoPageProps) {
  const params = await searchParams;
  const { assistantId, businessName, voiceGender } = params;

  if (!assistantId || !businessName) {
    redirect("/custom");
  }

  const decodedName = decodeURIComponent(businessName);

  return (
    <main className="fixed inset-0 z-0 flex flex-col overflow-hidden">
      <DemoExperience
        assistantId={assistantId}
        businessName={decodedName}
        voiceGender={voiceGender === "male" ? "male" : "female"}
        endedScreen={<CustomPricing businessName={decodedName} />}
      />
    </main>
  );
}
