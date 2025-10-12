"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildFacilitatorConfig = buildFacilitatorConfig;
exports.buildAuthHeaderFactory = buildAuthHeaderFactory;
const x402_1 = require("@coinbase/x402");
const env_1 = require("./env");
function isResourceUrl(value) {
    return value.includes("://");
}
function withBaseUrlOverride(config, baseUrl) {
    if (!baseUrl || !isResourceUrl(baseUrl)) {
        return config;
    }
    return {
        ...config,
        url: baseUrl
    };
}
function buildFacilitatorConfig(options = {}) {
    const apiKeyId = options.apiKeyId ?? env_1.env.cdpApiKeyId;
    const apiKeySecret = options.apiKeySecret ?? env_1.env.cdpApiKeySecret;
    if (!apiKeyId || !apiKeySecret) {
        return withBaseUrlOverride(x402_1.facilitator, options.baseUrlOverride ?? env_1.env.coinbaseFacilitatorUrl);
    }
    const config = (0, x402_1.createFacilitatorConfig)(apiKeyId, apiKeySecret);
    return withBaseUrlOverride(config, options.baseUrlOverride ?? env_1.env.coinbaseFacilitatorUrl);
}
function buildAuthHeaderFactory(options = {}) {
    const apiKeyId = options.apiKeyId ?? env_1.env.cdpApiKeyId;
    const apiKeySecret = options.apiKeySecret ?? env_1.env.cdpApiKeySecret;
    return (0, x402_1.createCdpAuthHeaders)(apiKeyId, apiKeySecret);
}
