"use client";

import { ReactNode } from "react";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

interface CallCTAButtonProps {
  phone: string;
  children: ReactNode;
  className?: string;
}

export default function CallCTAButton({
  phone,
  children,
  className = "",
}: CallCTAButtonProps) {
  function handleClick() {
    const eventId = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    if (window.fbq) {
      window.fbq(
        "track",
        "Lead",
        { content_name: "/call tap-to-call", content_category: "tap-to-call" },
        { eventID: eventId }
      );
    }

    fetch("/api/meta-lead-conversion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber: phone, eventId }),
      keepalive: true,
    }).catch(() => {});
  }

  const href = phone ? `tel:${phone.replace(/[^+\d]/g, "")}` : undefined;

  return (
    <a
      href={href}
      onClick={handleClick}
      className={`block w-full rounded-xl bg-blue-600 px-4 py-4 text-center font-semibold text-white shadow-md transition-all hover:bg-blue-700 hover:shadow-lg active:scale-[0.98] ${className}`}
    >
      {children}
    </a>
  );
}
