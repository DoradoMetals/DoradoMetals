import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/utils/axiosInstance";
import { Address, AddressForm } from "@/types/address";
import { UUID } from "crypto";

// Fetch Single Address
export const useAddress = (user_id: UUID) => {
  return useQuery<Address | null>({
    queryKey: ["address", user_id], // Singular key to reflect single address
    queryFn: async () => {
      if (!user_id) return null;
      const data = await apiRequest<Address[]>("GET", "/users/get_addresses", undefined, { user_id });

      // Ensure we return only a single object
      return data?.[0] || null;
    },
    enabled: !!user_id,
  });
};

// Update or Create Address
export const useUpdateAddress = (user_id: UUID) => {
  return useMutation({
    mutationFn: async (address: AddressForm) => {
      return await apiRequest("POST", "/users/create_and_update_address", {
        user_id,
        address,
      });
    },
  });
};