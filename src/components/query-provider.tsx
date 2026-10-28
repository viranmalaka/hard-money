"use client";

import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider, Persister } from "@tanstack/react-query-persist-client";
import { useState, useMemo } from "react";
import { isRetryableApiError } from "@/lib/api/client";
import { get, set, del } from "idb-keyval";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days for offline persistence
        refetchOnWindowFocus: false,
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

export function createIdbPersister(idbKey = "HARDMONEY_REACT_QUERY_CACHE"): Persister {
  return {
    persistClient: async (client) => {
      try {
        await set(idbKey, client);
      } catch (err) {
        console.warn("Failed to persist query client to IndexedDB:", err);
      }
    },
    restoreClient: async () => {
      try {
        return await get(idbKey);
      } catch (err) {
        console.warn("Failed to restore query client from IndexedDB:", err);
        return undefined;
      }
    },
    removeClient: async () => {
      try {
        await del(idbKey);
      } catch (err) {
        console.warn("Failed to remove query client from IndexedDB:", err);
      }
    },
  };
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => getQueryClient());
  const persister = useMemo(() => createIdbPersister(), []);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            return query.state.status === "success";
          },
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

