import type { Metadata } from "next";
import { Playfair_Display, DM_Sans } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Prime Contractor AI | Never Miss a Big Job Again",
  description:
    "Your 24/7 AI receptionist answers every call, books appointments, and handles customer inquiries — so you never lose business to a missed call. Better than your answering service. Better than voicemail.",
  openGraph: {
    title: "Prime Contractor AI | Never Miss a Big Job Again",
    description:
      "Your 24/7 AI receptionist answers every call, books appointments, and handles customer inquiries — so you never lose business to a missed call.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${playfair.variable} ${dmSans.variable}`}>
      <body className="noise-bg">{children}</body>
    </html>
  );
}
