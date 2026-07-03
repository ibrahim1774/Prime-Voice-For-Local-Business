import { redirect } from "next/navigation";
import CustomDemoExperience from "@/components/CustomDemoExperience";

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
    <main>
      <CustomDemoExperience
        assistantId={assistantId}
        businessName={decodedName}
        voiceGender={voiceGender === "male" ? "male" : "female"}
      />
    </main>
  );
}
