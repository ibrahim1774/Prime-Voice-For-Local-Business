import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatWhen, getSetupCallByToken, googleCalendarUrl } from "@/lib/setupCalls";

// Booking page linked from the confirmation + reminder texts: the when, the
// "we call you" line, and two add-to-calendar buttons that work for anyone —
// a prefilled Google link, and the .ics for Apple Calendar / Outlook.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your Montivaro setup call",
  robots: { index: false, follow: false },
};

export default async function SetupCallPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const row = await getSetupCallByToken(token);
  if (!row) notFound();

  const when = formatWhen(new Date(row.start_at), row.timezone);
  const first = row.name ? row.name.split(/\s+/)[0] : "";

  return (
    <section className="relative flex min-h-[100dvh] items-center justify-center px-4 py-16 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(201,168,76,0.06)_0%,transparent_70%)]" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/20 to-transparent" />

      <div className="relative z-10 mx-auto max-w-lg w-full text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border-2 border-gold/30 bg-gold/10">
          <svg className="h-10 w-10 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="font-serif text-3xl font-bold text-white md:text-4xl">
          {first ? `You're booked, ${first}!` : "You're booked!"}
        </h1>

        <p className="mx-auto mt-4 max-w-md font-sans text-lg leading-relaxed text-white">
          Montivaro setup call
          <br />
          <span className="text-gold font-semibold">{when}</span>
        </p>

        <div className="mt-8 gold-glow-border rounded-2xl p-6 text-left">
          <h2 className="font-sans text-sm uppercase tracking-[0.2em] text-gold mb-3">
            How it works
          </h2>
          <p className="font-sans text-sm text-muted leading-relaxed">
            Nothing to join and no link to click — <span className="text-white">we call you at {row.phone}</span> at
            that time. Keep your phone handy; the call takes about 15 minutes.
          </p>
        </div>

        <div className="mt-8 grid gap-3">
          <a
            href={googleCalendarUrl(row)}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl bg-gold px-6 py-4 font-sans text-base font-semibold text-black transition hover:brightness-110"
          >
            Add to Google Calendar
          </a>
          <a
            href={`/api/c/${row.token}/ics`}
            className="block rounded-xl border border-gold/40 bg-gold/10 px-6 py-4 font-sans text-base font-semibold text-gold transition hover:bg-gold/20"
          >
            Add to Apple Calendar / Outlook
          </a>
        </div>

        <p className="mt-8 font-sans text-sm text-muted">
          Need a different time? Reply to our text and we&apos;ll move it.
        </p>
      </div>
    </section>
  );
}
