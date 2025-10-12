"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.X402PaymentBuilder = void 0;
const client_1 = require("x402/client");
const DEFAULT_X402_VERSION = 1;
class X402PaymentBuilder {
    constructor(defaultConfig, defaultVersion = DEFAULT_X402_VERSION) {
        this.defaultConfig = defaultConfig;
        this.defaultVersion = defaultVersion;
    }
    selectRequirement(requirements, options = {}) {
        const { selector, network, scheme } = options;
        if (selector) {
            return selector(requirements, network, scheme);
        }
        return (0, client_1.selectPaymentRequirements)(requirements, network, scheme);
    }
    prepare(from, requirement, version = this.defaultVersion) {
        const unsignedPayload = (0, client_1.preparePaymentHeader)(from, version, requirement);
        return {
            from,
            requirement,
            unsignedPayload
        };
    }
    async createHeader(signer, requirement, options = {}) {
        const version = options.protocolVersion ?? this.defaultVersion;
        const config = options.configOverride ?? this.defaultConfig;
        const header = await (0, client_1.createPaymentHeader)(signer, version, requirement, config);
        return {
            header,
            requirement,
            version
        };
    }
    async signPrepared(signer, requirement, unsignedPayload) {
        return (0, client_1.signPaymentHeader)(signer, requirement, unsignedPayload);
    }
    createSession(result) {
        return {
            requirement: result.requirement,
            header: result.header,
            status: "pending"
        };
    }
}
exports.X402PaymentBuilder = X402PaymentBuilder;
