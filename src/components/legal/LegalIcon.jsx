const PATHS = {
  scale: <><path d="M12 3v18M5 7h14M5 7l-3 6h6L5 7Zm14 0-3 6h6l-3-6ZM8 21h8" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  person: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  wallet: <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M3 9h18M16 14h.01" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" /></>,
  check: <><path d="m5 12 4 4L19 6" /></>,
  alert: <><path d="m12 3 9 18H3l9-18Z" /><path d="M12 9v4M12 17h.01" /></>,
  refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>,
  pencil: <><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  chevronRight: <><path d="m9 6 6 6-6 6" /></>,
  chevronLeft: <><path d="m15 6-6 6 6 6" /></>,
  cash: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 9v.01M18 15v.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  users: <>
    <circle cx="9" cy="8" r="3.4" />
    <path d="M3 20a6 6 0 0 1 12 0" />
    <path d="M16.4 5.4a3.4 3.4 0 0 1 0 5.9M17.2 14.8A6 6 0 0 1 21 20" />
  </>,
  userPlus: <>
    <circle cx="10" cy="8" r="3.6" />
    <path d="M3.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M18.5 6.5v5M16 9h5" />
  </>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  pin: <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  building: <><path d="M4 21V5l8-2v18M12 9h8v12M3 21h18M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2" /></>,
  more: <><path d="M6 12h.01M12 12h.01M18 12h.01" strokeWidth="3" /></>,
  certificate: <>
    <rect x="3.5" y="3" width="13" height="13" rx="2" />
    <path d="M7 7.5h6M7 11h4" />
    <circle cx="16.5" cy="16.5" r="3.2" />
    <path d="m14.6 19.1-.9 3 2.8-1.4 2.8 1.4-.9-3" />
  </>,
  coins: <>
    <ellipse cx="8.5" cy="6.5" rx="5" ry="2.4" />
    <path d="M3.5 6.5v4.3c0 1.3 2.2 2.4 5 2.4" />
    <ellipse cx="15.5" cy="14.2" rx="5" ry="2.4" />
    <path d="M10.5 14.2v4.3c0 1.3 2.2 2.4 5 2.4s5-1.1 5-2.4v-4.3" />
  </>,
  trend: <><path d="M3 17.5 9.5 11l4 4L21 7.5" /><path d="M15 7.5h6v6" /></>,
  sheet: <>
    <rect x="3.5" y="3" width="17" height="18" rx="2" />
    <path d="M9 3v18M3.5 9.5h17M3.5 15h17" />
  </>,
  upload: <>
    <path d="M12 15.5V4M8.5 7.5 12 4l3.5 3.5" />
    <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
  </>,
  download: <>
    <path d="M12 4v11.5M8.5 12 12 15.5 15.5 12" />
    <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
  </>,
  bell: <>
    <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
    <path d="M13.7 19a2 2 0 0 1-3.4 0" />
  </>,
  phone: <><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" /></>,
  close: <><path d="M6 6l12 12M18 6 6 18" /></>,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
  arrowLeft: <><path d="M19 12H5M11 6l-6 6 6 6" /></>,
  sparkle: <><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /></>,
  gavel: <>
    <path d="m3.5 20.5 6.2-6.2M2.5 22h8" />
    <path d="m10.8 13 3.4-3.4" />
    <path d="m12.6 5.9 5.5 5.5-2.3 2.3-5.5-5.5z" />
    <path d="m16.4 2.1 5.5 5.5-2 2-5.5-5.5z" />
  </>,
  chart: <><path d="M4 20h16M7 16v-5M12 16V7M17 16v-8" /></>,
  printer: <><path d="M7 8V3h10v5M7 17H4v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7h-3" /><rect x="7" y="14" width="10" height="7" rx="1" /></>,
};

export default function LegalIcon({ name, size = 18 }) {
  return (
    <svg
      className="legal-appointment-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
