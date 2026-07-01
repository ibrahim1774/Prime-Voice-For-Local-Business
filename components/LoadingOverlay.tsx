"use client";

import { useState, useEffect } from "react";

interface LoadingOverlayProps {
  isVisible: boolean;
  // When true, adds a "Reading your website..." step to the copy so the
  // messaging matches the extra scrape work happening behind the scenes.
  hasWebsite?: boolean;
}

const BASE_MESSAGES = [
  "Analyzing your business...",
  "Training your AI receptionist...",
  "Almost ready...",
];

export default function LoadingOverlay({ isVisible, hasWebsite = false }: LoadingOverlayProps) {
  const [progress, setProgress] = useState(0);

  const messages = hasWebsite
    ? [
        "Analyzing your business...",
        "Reading your website...",
        "Training your AI receptionist...",
        "Almost ready...",
      ]
    : BASE_MESSAGES;

  useEffect(() => {
    if (!isVisible) {
      setProgress(0);
      return;
    }

    // Ease toward ~95% so the bar always feels alive but never claims
    // completion before the demo is actually ready — the overlay unmounts
    // the moment generation succeeds (or errors out).
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 95) return 95;
        const step = Math.max(0.4, (95 - p) * 0.045);
        return Math.min(95, p + step);
      });
    }, 90);

    return () => clearInterval(interval);
  }, [isVisible]);

  if (!isVisible) return null;

  const pct = Math.round(progress);
  const messageIndex = Math.min(
    messages.length - 1,
    Math.floor((progress / 100) * messages.length)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="w-full max-w-xs px-6 text-center">
        {/* Gold spinning ring */}
        <div className="mx-auto mb-8 h-16 w-16 rounded-full border-4 border-gold/20 border-t-gold animate-spin" />

        {/* Animated message */}
        <p key={messageIndex} className="text-xl font-sans text-gold animate-fade-in-up">
          {messages[messageIndex]}
        </p>

        {/* Progress bar + live percentage */}
        <div className="mt-6">
          <div className="h-2 w-full overflow-hidden rounded-full bg-gold/15">
            <div
              className="h-full rounded-full bg-gold transition-[width] duration-150 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 font-sans text-sm font-semibold text-gold tabular-nums">
            {pct}%
          </p>
        </div>

        <p className="mx-auto mt-8 max-w-xs font-sans text-xs text-subtle leading-relaxed">
          Please do not move away from this page or your custom demo won&apos;t generate.
        </p>
      </div>
    </div>
  );
}
