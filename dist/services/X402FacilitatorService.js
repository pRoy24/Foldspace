"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.X402FacilitatorService = void 0;
const x402_1 = require("../config/x402");
const env_1 = require("../config/env");
const types_1 = require("x402/types");
const verify_1 = require("x402/verify");
const facilitator_1 = require("x402/facilitator");
class X402FacilitatorService {
    constructor(options = {}) {
        const credentials = options.credentials ?? this.resolveCredentialsFromEnv();
        this.defaultNetwork = options.defaultNetwork ?? options.signer?.network ?? env_1.env.x402DefaultNetwork ?? "base-sepolia";
        this.signerPrivateKey = options.signer?.privateKey ?? env_1.env.x402PrivateKey;
        this.facilitatorConfig = (0, x402_1.buildFacilitatorConfig)({
            apiKeyId: credentials?.apiKeyId,
            apiKeySecret: credentials?.apiKeySecret
        });
        const facilitatorClient = (0, verify_1.useFacilitator)(this.facilitatorConfig);
        this.verifyWithFacilitator = facilitatorClient.verify;
        this.settleWithFacilitator = facilitatorClient.settle;
        this.listWithFacilitator = facilitatorClient.list;
        this.supportedWithFacilitator = facilitatorClient.supported;
    }
    getFacilitatorConfig() {
        return this.facilitatorConfig;
    }
    async verifyPayment(payload, requirements) {
        return this.verifyWithFacilitator(payload, requirements);
    }
    async settlePayment(payload, requirements) {
        return this.settleWithFacilitator(payload, requirements);
    }
    async listResources(request) {
        return this.listWithFacilitator(request);
    }
    async supportedPaymentKinds() {
        return this.supportedWithFacilitator();
    }
    async verifyOnchain(payload, requirements, options = {}) {
        const network = options.networkOverride ?? requirements.network ?? this.defaultNetwork;
        const client = (0, types_1.createConnectedClient)(network);
        return (0, facilitator_1.verify)(client, payload, requirements);
    }
    async settleOnchain(payload, requirements, options = {}) {
        const network = options.networkOverride ?? requirements.network ?? this.defaultNetwork;
        const signer = await (0, types_1.createSigner)(network, this.resolvePrivateKey(options.privateKey));
        return (0, facilitator_1.settle)(signer, payload, requirements);
    }
    resolveCredentialsFromEnv() {
        if (env_1.env.cdpApiKeyId && env_1.env.cdpApiKeySecret) {
            return {
                apiKeyId: env_1.env.cdpApiKeyId,
                apiKeySecret: env_1.env.cdpApiKeySecret
            };
        }
        return undefined;
    }
    resolvePrivateKey(override) {
        const privateKey = override ?? this.signerPrivateKey;
        if (!privateKey) {
            throw new Error("Missing X402 signer private key. Provide via X402_SERVICE options or X402_PRIVATE_KEY env variable.");
        }
        return privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
    }
}
exports.X402FacilitatorService = X402FacilitatorService;
