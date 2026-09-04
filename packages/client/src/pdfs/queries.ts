"use client";

// THE FOUR DOCUMENT ENDPOINTS. Every one takes `{ order_id }` and answers a
// blob - the server serves the STORED document when one exists and otherwise
// renders live (api/features/media/pdfs/order-inputs.ts). Filenames and
// saving the blob to disk are the caller's UI concern, not this package's.
import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { apiRequestBlob } from "../fetch";

export function useGeneratePackingList(): UseMutationResult<Blob, Error, { order_id: string }> {
  return useMutation({
    mutationFn: ({ order_id }) =>
      apiRequestBlob("POST", "/pdf/generate_packing_list", { order_id }),
  });
}

export function useGenerateReturnPackingList(): UseMutationResult<Blob, Error, { order_id: string }> {
  return useMutation({
    mutationFn: ({ order_id }) =>
      apiRequestBlob("POST", "/pdf/generate_return_packing_list", { order_id }),
  });
}

export function useGenerateInvoice(): UseMutationResult<Blob, Error, { order_id: string }> {
  return useMutation({
    mutationFn: ({ order_id }) =>
      apiRequestBlob("POST", "/pdf/generate_invoice", { order_id }),
  });
}

export function useGenerateSalesOrderInvoice(): UseMutationResult<Blob, Error, { order_id: string }> {
  return useMutation({
    mutationFn: ({ order_id }) =>
      apiRequestBlob("POST", "/pdf/generate_sales_order_invoice", { order_id }),
  });
}
