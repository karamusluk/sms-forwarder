import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Profile } from '../lib/profile';

type ProfileState = {
  profile: Profile | null;
  lastForwardedAt: number | null;
  lastError: string | null;
  setProfile: (profile: Profile | null) => void;
  setForwardResult: (result: { forwardedAt?: number; error: string | null }) => void;
};

export const useProfileStore = create<ProfileState>()(
  persist(
    set => ({
      profile: null,
      lastForwardedAt: null,
      lastError: null,
      setProfile: profile => set({ profile }),
      setForwardResult: result =>
        set(state => ({
          lastForwardedAt: result.forwardedAt ?? state.lastForwardedAt,
          lastError: result.error,
        })),
    }),
    {
      name: 'forward-status',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: state => ({
        lastForwardedAt: state.lastForwardedAt,
        lastError: state.lastError,
      }),
    },
  ),
);
