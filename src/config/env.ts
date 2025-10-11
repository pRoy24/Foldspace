import { config as loadEnv } from "dotenv";

export interface EnvConfig {
  cdpApiKeyId?: string;
  cdpApiKeySecret?: string;
  x402PrivateKey?: string;
  x402DefaultNetwork?: string;
  coinbaseFacilitatorUrl?: string;
}

type EnvKey = keyof EnvConfig;

const ENV_VAR_NAMES: Record<EnvKey, string> = {
  cdpApiKeyId: "CDP_API_KEY_ID",
  cdpApiKeySecret: "CDP_API_KEY_SECRET",
  x402PrivateKey: "X402_PRIVATE_KEY",
  x402DefaultNetwork: "X402_DEFAULT_NETWORK",
  coinbaseFacilitatorUrl: "X402_FACILITATOR_URL"
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
  coinbaseFacilitatorUrl: process.env[ENV_VAR_NAMES.coinbaseFacilitatorUrl]
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
