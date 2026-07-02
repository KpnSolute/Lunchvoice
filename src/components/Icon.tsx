// Single source for all iconography — custom line icons, no emoji anywhere.
// 24x24 grid, 1.75 stroke, round caps. Some (coin, flame, star) support a filled variant.

export type IconName =
  | "home" | "star" | "star-fill" | "fork" | "menu" | "survey" | "voice"
  | "store" | "orders" | "roster" | "dashboard" | "logout" | "check"
  | "chevron" | "arrow" | "coin" | "flame" | "bulb" | "plus" | "lock" | "sparkle";

const paths: Record<IconName, React.ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5M5.5 9v11h13V9" />,
  star: <path d="m12 3.6 2.55 5.5 5.95.7-4.4 4.1 1.2 5.9L12 16.9l-5.3 2.9 1.2-5.9-4.4-4.1 5.95-.7L12 3.6z" />,
  "star-fill": (
    <path
      d="m12 3.6 2.55 5.5 5.95.7-4.4 4.1 1.2 5.9L12 16.9l-5.3 2.9 1.2-5.9-4.4-4.1 5.95-.7L12 3.6z"
      fill="currentColor"
      stroke="currentColor"
    />
  ),
  fork: <path d="M7 3v6a2 2 0 0 0 4 0V3M9 11v10M17 3c-1.7 0-3 2-3 5s1.3 4 3 4m0 0v9m0-9V3" />,
  menu: <path d="M4 6h16M4 12h10M4 18h13" />,
  survey: <path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3zM9 8h6M9 12h4" />,
  voice: <path d="M5 20v-7m4.5 7V7M14 20V4m4.5 16v-9" />,
  store: <path d="M4 8h16l-1 12H5L4 8zM8 8V6.5a4 4 0 0 1 8 0V8" />,
  orders: <path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21V3zM9.5 8h5M9.5 12h5" />,
  roster: <path d="M9 11a3.4 3.4 0 1 0 0-6.8A3.4 3.4 0 0 0 9 11zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16.5 4.6a3.4 3.4 0 0 1 0 6.5M18 14.2c1.9.7 3 2.8 3 5.6" />,
  dashboard: <path d="M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z" />,
  logout: <path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M9 8l-4 4 4 4M5 12h11" />,
  check: <path d="M4 12.5 9 17.5 20 6.5" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  coin: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v10M9.5 9.2c0-1 1.1-1.7 2.5-1.7s2.5.7 2.5 1.7-1.1 1.5-2.5 1.5-2.5.6-2.5 1.6 1.1 1.7 2.5 1.7 2.5-.7 2.5-1.7" />,
  flame: <path d="M12 3s5 4 5 9a5 5 0 0 1-10 0c0-1.6.8-3 1.7-4 .2 1 .9 1.8 1.8 1.8 1.3 0 1.7-1.4 1.5-3-.2-1.6-1-3.8-1-3.8z" />,
  bulb: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.6 1 1.2 1 2h6c0-.8.3-1.4 1-2A6 6 0 0 0 12 3z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  lock: <path d="M6 10h12v10H6zM8 10V7a4 4 0 0 1 8 0v3" />,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />,
};

export function Icon({
  name,
  size = 22,
  className,
  strokeWidth = 1.75,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
