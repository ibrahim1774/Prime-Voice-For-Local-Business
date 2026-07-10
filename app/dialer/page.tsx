import { Schibsted_Grotesk, IBM_Plex_Sans } from "next/font/google";
import DialerApp from "@/components/dialer/DialerApp";
import "./dialer.css";

// "Switchboard" faces, scoped to the dialer: Schibsted Grotesk carries the
// display voice, Plex Sans does the UI work. Plex Mono (loaded at the root
// layout) is reserved for data — numbers, timestamps, counts.
const display = Schibsted_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
});
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
});

export const metadata = {
  title: "Montivaro | Command Dialing Center",
  robots: { index: false, follow: false },
};

export default function DialerPage() {
  return (
    <main className={`${display.variable} ${plexSans.variable}`}>
      <DialerApp />
    </main>
  );
}
