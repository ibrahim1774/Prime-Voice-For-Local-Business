"use client";

import { useEffect, useState } from "react";

interface CountdownProps {
  durationHours?: number;
  storageKey?: string;
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

export default function Countdown({
  durationHours = 72,
  storageKey = "call-countdown-start",
}: CountdownProps) {
  const [remaining, setRemaining] = useState<
    { d: number; h: number; m: number; s: number } | null
  >(null);

  useEffect(() => {
    const now = Date.now();
    const stored = Number(localStorage.getItem(storageKey));
    const start = stored && !Number.isNaN(stored) && stored > 0 ? stored : now;
    if (!stored) localStorage.setItem(storageKey, String(start));

    const target = start + durationHours * 60 * 60 * 1000;

    function tick() {
      const diff = Math.max(0, target - Date.now());
      const d = Math.floor(diff / (24 * 60 * 60 * 1000));
      const h = Math.floor((diff / (60 * 60 * 1000)) % 24);
      const m = Math.floor((diff / (60 * 1000)) % 60);
      const s = Math.floor((diff / 1000) % 60);
      setRemaining({ d, h, m, s });
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [durationHours, storageKey]);

  const tiles: Array<{ value: number | null; label: string }> = [
    { value: remaining?.d ?? null, label: "Days" },
    { value: remaining?.h ?? null, label: "Hours" },
    { value: remaining?.m ?? null, label: "Minutes" },
    { value: remaining?.s ?? null, label: "Seconds" },
  ];

  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2">
      {tiles.map((tile, idx) => (
        <div key={tile.label} className="flex items-center">
          <div className="flex flex-col items-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white shadow-sm sm:h-20 sm:w-20">
              <span
                className="text-3xl font-semibold tabular-nums text-[#0c1a4b] sm:text-4xl"
                suppressHydrationWarning
              >
                {tile.value === null ? "--" : pad(tile.value)}
              </span>
            </div>
            <span className="mt-1.5 text-[11px] font-medium text-[#0c1a4b]/70 sm:text-xs">
              {tile.label}
            </span>
          </div>
          {idx < tiles.length - 1 && (
            <span className="px-1 text-2xl font-semibold text-[#0c1a4b] sm:px-2 sm:text-3xl">
              :
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
