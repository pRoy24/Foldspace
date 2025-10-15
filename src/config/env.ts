import { config as loadEnv } from "dotenv";

export interface EnvConfig {
  cdpApiKeyId?: string;
  cdpApiKeySecret?: string;
  x402PrivateKey?: string;
  x402DefaultNetwork?: string;
  coinbaseFacilitatorUrl?: string;
  t2vApiKey?: string;
  t2vBaseUrl?: string;
  t2vPayTo?: string;
  t2vAsset?: string;
  t2vNetwork?: string;
  t2vPricePerCreditMinorUnits?: string;
  t2vResource?: string;
  t2vDescription?: string;
  t2vMimeType?: string;
  t2vMaxTimeoutSeconds?: string;
  agentverseBaseUrl?: string;
  agentverseApiKey?: string;
  agentverseDefaultPrefix?: string;
  agentverseDefaultAgentType?: string;
  agentverseDefaultEndpoint?: string;
}

type EnvKey = keyof EnvConfig;

const ENV_VAR_NAMES: Record<EnvKey, string> = {
  cdpApiKeyId: "CDP_API_KEY_ID",
  cdpApiKeySecret: "CDP_API_KEY_SECRET",
  x402PrivateKey: "X402_PRIVATE_KEY",
  x402DefaultNetwork: "X402_DEFAULT_NETWORK",
  coinbaseFacilitatorUrl: "X402_FACILITATOR_URL",
  t2vApiKey: "T2V_API_KEY",
  t2vBaseUrl: "T2V_BASE_URL",
  t2vPayTo: "T2V_PAY_TO",
  t2vAsset: "T2V_ASSET",
  t2vNetwork: "T2V_NETWORK",
  t2vPricePerCreditMinorUnits: "T2V_PRICE_PER_CREDIT_MINOR_UNITS",
  t2vResource: "T2V_RESOURCE",
  t2vDescription: "T2V_DESCRIPTION",
  t2vMimeType: "T2V_MIME_TYPE",
  t2vMaxTimeoutSeconds: "T2V_MAX_TIMEOUT_SECONDS",
  agentverseBaseUrl: "AGENTVERSE_BASE_URL",
  agentverseApiKey: "AGENTVERSE_API_KEY",
  agentverseDefaultPrefix: "AGENTVERSE_DEFAULT_PREFIX",
  agentverseDefaultAgentType: "AGENTVERSE_DEFAULT_AGENT_TYPE",
  agentverseDefaultEndpoint: "AGENTVERSE_DEFAULT_ENDPOINT"
};

let isLoaded = false;

function ensureLoaded(): void {
  if (!isLoaded) {
    loadEnv();
    isLoaded = true;
  }
}

ensureLoaded();

export const env: EnvConfig = {
  cdpApiKeyId: process.env[ENV_VAR_NAMES.cdpApiKeyId],
  cdpApiKeySecret: process.env[ENV_VAR_NAMES.cdpApiKeySecret],
  x402PrivateKey: process.env[ENV_VAR_NAMES.x402PrivateKey],
  x402DefaultNetwork: process.env[ENV_VAR_NAMES.x402DefaultNetwork],
  coinbaseFacilitatorUrl: process.env[ENV_VAR_NAMES.coinbaseFacilitatorUrl],
  t2vApiKey: process.env[ENV_VAR_NAMES.t2vApiKey],
  t2vBaseUrl: process.env[ENV_VAR_NAMES.t2vBaseUrl],
  t2vPayTo: process.env[ENV_VAR_NAMES.t2vPayTo],
  t2vAsset: process.env[ENV_VAR_NAMES.t2vAsset],
  t2vNetwork: process.env[ENV_VAR_NAMES.t2vNetwork],
  t2vPricePerCreditMinorUnits: process.env[ENV_VAR_NAMES.t2vPricePerCreditMinorUnits],
  t2vResource: process.env[ENV_VAR_NAMES.t2vResource],
  t2vDescription: process.env[ENV_VAR_NAMES.t2vDescription],
  t2vMimeType: process.env[ENV_VAR_NAMES.t2vMimeType],
  t2vMaxTimeoutSeconds: process.env[ENV_VAR_NAMES.t2vMaxTimeoutSeconds],
  agentverseBaseUrl: process.env[ENV_VAR_NAMES.agentverseBaseUrl],
  agentverseApiKey: process.env[ENV_VAR_NAMES.agentverseApiKey],
  agentverseDefaultPrefix: process.env[ENV_VAR_NAMES.agentverseDefaultPrefix],
  agentverseDefaultAgentType: process.env[ENV_VAR_NAMES.agentverseDefaultAgentType],
  agentverseDefaultEndpoint: process.env[ENV_VAR_NAMES.agentverseDefaultEndpoint]
};

export function requireEnvValue(key: EnvKey): string {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${ENV_VAR_NAMES[key]}`);
  }
  return value;
}

export function setEnvValue(key: EnvKey, value: string | undefined): void {
  if (typeof value === "string") {
    env[key] = value;
    process.env[ENV_VAR_NAMES[key]] = value;
  }
}
