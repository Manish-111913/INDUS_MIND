/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import { NavigationItem } from '../../types';
import { useAuthStore } from '../../stores/authStore';

export function useNavigationQuery() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);

  return useQuery({
    queryKey: ['navigation', user?.role],
    queryFn: async () => {
      return api.get<NavigationItem[]>('/navigation');
    },
    enabled: isAuthenticated && !!user,
    staleTime: 10 * 60 * 1000, // 10 minutes (menu navigation structure is relatively static)
  });
}
