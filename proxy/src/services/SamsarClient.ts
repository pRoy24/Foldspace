import type { CreateJobPayload, SamsarClientOptions } from "../types";

export interface SamsarSubmissionResult {
  statusCode: number;
  requestId?: string;
  responseBody: Record<string, unknown>;
  headers: Record<string, string>;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function parseJson(payload: string): Record<string, unknown> {
  if (!payload) {
    return {};
  }
  try {
    return JSON.parse(payload) as Record<string, unknown>;
  } catch (error) {
    return { raw: payload, parseError: (error as Error).message };
  }
}

export class SamsarClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;

  constructor(options: SamsarClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  isEnabled(): boolean {
    return Boolean(this.apiKey);
  }

  async submitCreate(payload: CreateJobPayload): Promise<SamsarSubmissionResult> {
    if (!this.apiKey) {
      throw new Error("SamsarOne API key is missing. Set SAMSAR_API_KEY or disable auto submission.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(new URL("create", this.baseUrl).toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": this.apiKey,
          "User-Agent": "Foldspace-Proxy/0.1"
        },
        body: JSON.stringify(payload ?? {}),
        signal: controller.signal
      });

      const text = await response.text();
      const body = parseJson(text);
      if (!response.ok) {
        throw new Error(`SamsarOne responded with ${response.status}: ${JSON.stringify(body)}`);
      }

      const headers = Object.fromEntries(response.headers.entries());
      const requestId = typeof body.request_id === "string" ? body.request_id : undefined;
      return {
        statusCode: response.status,
        requestId,
        responseBody: body,
        headers
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
