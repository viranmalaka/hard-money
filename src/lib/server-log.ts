// Captured server logs for E2E testing (e.g. verifying raw SMS is never logged)

const globalLogs = globalThis as unknown as {
  __capturedServerLogs?: string[];
  __installedConsoleInterceptors?: boolean;
};

if (!globalLogs.__capturedServerLogs) {
  globalLogs.__capturedServerLogs = [];
}

export function getCapturedLogs(): string[] {
  return globalLogs.__capturedServerLogs || [];
}

export function clearCapturedLogs(): void {
  if (globalLogs.__capturedServerLogs) {
    globalLogs.__capturedServerLogs.length = 0;
  }
}

export function recordServerLog(message: string): void {
  if (!globalLogs.__capturedServerLogs) {
    globalLogs.__capturedServerLogs = [];
  }
  globalLogs.__capturedServerLogs.push(message);
}

// Intercept console.log, console.info, console.warn, console.error to capture everything logged
if (!globalLogs.__installedConsoleInterceptors && typeof window === "undefined") {
  globalLogs.__installedConsoleInterceptors = true;
  const originalLog = console.log;
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = (...args: unknown[]) => {
    try {
      recordServerLog(args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" "));
    } catch {
      // ignore
    }
    originalLog(...args);
  };

  console.info = (...args: unknown[]) => {
    try {
      recordServerLog(args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" "));
    } catch {
      // ignore
    }
    originalInfo(...args);
  };

  console.warn = (...args: unknown[]) => {
    try {
      recordServerLog(args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" "));
    } catch {
      // ignore
    }
    originalWarn(...args);
  };

  console.error = (...args: unknown[]) => {
    try {
      recordServerLog(args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" "));
    } catch {
      // ignore
    }
    originalError(...args);
  };
}
