import { env } from "./env";

const DEFAULT_AGENTVERSE_BASE_URL = "https://agentverse.ai/";

const AGENT_TYPE_VALUES = ["mailbox", "proxy", "custom"] as const;
const PREFIX_VALUES = ["agent", "test-agent"] as const;

export type AgentverseAgentType = (typeof AGENT_TYPE_VALUES)[number];
export type AgentverseAgentPrefix = (typeof PREFIX_VALUES)[number];

export interface AgentverseConfig {
  baseUrl: string;
  apiKey: string;
  defaultPrefix?: AgentverseAgentPrefix;
  defaultAgentType?: AgentverseAgentType;
  defaultEndpoint?: string;
}

export interface AgentverseConfigOptions {
  baseUrl?: string;
  apiKey?: string;
  defaultPrefix?: AgentverseAgentPrefix | string;
  defaultAgentType?: AgentverseAgentType | string;
  defaultEndpoint?: string;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function parseAgentType(value?: string): AgentverseAgentType | undefined {
  if (!value) {
    return undefined;
  }
  if ((AGENT_TYPE_VALUES as readonly string[]).includes(value)) {
    return value as AgentverseAgentType;
  }
  throw new Error(`Unsupported Agentverse agent type: ${value}`);
}

function parsePrefix(value?: string): AgentverseAgentPrefix | undefined {
  if (!value) {
    return undefined;
  }
  if ((PREFIX_VALUES as readonly string[]).includes(value)) {
    return value as AgentverseAgentPrefix;
  }
  throw new Error(`Unsupported Agentverse prefix: ${value}`);
}

export function buildAgentverseConfig(options: AgentverseConfigOptions = {}): AgentverseConfig {
  const apiKey = options.apiKey ?? env.agentverseApiKey;
  if (!apiKey) {
    throw new Error("Missing Agentverse API key. Provide via options.apiKey or set AGENTVERSE_API_KEY.");
  }

  const baseUrl = ensureTrailingSlash(options.baseUrl ?? env.agentverseBaseUrl ?? DEFAULT_AGENTVERSE_BASE_URL);

  return {
    baseUrl,
    apiKey,
    defaultPrefix: parsePrefix(options.defaultPrefix ?? env.agentverseDefaultPrefix),
    defaultAgentType: parseAgentType(options.defaultAgentType ?? env.agentverseDefaultAgentType),
    defaultEndpoint: options.defaultEndpoint ?? env.agentverseDefaultEndpoint
  };
}

