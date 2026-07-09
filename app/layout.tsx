import type { Metadata } from "next";
import { Playfair_Display, DM_Sans, Plus_Jakarta_Sans, Archivo, IBM_Plex_Mono } from "next/font/google";
import Script from "next/script";
import StickyCartBar from "@/components/StickyCartBar";
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

// Display face for the premium homepage headlines — a modern grotesque with
// more character than a neutral system sans, scoped to headings via .mv-display.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

// Homepage ("The Call Sheet") faces: Archivo variable carries the width axis
// (expanded display headlines), Plex Mono carries timecodes + transcripts.
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  axes: ["wdth"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Montivaro | Every Call Answered. Every Job Captured.",
  description:
    "Montivaro is a 24/7 human-sounding AI voice agent for local businesses — it answers every call, books appointments, and sends you the lead by text and email, so you never lose a job to voicemail.",
  openGraph: {
    title: "Montivaro | Every Call Answered. Every Job Captured.",
    description:
      "A 24/7 human-sounding AI voice agent for local businesses — answers every call, books appointments, and sends you every lead.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${playfair.variable} ${dmSans.variable} ${jakarta.variable} ${archivo.variable} ${plexMono.variable}`}>
      <body>
        {/* Facebook Pixel */}
        <Script id="facebook-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '26490568997297314');
            fbq('track', 'PageView');
          `}
        </Script>
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: "none" }}
            src="https://www.facebook.com/tr?id=26490568997297314&ev=PageView&noscript=1"
          />
        </noscript>

        {/* Microsoft Clarity */}
        <Script id="microsoft-clarity" strategy="afterInteractive">
          {`
            (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "w5jdq6huun");
          `}
        </Script>

        <div className="pb-16">{children}</div>
        <StickyCartBar />
      </body>
    </html>
  );
}
