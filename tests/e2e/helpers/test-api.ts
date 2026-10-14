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
}
