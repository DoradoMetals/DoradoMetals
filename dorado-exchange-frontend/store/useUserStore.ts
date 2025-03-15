import { create } from "zustand";
import { authClient } from "@/lib/authClient";

interface UserState {
  user: any;
  session: any;
  userPending: boolean;
  fetchSession: () => void;
  setUser: (userData: any) => void;  // ✅ Add this
}

export const useUserStore = create<UserState>((set) => ({
  user: null,
  session: null,
  userPending: true,

  fetchSession: async () => {
    console.log("Fetching session...");
    try {
      const { data, error } = await authClient.getSession();
      console.log("Fetched session data:", data);

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

  setUser: (userData) => {
    console.log("Setting user in Zustand:", userData);  // ✅ Debugging
    set({ user: userData, userPending: false });
  },
}));
