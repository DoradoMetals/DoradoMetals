"use client";

import { useQueryClient } from "@tanstack/react-query";

// THE ONE PLACE `frontend/` REACHES THE REACT-QUERY CACHE DIRECTLY, for the
// two actions that are about IDENTITY rather than any one resource: signing
// out or impersonating somebody else must drop every OTHER customer's cached
// checkout/orders/addresses, which nothing resource-shaped has a reason to do
// on its own. Everything else writes its own cache from its own mutation
// (ruling 62).
export function useQueryCache() {
  const client = useQueryClient();
  return {
    clear: () => client.clear(),
    removeAll: () => client.removeQueries(),
  };
}
