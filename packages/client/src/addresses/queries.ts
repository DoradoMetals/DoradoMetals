"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AddressBookEntry, AddressWriteBody, PlaceLookup, PlaceSuggestion,
} from "@dorado/contracts";

import { apiRequest } from "../fetch";
import { keys } from "../keys";

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

export function useLookupPlace() {
  return useMutation({
    mutationFn: ({ place_id, session_token }: { place_id: string; session_token?: string | null }) =>
      apiRequest<PlaceLookup>("GET", `/addresses/suggestions/${place_id}`, undefined, {
        session_token,
      }),
  });
}
