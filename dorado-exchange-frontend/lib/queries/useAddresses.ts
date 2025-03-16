import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/utils/axiosInstance";
import { Address } from "@/types/address";
import { UUID } from "crypto";

export const useAddress = (user_id: UUID) => {
  return useQuery<Address[]>({
    queryKey: ["address"],
    queryFn: async () => {
      const data = await apiRequest<Address[]>("GET", "/addresses/get_addresses", undefined, { user_id });
      return data;
    },
  });
};

export const useUpdateAddress = (user_id: UUID) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (address: Address) => {
      return await apiRequest("POST", "/addresses/create_and_update_address", {
        user_id,
        address,
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["address"], refetchType: "active" });
    },
  });
};

export const useDeleteAddress = (user_id: UUID) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (address: Address) => {
      return await apiRequest("DELETE", "/addresses/delete_address", {
        user_id,
        address,
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["address"], refetchType: "active" });
    },
  });
};

export const useSetDefaultAddress = (user_id: UUID) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (address: Address) => {
      return await apiRequest("POST", "/addresses/set_default_address", {
        user_id,
        address,
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["address"], refetchType: "active" });
    },
  });
}