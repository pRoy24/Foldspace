import path from "node:path";
import dotenv from "dotenv";

import type { ProxyConfig } from "./types";

const envFile = process.env.PROXY_ENV_FILE ? path.resolve(process.cwd(), process.env.PROXY_ENV_FILE) : undefined;
if (envFile) {
  dotenv.config({ path: envFile });
} else {
  dotenv.config();
}

function parsePort(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseBigInt(value: string | undefined, fallback: bigint): bigint {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  try {
    return BigInt(value);
  } catch (error) {
    throw new Error(`Unable to parse bigint from value \"${value}\": ${(error as Error).message}`);
  }
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

const samsarBaseUrl = ensureTrailingSlash(process.env.SAMSAR_BASE_URL ?? "https://api.samsar.one/v1/video/");
const defaultResource = new URL("create", samsarBaseUrl).toString();
const payTo = process.env.PAYMENT_PAY_TO as ProxyConfig["payment"]["payTo"] | undefined;

if (!payTo) {
  throw new Error("PAYMENT_PAY_TO is required for the proxy to build x402 payment requirements.");
}

const paymentAsset = (process.env.PAYMENT_ASSET as ProxyConfig["payment"]["asset"] | undefined) ?? "usdc";
const paymentNetwork = (process.env.PAYMENT_NETWORK as ProxyConfig["payment"]["network"] | undefined) ?? "base-sepolia";
const description = process.env.PROXY_PAYMENT_DESCRIPTION ?? "SamsarOne T2V request";
const mimeType = process.env.PAYMENT_MIME_TYPE ?? "application/json";
const resource = (process.env.PAYMENT_RESOURCE as ProxyConfig["payment"]["resource"] | undefined) ?? defaultResource;
const bodyLimit = process.env.PROXY_BODY_LIMIT ?? "1mb";
const amountMinorUnits = parseBigInt(process.env.PROXY_PRICE_MINOR_UNITS, 10_000n);
const maxTimeoutSeconds = parseInteger(process.env.PROXY_MAX_TIMEOUT_SECONDS, 600);
const databasePath = path.resolve(process.cwd(), process.env.PROXY_DB_FILE ?? path.join("proxy-data", "sessions.json"));
const autoSubmitOnPayment = process.env.PROXY_AUTO_SUBMIT_ON_PAYMENT
  ? process.env.PROXY_AUTO_SUBMIT_ON_PAYMENT !== "false"
  : Boolean(process.env.SAMSAR_API_KEY);
const autoSettlePayments = process.env.PROXY_AUTO_SETTLE_PAYMENTS
  ? process.env.PROXY_AUTO_SETTLE_PAYMENTS !== "false"
  : true;

export const config: ProxyConfig = {
  port: parsePort(process.env.PROXY_PORT, 4001),
  x402Version: 1,
  databasePath,
  walletWebhookSecret: process.env.WALLET_WEBHOOK_SECRET,
  expressBodyLimit: bodyLimit,
  payment: {
    payTo,
    asset: paymentAsset,
    network: paymentNetwork,
    resource,
    description,
    mimeType,
    maxTimeoutSeconds,
    amountMinorUnits
  },
  samsar: {
    baseUrl: samsarBaseUrl,
    apiKey: process.env.SAMSAR_API_KEY,
    timeoutMs: parseInteger(process.env.SAMSAR_TIMEOUT_MS, 30_000)
  },
  behavior: {
    autoSubmitOnPayment,
    autoSettlePayments
  },
  facilitator: {
    apiKeyId: process.env.CDP_API_KEY_ID,
    apiKeySecret: process.env.CDP_API_KEY_SECRET,
    baseUrlOverride: process.env.X402_FACILITATOR_URL as ProxyConfig["facilitator"]["baseUrlOverride"]
  }
};
