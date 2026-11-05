"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { isRetryableApiError } from "@/lib/api/client";
import {
  restorePersistedQueryCache,
  setupQueryCachePersistence,
} from "@/lib/offline/query-persister";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000, // 15 seconds default fresh time
        gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days in-memory retention for offline usage
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: (failureCount, error) => failureCount < 2 && isRetryableApiError(error),
      },
      mutations: {
        retry: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") {
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => getQueryClient());

  useEffect(() => {
    const getActiveUserId = () => {
      try {
        return localStorage.getItem("hardmoney_active_user");
      } catch {
        return null;
      }
    };

    // 1. Immediately hydrate query cache from IndexedDB
    void restorePersistedQueryCache(queryClient, getActiveUserId());

    // 2. Setup auto-persistence subscription on query updates
    const cleanupPersistence = setupQueryCachePersistence(
      queryClient,
      getActiveUserId
    );

    return () => {
      cleanupPersistence();
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
