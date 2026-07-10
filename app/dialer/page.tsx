import DialerApp from "@/components/dialer/DialerApp";
import "./dialer.css";

export const metadata = {
  title: "Montivaro | Command",
  robots: { index: false, follow: false },
};

export default function DialerPage() {
  return (
    <main>
      <DialerApp />
    </main>
  );
}
