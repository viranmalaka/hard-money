export async function cleanupLegacyDexieDatabases(): Promise<void> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return;
  try {
    const dbs = await window.indexedDB.databases?.();
    if (Array.isArray(dbs)) {
      for (const dbInfo of dbs) {
        if (dbInfo.name && (dbInfo.name.startsWith("hardmoney_") || dbInfo.name.startsWith("hardmoney-"))) {
          window.indexedDB.deleteDatabase(dbInfo.name);
        }
      }
    }
    // Also remove any stale React Query persisted cache
    localStorage.removeItem("HARDMONEY_REACT_QUERY_CACHE");
  } catch (err) {
    console.warn("Legacy database cleanup check skipped:", err);
  }
}
