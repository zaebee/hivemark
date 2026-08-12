import type { TrackRecord } from "../types.js";

export interface ShieldsEndpoint {
  schemaVersion: 1;
  label: string;
  message: string;
  color: string;
}

/**
 * Render a track record as a shields.io endpoint payload.
 *
 * The rate is confirmed over *resolved* claims. Dividing by all claims would
 * conflate "we do not know" with "it was wrong", letting an unjudged corpus
 * masquerade as a poor one.
 */
export function shieldsEndpoint(track: TrackRecord): ShieldsEndpoint {
  const { confirmed, refuted, uncertain } = track.skeptic;
  const resolved = confirmed + refuted + uncertain;
  const label = `${track.genome.provider} · ${track.genome.context_mode}`;

  if (resolved === 0) {
    return { schemaVersion: 1, label, message: "no data", color: "lightgrey" };
  }

  const rate = Math.round((confirmed / resolved) * 100);
  return {
    schemaVersion: 1,
    label,
    message: `${rate}% confirmed (${resolved} resolved)`,
    color: rate >= 80 ? "brightgreen" : rate >= 60 ? "yellow" : "orange",
  };
}
