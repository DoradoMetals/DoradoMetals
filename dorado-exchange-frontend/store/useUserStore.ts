import { create } from "zustand";
import { authClient } from "@/lib/authClient";

interface UserState {
  user: any;
  session: any;
  userPending: boolean;
  fetchSession: () => Promise<void>;
  setUser: (user: any, session: any) => void;
  clearSession: () => void;
}

export const useUserStore = create<UserState>()((set) => ({
  user: null,
  session: null,
  userPending: true,

  fetchSession: async () => {
    try {
      const { data } = await authClient.getSession();
      set({
        user: data?.user || null,
        session: data?.session || null,
        userPending: false,
      });
    } catch (error) {
      set({ userPending: false });
    }
  },

  setUser: (user, session) => {
    set({ user, session });
  },

  clearSession: () => {
    set({ user: null, session: null, userPending: false });
  },
}));
