"use client";

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
