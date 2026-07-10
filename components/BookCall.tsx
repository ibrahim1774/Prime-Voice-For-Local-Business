"use client";

// /bookcall — the landing for the lead-alert SMS's CTA. One job: get the
// visitor (usually on their phone, straight from the text) into the setup-call
// calendar with as little scrolling as possible. Styled on the homepage's
// monochrome .mv2 system.

import { useEffect } from "react";
import { SETUP_CALL_URL, FORM_EMBED_SCRIPT_URL } from "@/lib/constants";

export default function BookCall() {
  // LeadConnector's embed script auto-resizes the booking iframe.
  useEffect(() => {
    if (document.querySelector(`script[src="${FORM_EMBED_SCRIPT_URL}"]`)) return;
    const script = document.createElement("script");
    script.src = FORM_EMBED_SCRIPT_URL;
    script.type = "text/javascript";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  return (
    <div className="mv2 mv2-bookcall">
      <div className="mv2-bookcall-shell">
        <p className="mv2-eyebrow mv2-bookcall-eyebrow">Montivaro — Setup Call</p>
        <h1 className="mv2-bookcall-h">Book a phone call</h1>
        <p className="mv2-bookcall-sub">
          Choose a time that works best for you and we&apos;ll get everything set up.
        </p>
        <p className="mv2-bookcall-star">
          ⭐&nbsp; Imagine how much money you&apos;d make with every potential new
          client&apos;s call answered 24/7 — callers don&apos;t go to your
          competitor or your voicemail, and you never really have to grab the
          phone mid-job or during family time.
        </p>
        <div className="mv2-bookcall-cal">
          <iframe src={SETUP_CALL_URL} title="Book a phone call with Montivaro" />
        </div>
      </div>
    </div>
  );
}
