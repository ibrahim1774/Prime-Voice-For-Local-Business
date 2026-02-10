import { redirect } from "next/navigation";
import DemoExperience from "@/components/DemoExperience";

interface DemoPageProps {
  searchParams: Promise<{ assistantId?: string; businessName?: string }>;
}

export default async function DemoPage({ searchParams }: DemoPageProps) {
  const params = await searchParams;
  const { assistantId, businessName } = params;

  if (!assistantId || !businessName) {
    redirect("/");
  }

  return (
    <main className="min-h-screen flex items-center justify-center py-20">
      <DemoExperience
        assistantId={assistantId}
        businessName={decodeURIComponent(businessName)}
      />
    </main>
  );
}
