import { redirect } from "next/navigation";
import DemoExperience from "@/components/DemoExperience";

interface DemoPageProps {
  searchParams: Promise<{ assistantId?: string; businessName?: string }>;
}

export default async function Demo49Page({ searchParams }: DemoPageProps) {
  const params = await searchParams;
  const { assistantId, businessName } = params;

  if (!assistantId || !businessName) {
    redirect("/49");
  }

  return (
    <main className="fixed inset-0 z-0 flex flex-col overflow-hidden">
      <DemoExperience
        assistantId={assistantId}
        businessName={decodeURIComponent(businessName)}
      />
    </main>
  );
}
