import DialerApp from "@/components/dialer/DialerApp";

export const metadata = {
  title: "Montivaro | Dialer",
  robots: { index: false, follow: false },
};

export default function DialerPage() {
  return (
    <main>
      <DialerApp />
    </main>
  );
}
