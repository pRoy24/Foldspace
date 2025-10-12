import type {
  T2VCreateVideoRequest,
  T2VCreateVideoResponse,
  T2VStatusResponse
} from "../models";

export interface T2VApiClientOptions {
  baseUrl: string;
  apiKey: string;
}

export class T2VApiClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(options: T2VApiClientOptions) {
    this.baseUrl = options.baseUrl;
    this.apiKey = options.apiKey;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  private buildUrl(path: string): string {
    return new URL(path, this.baseUrl).toString();
  }

  private buildHeaders(extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      ...extra
    };
  }

  private async parseJson<T>(response: Response): Promise<T> {
    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new Error(`Failed to parse response JSON: ${(error as Error).message}`);
    }
  }

  async createVideo(request: T2VCreateVideoRequest, signal?: AbortSignal): Promise<T2VCreateVideoResponse> {
    const url = this.buildUrl("create");
    const response = await fetch(url, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(request),
      signal
    });

    if (!response.ok) {
      const errorPayload = await this.safeParseError(response);
      throw new Error(`T2V create failed (${response.status}): ${errorPayload}`);
    }

    return this.parseJson<T2VCreateVideoResponse>(response);
  }

  async getStatus(requestId: string, signal?: AbortSignal): Promise<T2VStatusResponse> {
    const url = new URL("status", this.baseUrl);
    url.searchParams.set("request_id", requestId);
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: this.buildHeaders(),
      signal
    });

    if (!response.ok) {
      const errorPayload = await this.safeParseError(response);
      throw new Error(`T2V status failed (${response.status}): ${errorPayload}`);
    }

    return this.parseJson<T2VStatusResponse>(response);
  }

  private async safeParseError(response: Response): Promise<string> {
    try {
      const payload = (await response.json()) as { message?: string };
      return payload?.message ?? response.statusText;
    } catch (_error) {
      return response.statusText;
    }
  }
}
