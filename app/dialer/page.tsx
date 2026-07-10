import { Geist, Geist_Mono } from "next/font/google";
import DialerApp from "@/components/dialer/DialerApp";
import "./dialer.css";

// One family everywhere — the premium-SaaS move (Geist is Vercel's own
// typeface). Hierarchy comes from weight and size; Geist Mono is its
// matching data face for numbers, timestamps, and counts.
const geist = Geist({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-geist",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-geist-mono",
});

export const metadata = {
  title: "Montivaro | Command Dialing Center",
  robots: { index: false, follow: false },
};

export default function DialerPage() {
  return (
    <main className={`${geist.variable} ${geistMono.variable}`}>
      <DialerApp />
    </main>
  );
}
