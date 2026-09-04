"use client";

import { useQueryClient } from "@tanstack/react-query";

export function useQueryCache() {
  const client = useQueryClient();
  return {
    clear: () => client.clear(),
    removeAll: () => client.removeQueries(),
  };
}
