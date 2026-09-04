"use client";

// THE LIVE METAL QUOTES. Public, refetched on the same ten-second rhythm the
// quote surface uses, so a ticker and a price never disagree by more than one
// tick.
//
// `direction` is the SERVER'S answer to which way the metal moved today. Every
// ticker used to compute `(dollar_change ?? 0) >= 0` for itself, which painted
// a flat day green.
import { useQuery } from "@tanstack/react-query";
import type { SpotTicker } from "@dorado/contracts";

import { apiRequest } from "../fetch";
import { keys } from "../keys";

const TICK = 10_000;

export function useSpotPrices(enabled = true) {
  return useQuery<SpotTicker[]>({
    queryKey: keys.spots.all(),
    queryFn: () => apiRequest<SpotTicker[]>("GET", "/spots"),
    enabled,
    refetchInterval: TICK,
  });
}
