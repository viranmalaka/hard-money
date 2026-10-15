import { useSyncExternalStore, useCallback } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("local-storage-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("local-storage-change", callback);
  };
}

export function useLocalStorage<T extends string>(
  key: string,
  initialValue: T
): [T, (val: T) => void] {
  const getSnapshot = () => {
    try {
      return (localStorage.getItem(key) as T) ?? initialValue;
    } catch {
      return initialValue;
    }
  };

  const getServerSnapshot = () => initialValue;

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setValue = useCallback(
    (newVal: T) => {
      try {
        localStorage.setItem(key, newVal);
        window.dispatchEvent(new Event("local-storage-change"));
      } catch {
        // ignore storage errors
      }
    },
    [key]
  );

  return [value, setValue];
}
