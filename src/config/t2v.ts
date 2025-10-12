import { env } from "./env";
import type { PaymentRequirements } from "../models";
import { T2V_API_BASE_URL } from "../models";

const SUPPORTED_PAYMENT_NETWORKS = [
  "base-sepolia",
  "base",
  "avalanche-fuji",
  "avalanche",
  "iotex",
  "solana-devnet",
  "solana",
  "sei",
  "sei-testnet",
  "polygon",
  "polygon-amoy",
  "peaq"
] as const satisfies readonly PaymentRequirements["network"][];

const DEFAULT_PAYMENT_NETWORK: PaymentRequirements["network"] = "base-sepolia";

export interface T2VApiConfig {
  baseUrl: string;
  apiKey: string;
}

export interface T2VApiConfigOptions {
  baseUrl?: string;
  apiKey?: string;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

export function buildT2VApiConfig(options: T2VApiConfigOptions = {}): T2VApiConfig {
  const baseUrl = options.baseUrl ?? env.t2vBaseUrl ?? T2V_API_BASE_URL;
  const apiKey = options.apiKey ?? env.t2vApiKey;

  if (!apiKey) {
    throw new Error("Missing T2V API key. Provide via options.apiKey or set T2V_API_KEY.");
  }

  return {
    baseUrl: ensureTrailingSlash(baseUrl),
    apiKey
  };
}

export interface T2VPaymentConfig {
  network: PaymentRequirements["network"];
  asset: string;
  payTo: string;
  pricePerCreditMinorUnits: bigint;
  resource?: string;
  description?: string;
  mimeType?: string;
  maxTimeoutSeconds?: number;
}

export interface T2VPaymentConfigOptions {
  network?: PaymentRequirements["network"];
  asset?: string;
  payTo?: string;
  pricePerCreditMinorUnits?: bigint | number | string;
  resource?: string;
  description?: string;
  mimeType?: string;
  maxTimeoutSeconds?: number;
}

function parsePricePerCredit(value?: bigint | number | string): bigint | undefined {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.round(value));
  }
  if (typeof value === "string" && value.length > 0) {
    return BigInt(value);
  }
  return undefined;
}

function parseTimeoutSeconds(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

function resolveNetwork(value?: string): PaymentRequirements["network"] {
  if (!value) {
    return DEFAULT_PAYMENT_NETWORK;
  }
  const candidate = value as PaymentRequirements["network"];
  if (SUPPORTED_PAYMENT_NETWORKS.includes(candidate)) {
    return candidate;
  }
  throw new Error(`Unsupported T2V payment network: ${value}`);
}

export function buildT2VPaymentConfig(options: T2VPaymentConfigOptions = {}): T2VPaymentConfig {
  const network =
    options.network ??
    resolveNetwork(env.t2vNetwork ?? env.x402DefaultNetwork);
  const asset = options.asset ?? env.t2vAsset;
  const payTo = options.payTo ?? env.t2vPayTo;
  const pricePerCreditMinorUnits =
    parsePricePerCredit(options.pricePerCreditMinorUnits) ??
    parsePricePerCredit(env.t2vPricePerCreditMinorUnits) ??
    BigInt(10_000);
  const maxTimeoutSeconds =
    options.maxTimeoutSeconds ??
    parseTimeoutSeconds(env.t2vMaxTimeoutSeconds) ??
    600;

  if (!asset) {
    throw new Error("Missing T2V asset identifier. Provide via options.asset or T2V_ASSET.");
  }

  if (!payTo) {
    throw new Error("Missing T2V pay-to address. Provide via options.payTo or T2V_PAY_TO.");
  }

  return {
    network,
    asset,
    payTo,
    pricePerCreditMinorUnits,
    resource: options.resource ?? env.t2vResource,
    description: options.description ?? env.t2vDescription,
    mimeType: options.mimeType ?? env.t2vMimeType ?? "application/json",
    maxTimeoutSeconds
  };
}
