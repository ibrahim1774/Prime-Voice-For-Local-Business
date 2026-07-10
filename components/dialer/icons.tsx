// Dialer icon set — one 16px stroke grid, drawn to match the "Switchboard"
// skin. Inline SVG (no dependency, no emoji): consistent weight, aligns to
// text, inherits currentColor.

import type { CSSProperties } from "react";

type IconName =
  | "phone"
  | "headset"
  | "tape"
  | "chat"
  | "check"
  | "x"
  | "trash"
  | "play"
  | "save"
  | "user"
  | "bot"
  | "upload"
  | "hangup"
  | "edit";

const PATHS: Record<IconName, React.ReactNode> = {
  phone: (
    <path d="M3.2 2.5h2.6l1.3 3.1-1.6 1.3a9.6 9.6 0 0 0 3.6 3.6l1.3-1.6 3.1 1.3v2.6c0 .6-.5 1.1-1.1 1-6.2-.6-9.9-4.3-10.3-10.2 0-.6.5-1.1 1.1-1.1Z" />
  ),
  hangup: (
    <path d="M1.8 9.8c3.6-3.4 8.8-3.4 12.4 0l-1.6 1.9-2.6-1v-1.6a7.6 7.6 0 0 0-4 0v1.6l-2.6 1-1.6-1.9Z" />
  ),
  headset: (
    <>
      <path d="M2.5 9V8a5.5 5.5 0 0 1 11 0v1" />
      <rect x="1.8" y="9" width="2.6" height="4" rx="1" />
      <rect x="11.6" y="9" width="2.6" height="4" rx="1" />
      <path d="M13 13v.6a1.6 1.6 0 0 1-1.6 1.6H9" />
    </>
  ),
  tape: (
    <>
      <rect x="1.5" y="4" width="13" height="8.5" rx="1.4" />
      <circle cx="5.2" cy="8" r="1.5" />
      <circle cx="10.8" cy="8" r="1.5" />
      <path d="M5.2 10.8h5.6" />
    </>
  ),
  chat: (
    <path d="M2 3.8C2 3 2.6 2.4 3.4 2.4h9.2c.8 0 1.4.6 1.4 1.4v6.4c0 .8-.6 1.4-1.4 1.4H6l-3 2.6.1-2.6h-.7A1.4 1.4 0 0 1 2 10.2V3.8Z" />
  ),
  check: <path d="M2.8 8.6 6.4 12l6.8-8" />,
  x: <path d="M3.5 3.5 12.5 12.5M12.5 3.5 3.5 12.5" />,
  trash: (
    <>
      <path d="M2.5 4.4h11M6.2 2.2h3.6M4 4.4l.7 8.4c.05.7.6 1.2 1.3 1.2h4c.7 0 1.25-.5 1.3-1.2l.7-8.4" />
      <path d="M6.5 7v4M9.5 7v4" />
    </>
  ),
  play: <path d="M4.6 3.2 12.4 8l-7.8 4.8V3.2Z" />,
  save: (
    <>
      <path d="M3 2.5h8.2L13 4.3V12a1.4 1.4 0 0 1-1.4 1.4H4.4A1.4 1.4 0 0 1 3 12V3.9A1.4 1.4 0 0 1 3 2.5Z" />
      <path d="M5.2 2.5v3.4h5.2V2.5M5.2 13.4V9.6h5.6v3.8" />
    </>
  ),
  user: (
    <>
      <circle cx="8" cy="5.4" r="2.7" />
      <path d="M2.8 13.6a5.5 5.5 0 0 1 10.4 0" />
    </>
  ),
  bot: (
    <>
      <rect x="2.8" y="5" width="10.4" height="7.4" rx="1.6" />
      <path d="M8 5V2.6M5.9 15v-2.6M10.1 15v-2.6" />
      <circle cx="5.9" cy="8.4" r="0.4" fill="currentColor" />
      <circle cx="10.1" cy="8.4" r="0.4" fill="currentColor" />
    </>
  ),
  upload: (
    <>
      <path d="M8 10.6V2.8M4.8 5.8 8 2.6l3.2 3.2" />
      <path d="M2.6 10.8v1.6a1.4 1.4 0 0 0 1.4 1.4h8a1.4 1.4 0 0 0 1.4-1.4v-1.6" />
    </>
  ),
  edit: (
    <>
      <path d="m9.6 3.4 3 3L6 13l-3.4.4L3 10l6.6-6.6Z" />
      <path d="m8.4 4.6 3 3" />
    </>
  ),
};

export function Icon({
  name,
  size = 14,
  style,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0, verticalAlign: "-0.14em", ...style }}
    >
      {PATHS[name]}
    </svg>
  );
}
