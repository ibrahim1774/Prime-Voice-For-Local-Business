import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  formatWhen,
  getSetupCallByToken,
  googleCalendarUrl,
  isVideo,
  videoUrl,
} from "@/lib/setupCalls";

// Booking page linked from the confirmation + reminder texts: the when, how
// the call happens (we dial them, or the video room to join), and two
// add-to-calendar buttons that work for anyone — a prefilled Google link, and
// the .ics for Apple Calendar / Outlook. Styled on the monochrome .mv2 system
// like /bookcall (the other SMS landing).

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
  const video = isVideo(row);

  return (
    <div className="mv2 mv2-bookcall mv2-setupcall">
      <div className="mv2-bookcall-shell">
        <div className="mv2-setupcall-check" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.5 4.5L19 7" />
          </svg>
        </div>
        <p className="mv2-eyebrow mv2-bookcall-eyebrow">
          Montivaro — Setup {video ? "Video Call" : "Call"}
        </p>
        <h1 className="mv2-bookcall-h">{first ? `You're booked, ${first}.` : "You're booked."}</h1>
        <p className="mv2-setupcall-when">{when}</p>

        <div className="mv2-bookcall-star mv2-setupcall-how">
          <span className="mv2-setupcall-label">How it works</span>
          {video ? (
            <>
              It&apos;s a video call — <strong>tap Join below at that time</strong>, from your phone or
              computer. Someone from Montivaro lets you in. The call takes about 15 minutes.
            </>
          ) : (
            <>
              Nothing to join and no link to click — <strong>we call you at {row.phone}</strong> at
              that time. Keep your phone handy; the call takes about 15 minutes.
            </>
          )}
        </div>

        <div className="mv2-setupcall-actions">
          {video && (
            <a
              className="mv2-btn mv2-btn-lg mv2-btn-light"
              href={videoUrl()}
              target="_blank"
              rel="noopener noreferrer"
            >
              Join the video call
            </a>
          )}
          <a
            className={`mv2-btn mv2-btn-lg ${video ? "mv2-btn-ghost" : "mv2-btn-light"}`}
            href={googleCalendarUrl(row)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Add to Google Calendar
          </a>
          <a className="mv2-btn mv2-btn-lg mv2-btn-ghost" href={`/api/c/${row.token}/ics`}>
            Add to Apple Calendar / Outlook
          </a>
        </div>

        <p className="mv2-bookcall-sub">Need a different time? Reply to our text and we&apos;ll move it.</p>
      </div>
    </div>
  );
}
