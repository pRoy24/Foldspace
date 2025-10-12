"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
exports.requireEnvValue = requireEnvValue;
exports.setEnvValue = setEnvValue;
const dotenv_1 = require("dotenv");
const ENV_VAR_NAMES = {
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
    t2vMaxTimeoutSeconds: "T2V_MAX_TIMEOUT_SECONDS"
};
let isLoaded = false;
function ensureLoaded() {
    if (!isLoaded) {
        (0, dotenv_1.config)();
        isLoaded = true;
    }
}
ensureLoaded();
exports.env = {
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
    t2vMaxTimeoutSeconds: process.env[ENV_VAR_NAMES.t2vMaxTimeoutSeconds]
};
function requireEnvValue(key) {
    const value = exports.env[key];
    if (!value) {
        throw new Error(`Missing required environment variable: ${ENV_VAR_NAMES[key]}`);
    }
    return value;
}
function setEnvValue(key, value) {
    if (typeof value === "string") {
        exports.env[key] = value;
        process.env[ENV_VAR_NAMES[key]] = value;
    }
}
