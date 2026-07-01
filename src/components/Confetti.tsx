import { useEffect, useState } from "react";

const COLORS = ["#E8A33D", "#C1432E", "#5C7A5C", "#2B2622"];

// ponytail: CSS-animated divs, no confetti library.
export function Confetti({ fire }: { fire: number }) {
  const [pieces, setPieces] = useState<number[]>([]);
  useEffect(() => {
    if (!fire) return;
    setPieces(Array.from({ length: 60 }, (_, i) => i));
    const t = setTimeout(() => setPieces([]), 2600);
    return () => clearTimeout(t);
  }, [fire]);

  return (
    <>
      {pieces.map((i) => (
        <span
          key={`${fire}-${i}`}
          className="confetti-piece"
          style={{
            left: `${Math.random() * 100}vw`,
            background: COLORS[i % COLORS.length],
            animationDuration: `${1.6 + Math.random() * 1}s`,
            animationDelay: `${Math.random() * 0.4}s`,
          }}
        />
      ))}
    </>
  );
}
