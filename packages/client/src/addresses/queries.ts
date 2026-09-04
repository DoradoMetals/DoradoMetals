"use client";

// THE ADDRESS BOOK. One read, five writes, and two questions for the places
// provider - all of them server-side now.
//
// WHAT LEFT THE BROWSER WITH THEM. `frontend/features/addresses` held the
// Google Maps JS SDK (a key shipped to every visitor, billed per keystroke),
// a 90-line parser for Google's answer, the sort, the "first address is the
// default" rule, and a card that offered Edit and Remove on an address the API
// would refuse. Every one of those is an `AddressBookEntry` field now.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AddressBookEntry, AddressWriteBody, PlaceLookup, PlaceSuggestion,
} from "@dorado/contracts";

import { apiRequest } from "../fetch";
import { keys } from "../keys";

// `subject` is an admin reading another customer's book; a non-admin sending
// one is overridden by the session, so it is safe to pass through.
type Subject = { subject?: string | null };

const forSubject = (subject?: string | null) => (subject ? { user_id: subject } : undefined);

export function useAddressBook({ subject, enabled }: Subject & { enabled?: boolean } = {}) {
  return useQuery<AddressBookEntry[]>({
    queryKey: keys.addresses.book(subject),
    enabled: enabled ?? true,
    queryFn: () =>
      apiRequest<AddressBookEntry[]>("GET", "/addresses", undefined, forSubject(subject)),
  });
}

export function useAddress(address_id: string, options: { enabled?: boolean } = {}) {
  return useQuery<AddressBookEntry>({
    queryKey: keys.addresses.one(address_id),
    enabled: (options.enabled ?? true) && !!address_id,
    queryFn: () => apiRequest<AddressBookEntry>("GET", `/addresses/${address_id}`),
  });
}

// Every write invalidates the whole book rather than patching a cache entry:
// one write can move the default off a second row, and the entries carry
// `actions` that a locally-edited copy would not recompute.
function useBookInvalidation(subject?: string | null) {
  const client = useQueryClient();
  return () => {
    client.invalidateQueries({ queryKey: keys.addresses.book(subject) });
    client.invalidateQueries({ queryKey: keys.addresses.book(null) });
  };
}

export function useCreateAddress({ subject }: Subject = {}) {
  const invalidate = useBookInvalidation(subject);
  return useMutation({
    mutationFn: (body: AddressWriteBody) =>
      apiRequest<AddressBookEntry>("POST", "/addresses", body, forSubject(subject)),
    onSettled: invalidate,
  });
}

export function useUpdateAddress({ subject }: Subject = {}) {
  const invalidate = useBookInvalidation(subject);
  return useMutation({
    mutationFn: ({ address_id, body }: { address_id: string; body: AddressWriteBody }) =>
      apiRequest<AddressBookEntry>("PATCH", `/addresses/${address_id}`, body, forSubject(subject)),
    onSettled: invalidate,
  });
}

export function useDeleteAddress({ subject }: Subject = {}) {
  const invalidate = useBookInvalidation(subject);
  return useMutation({
    mutationFn: (address_id: string) =>
      apiRequest<AddressBookEntry>("DELETE", `/addresses/${address_id}`, undefined, forSubject(subject)),
    onSettled: invalidate,
  });
}

export function useSetDefaultAddress({ subject }: Subject = {}) {
  const invalidate = useBookInvalidation(subject);
  return useMutation({
    mutationFn: (address_id: string) =>
      apiRequest<AddressBookEntry>("POST", `/addresses/${address_id}/default`, undefined, forSubject(subject)),
    onSettled: invalidate,
  });
}

// THE PROVIDER, ASKED THROUGH OUR OWN SERVER. The API refuses a query under
// three characters, so `enabled` here is a courtesy rather than the guard.
export function usePlaceSuggestions(
  q: string, session_token: string | null, options: { enabled?: boolean } = {}
) {
  const text = q.trim();
  return useQuery<PlaceSuggestion[]>({
    queryKey: keys.addresses.suggestions(text),
    enabled: (options.enabled ?? true) && text.length > 2,
    staleTime: Infinity,
    retry: false,
    queryFn: () =>
      apiRequest<PlaceSuggestion[]>("GET", "/addresses/suggestions", undefined, {
        q: text, session_token,
      }),
  });
}

// One suggestion resolved into the patch a create would send. A MUTATION
// rather than a query: it is billed, and it happens when somebody picks.
export function useLookupPlace() {
  return useMutation({
    mutationFn: ({ place_id, session_token }: { place_id: string; session_token?: string | null }) =>
      apiRequest<PlaceLookup>("GET", `/addresses/suggestions/${place_id}`, undefined, {
        session_token,
      }),
  });
}
