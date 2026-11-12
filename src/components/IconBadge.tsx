import { Icon } from "./Icon";
import { BADGES, type BadgeKey } from "../config/badges";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn/tooltip";

/** One badge: a coloured icon with a tooltip (label and meaning). Focusable, so the tooltip works from a keyboard. */
export function IconBadge({ kind, size = 20 }: { kind: BadgeKey; size?: number }) {
  const b = BADGES[kind];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="lv-ibadge" data-tone={b.tone} role="img" aria-label={`${b.label}. ${b.meaning}`} tabIndex={0} data-badge={kind}
          style={{ width: size, height: size }}>
          <Icon name={b.icon} size={Math.round(size * 0.72)} />
        </span>
      </TooltipTrigger>
      <TooltipContent><span className="lv-ibadge-tip"><strong>{b.label}</strong><span>{b.meaning}</span></span></TooltipContent>
    </Tooltip>
  );
}

export function BadgeRow({ kinds, size }: { kinds: BadgeKey[]; size?: number }) {
  if (kinds.length === 0) return null;
  return <span className="lv-ibadges" data-testid="badges">{kinds.map((k) => <IconBadge key={k} kind={k} size={size} />)}</span>;
}
