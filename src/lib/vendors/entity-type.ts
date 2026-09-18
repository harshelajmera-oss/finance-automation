import type { EntityType } from "@/lib/supabase/types";

const FOURTH_CHAR_MAP: Record<string, EntityType> = {
  P: "Individual",
  F: "Firm or LLP",
  C: "Company",
  H: "HUF",
};

/** PAN's 4th character encodes the holder's entity type — a fixed, documented fact. */
export function entityTypeFromPan(pan: string | null): EntityType | null {
  if (!pan || pan.length < 4) return null;
  return FOURTH_CHAR_MAP[pan[3].toUpperCase()] ?? null;
}
