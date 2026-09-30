interface GhostChipProps {
  risk?: number;
  reasons: string[];
  verdict?: "real" | "ghost";
  onStillHiring: () => void;
}

const GHOST_TAG_THRESHOLD = 0.6;

/**
 * Advisory staleness tag. The copy never claims a listing is fake: the
 * server-side estimator has no ground truth for employer intent.
 */
export function GhostChip({
  risk,
  reasons,
  verdict,
  onStillHiring,
}: GhostChipProps) {
  if (verdict === "real") {
    return (
      <span
        className="text-xs text-emerald-700"
        data-testid="ghost-chip-pinned"
      >
        you marked this as still hiring
      </span>
    );
  }

  if (typeof risk !== "number" || risk < GHOST_TAG_THRESHOLD) {
    return null;
  }

  const ageReason = reasons.find((r) => /listed \d+ days/.test(r));

  return (
    <span className="inline-flex items-center gap-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
      <span title={reasons.join(" · ")}>
        {ageReason
          ? `open ${ageReason.replace("listed ", "")}`
          : "possibly stale"}
      </span>
      <button type="button" className="underline" onClick={onStillHiring}>
        still hiring?
      </button>
    </span>
  );
}
