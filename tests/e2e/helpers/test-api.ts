import { APIRequestContext } from "@playwright/test";

export class TestApiClient {
  constructor(private request: APIRequestContext, private baseURL = "http://localhost:3000") {}

  async reset() {
    return this.request.post(`${this.baseURL}/api/test/reset`);
  }

  async setClock(now: string | Date) {
    const nowStr = typeof now === "string" ? now : now.toISOString();
    return this.request.post(`${this.baseURL}/api/test/clock`, {
      data: { now: nowStr },
    });
  }

  async resetClock() {
    return this.request.post(`${this.baseURL}/api/test/clock`, {
      data: {},
    });
  }

  async seed(fixture: unknown) {
    return this.request.post(`${this.baseURL}/api/test/seed`, {
      data: fixture,
    });
  }

  async tick() {
    return this.request.post(`${this.baseURL}/api/test/tick`);
  }

  async queueGemini(response: unknown) {
    return this.request.post(`${this.baseURL}/api/test/gemini`, {
      data: response,
    });
  }

  async getSnapshot() {
    const res = await this.request.get(`${this.baseURL}/api/test/snapshot`);
    return res.json();
  }

  async getLogs(): Promise<{ logs: string[] }> {
    const res = await this.request.get(`${this.baseURL}/api/test/logs`);
    return res.json();
  }

  async pauseWorker(paused = true) {
    return this.request.post(`${this.baseURL}/api/test/pause-worker`, {
      data: { paused },
    });
  }

  async processSms() {
    return this.request.post(`${this.baseURL}/api/test/process-sms`);
  }

  async clearLogs() {
    return this.request.post(`${this.baseURL}/api/test/clear-logs`);
  }

  async getGeminiRequests(): Promise<{ requests: Array<{ sender: string; rawMessage: string; maskedMessage: string; model: string; timestamp: string }> }> {
    const res = await this.request.get(`${this.baseURL}/api/test/gemini-requests`);
    return res.json();
  }
}
