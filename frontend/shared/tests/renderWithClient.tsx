// The one QueryClient wrapper every component render test needs: a fresh
// client per render so no cache leaks between tests, retries off on both
// queries and mutations so a staged failure fails now instead of after a
// backoff. Nine test files each carried their own copy of this before it
// was lifted here; the two variants differed only in spelling out
// `mutations: { retry: false }`, which is the default anyway.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";

export const renderWithClient = (ui: ReactElement) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};
