import type {
  AgentverseAgentType,
  AgentverseAgentPrefix,
  AgentverseConfigOptions
} from "../config/agentverse";
import { buildAgentverseConfig } from "../config/agentverse";
import type {
  AgentverseRegistrationRequest,
  AgentverseRegistrationResponse
} from "../models";

interface AgentverseApiRegistrationRequest {
  address: string;
  challenge: string;
  challenge_response: string;
  agent_type: AgentverseAgentType;
  endpoint?: string;
  prefix?: AgentverseAgentPrefix;
}

interface AgentverseChatMessageRequest {
  message: string;
  metadata?: Record<string, unknown>;
}

export interface AgentverseClientOptions extends AgentverseConfigOptions {}

export class AgentverseClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly defaultPrefix?: AgentverseAgentPrefix;
  private readonly defaultAgentType?: AgentverseAgentType;
  private readonly defaultEndpoint?: string;

  constructor(options: AgentverseClientOptions = {}) {
    const config = buildAgentverseConfig(options);
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.defaultPrefix = config.defaultPrefix;
    this.defaultAgentType = config.defaultAgentType;
    this.defaultEndpoint = config.defaultEndpoint;
  }

  private buildUrl(path: string): string {
    return new URL(path, this.baseUrl).toString();
  }

  private buildHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json"
    };
  }

  private toApiRequest(request: AgentverseRegistrationRequest): AgentverseApiRegistrationRequest {
    const { address, challenge, challengeResponse, endpoint, agentType, prefix } = request;
    if (!address) {
      throw new Error("Agentverse registration requires an address.");
    }
    if (!challenge) {
      throw new Error("Agentverse registration requires a challenge string.");
    }
    if (!challengeResponse) {
      throw new Error("Agentverse registration requires a challenge response.");
    }

    const resolvedAgentType = agentType ?? this.defaultAgentType;
    if (!resolvedAgentType) {
      throw new Error("Agentverse registration requires an agent type. Provide it in the request or set AGENTVERSE_DEFAULT_AGENT_TYPE.");
    }

    return {
      address,
      challenge,
      challenge_response: challengeResponse,
      agent_type: resolvedAgentType,
      endpoint: endpoint ?? this.defaultEndpoint,
      prefix: prefix ?? this.defaultPrefix
    };
  }

  private async parseJson<T>(response: Response): Promise<T> {
    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new Error(`Failed to parse Agentverse response JSON: ${(error as Error).message}`);
    }
  }

  private async parseError(response: Response): Promise<string> {
    try {
      const payload = (await response.json()) as { detail?: unknown } | { message?: string };
      if (payload && typeof payload === "object") {
        if ("message" in payload && typeof payload.message === "string") {
          return payload.message;
        }
        if ("detail" in payload) {
          return JSON.stringify(payload.detail);
        }
      }
    } catch (_error) {
      // ignore, fall back to status text
    }
    return response.statusText;
  }

  async registerAgent(
    request: AgentverseRegistrationRequest,
    signal?: AbortSignal
  ): Promise<AgentverseRegistrationResponse> {
    const payload = this.toApiRequest(request);
    const response = await fetch(this.buildUrl("/v1/agents"), {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(payload),
      signal
    });

    if (!response.ok) {
      const errorPayload = await this.parseError(response);
      throw new Error(`Agentverse register failed (${response.status}): ${errorPayload}`);
    }

    return this.parseJson<AgentverseRegistrationResponse>(response);
  }

  async sendChatMessage(
    agentId: string,
    message: string,
    metadata?: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<void> {
    if (!agentId) {
      throw new Error("Agentverse chat message requires a target agent ID.");
    }
    if (!message || message.trim().length === 0) {
      throw new Error("Agentverse chat message cannot be empty.");
    }

    const payload: AgentverseChatMessageRequest = metadata ? { message, metadata } : { message };
    const response = await fetch(this.buildUrl(`/v1/agents/${encodeURIComponent(agentId)}/messages`), {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(payload),
      signal
    });

    if (!response.ok) {
      const errorPayload = await this.parseError(response);
      throw new Error(`Agentverse chat message failed (${response.status}): ${errorPayload}`);
    }
  }
}
