import { Bricolage_Grotesque, Instrument_Sans, IBM_Plex_Mono } from "next/font/google";
import DentistDemo from "@/components/DentistDemo";
import "./dentist.css";

// "Porcelain Clinic" — the one light page in a dark site. Clinical porcelain
// ground, deep teal ink, surgical-mint accents; Bricolage display over
// Instrument Sans, Plex Mono for stamps and timecodes.

export const metadata = {
  title: "Montivaro Dental | The Front Desk That Never Misses a Patient",
  description:
    "Call the live demo line like a patient would and hear how an AI receptionist answers for your practice — 24/7, booked into your schedule.",
};

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--dnt-display",
});
const body = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--dnt-body",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--dnt-mono",
});

export default function DentistPage() {
  return (
    <main className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <DentistDemo />
    </main>
  );
}
