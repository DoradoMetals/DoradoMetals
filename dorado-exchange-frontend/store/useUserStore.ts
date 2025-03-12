import { create } from "zustand";
import { authClient } from "@/lib/authClient";

interface UserState {
  user: any;
  session: any;
  userPending: boolean;
  fetchSession: () => void;
}

export const useUserStore = create<UserState>((set) => ({
  user: null,
  session: null,
  userPending: true,

  fetchSession: async () => {
    try {
      const {data, error} = await authClient.getSession();
      set({
        user: data?.user || null,
        session: data?.session || null,
        userPending: false,
      });
    } catch (error) {
      console.error("Session fetch error:", error);
      set({ userPending: false });
    }
  },
}));
