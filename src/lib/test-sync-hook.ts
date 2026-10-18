// In-memory test hooks for failing mutations during E2E tests
const failingMutationEntityIds = new Set<string>();
let failAllMutations = false;

export function addFailingMutationEntityId(id: string) {
  failingMutationEntityIds.add(id);
}

export function resetTestSyncHooks() {
  failingMutationEntityIds.clear();
  failAllMutations = false;
}

export function shouldFailMutation(entityId: string, name?: string): boolean {
  if (process.env.E2E_MODE !== "1") return false;
  if (failAllMutations) return true;
  if (failingMutationEntityIds.has(entityId)) return true;
  // If name exceeds 50 chars or contains 'INVALID_FORCE_FAIL'
  if (name && (name.length > 50 || name.includes("INVALID_FORCE_FAIL"))) return true;
  return false;
}
