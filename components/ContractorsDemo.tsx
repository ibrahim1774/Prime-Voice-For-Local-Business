"use client";

// montivaro.com/contractors — click-to-call demo line for home-service
// businesses (plumbing, HVAC, electrical, roofing, remodeling). Call it like
// a customer would and hear how the AI receptionist books the job; qualified
// callers get the sample owner lead-alert SMS afterward. mv2 Call Sheet skin.


const CALL_NUMBER_DISPLAY = "(840) 688-2671";
const CALL_NUMBER_TEL = "tel:+18406882671";

function trackLead() {
  const eventId = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const fbq = (window as any).fbq;
  if (typeof fbq === "function") {
    fbq(
      "track",
      "Lead",
      { content_name: "/contractors tap-to-call", content_category: "tap-to-call" },
      { eventID: eventId }
    );
  }
  fetch("/api/meta-lead-conversion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber: "+18406882671", eventId }),
    keepalive: true,
  }).catch(() => {});
}

function MiniWave() {
  return (
    <div className="mv2-catchall-wave" aria-hidden="true">
      {Array.from({ length: 22 }, (_, i) => (
        <span
          key={i}
          style={{
            animationDelay: `${(i % 7) * 0.13}s`,
            animationDuration: `${0.9 + ((i * 5) % 4) * 0.14}s`,
          }}
        />
      ))}
    </div>
  );
}

export default function ContractorsDemo() {
  return (
    <div className="mv2 mv2-catchall">
      <div className="mv2-catchall-shell">
        <h1 className="mv2-catchall-h mv2-ca-in" style={{ animationDelay: "0.1s" }}>
          <span className="mv2-catchall-h-muted">Every Missed Call Is a Missed Job &mdash;</span>{" "}
          <span>A 24/7 AI Receptionist for Home-Service Pros</span>
        </h1>

        <p className="mv2-catchall-sub mv2-ca-in" style={{ animationDelay: "0.24s" }}>
          Call the demo line like one of your customers would &mdash; burst
          pipe, no heat, quote request &mdash; and hear how it answers, books
          the job, and texts you the lead before the caller even hangs up.
          Plumbing, HVAC, electrical, roofing, remodeling &mdash; it's built
          around your trade.
        </p>

        <a
          href={CALL_NUMBER_TEL}
          onClick={trackLead}
          className="mv2-catchall-test mv2-ca-in"
          style={{ animationDelay: "0.36s", marginTop: "30px" }}
        >
          <span className="mv2-catchall-test-dot" aria-hidden="true" />
          Call it like a customer would
        </a>

        <div className="mv2-ca-in" style={{ animationDelay: "0.46s" }}>
          <MiniWave />
        </div>

        <a href={CALL_NUMBER_TEL} onClick={trackLead} className="mv2-btn mv2-btn-light mv2-catchall-call">
          <svg
            width="20"
            height="20"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
            />
          </svg>
          Call Now
        </a>

        <a
          href={CALL_NUMBER_TEL}
          onClick={trackLead}
          className="mv2-mono mv2-catchall-number mv2-ca-in"
          style={{ animationDelay: "0.6s" }}
        >
          {CALL_NUMBER_DISPLAY}
        </a>

        <p className="mv2-catchall-hint mv2-ca-in" style={{ animationDelay: "0.68s" }}>
          Tap the number to call from your phone
        </p>

        <div className="mv2-catchall-book mv2-ca-in" style={{ animationDelay: "0.8s" }}>
          <p className="mv2-catchall-book-h">
            Get it answering your company's phones
          </p>
          <p className="mv2-catchall-book-sub">
            Custom-built to your trade, service area, and dispatch flow &mdash;
            $199&ndash;$997/month, usage minutes included.
          </p>
        </div>
      </div>
    </div>
  );
}
