import { useEffect, useState } from "react";

// Themed accent/pop sparks — no emoji, no library. ponytail: CSS-animated divs.
const COLORS = ["var(--accent)", "var(--pop)", "var(--ink)"];

export function Confetti({ fire }: { fire: number }) {
  const [pieces, setPieces] = useState<number[]>([]);
  useEffect(() => {
    if (!fire) return;
    setPieces(Array.from({ length: 48 }, (_, i) => i));
    const t = setTimeout(() => setPieces([]), 2400);
    return () => clearTimeout(t);
  }, [fire]);

  return (
    <>
      {pieces.map((i) => (
        <span
          key={`${fire}-${i}`}
          className="spark"
          style={{
            left: `${Math.random() * 100}vw`,
            top: `${-5 - Math.random() * 15}px`,
            background: COLORS[i % COLORS.length],
            animationDuration: `${1.5 + Math.random() * 1}s`,
            animationDelay: `${Math.random() * 0.35}s`,
          }}
        />
      ))}
    </>
  );
}
