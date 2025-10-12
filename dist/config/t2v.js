"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildT2VApiConfig = buildT2VApiConfig;
exports.buildT2VPaymentConfig = buildT2VPaymentConfig;
const env_1 = require("./env");
const models_1 = require("../models");
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
];
const DEFAULT_PAYMENT_NETWORK = "base-sepolia";
function ensureTrailingSlash(value) {
    return value.endsWith("/") ? value : `${value}/`;
}
function buildT2VApiConfig(options = {}) {
    const baseUrl = options.baseUrl ?? env_1.env.t2vBaseUrl ?? models_1.T2V_API_BASE_URL;
    const apiKey = options.apiKey ?? env_1.env.t2vApiKey;
    if (!apiKey) {
        throw new Error("Missing T2V API key. Provide via options.apiKey or set T2V_API_KEY.");
    }
    return {
        baseUrl: ensureTrailingSlash(baseUrl),
        apiKey
    };
}
function parsePricePerCredit(value) {
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
function parseTimeoutSeconds(value) {
    if (!value) {
        return undefined;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return undefined;
    }
    return parsed;
}
function resolveNetwork(value) {
    if (!value) {
        return DEFAULT_PAYMENT_NETWORK;
    }
    const candidate = value;
    if (SUPPORTED_PAYMENT_NETWORKS.includes(candidate)) {
        return candidate;
    }
    throw new Error(`Unsupported T2V payment network: ${value}`);
}
function buildT2VPaymentConfig(options = {}) {
    const network = options.network ??
        resolveNetwork(env_1.env.t2vNetwork ?? env_1.env.x402DefaultNetwork);
    const asset = options.asset ?? env_1.env.t2vAsset;
    const payTo = options.payTo ?? env_1.env.t2vPayTo;
    const pricePerCreditMinorUnits = parsePricePerCredit(options.pricePerCreditMinorUnits) ??
        parsePricePerCredit(env_1.env.t2vPricePerCreditMinorUnits) ??
        BigInt(10_000);
    const maxTimeoutSeconds = options.maxTimeoutSeconds ??
        parseTimeoutSeconds(env_1.env.t2vMaxTimeoutSeconds) ??
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
        resource: options.resource ?? env_1.env.t2vResource,
        description: options.description ?? env_1.env.t2vDescription,
        mimeType: options.mimeType ?? env_1.env.t2vMimeType ?? "application/json",
        maxTimeoutSeconds
    };
}
