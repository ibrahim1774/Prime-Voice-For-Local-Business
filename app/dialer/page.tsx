import DialerApp from "@/components/dialer/DialerApp";
import "./dialer.css";

export const metadata = {
  title: "Montivaro | Command Dialing Center",
  robots: { index: false, follow: false },
};

export default function DialerPage() {
  return (
    <main>
      <DialerApp />
    </main>
  );
}
