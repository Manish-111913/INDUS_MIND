/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { User } from '../../types';
import { useAuthStore } from '../../stores/authStore';

export function useLoginMutation() {
  const queryClient = useQueryClient();
  const loginInStore = useAuthStore((state) => state.login);

  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      return loginInStore(email, password);
    },
    onSuccess: (user) => {
      queryClient.setQueryData(['auth_user'], user);
      queryClient.invalidateQueries({ queryKey: ['navigation'] });
    },
  });
}

export function useMeQuery(enabled = true) {
  const checkSession = useAuthStore((state) => state.checkSession);

  return useQuery({
    queryKey: ['auth_user'],
    queryFn: async () => {
      const user = await checkSession();
      if (!user) throw new Error('No active session');
      return user;
    },
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
