"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.T2VOrchestrator = void 0;
const models_1 = require("../models");
const t2v_1 = require("../config/t2v");
const X402PaymentBuilder_1 = require("./X402PaymentBuilder");
const X402FacilitatorService_1 = require("./X402FacilitatorService");
const T2VApiClient_1 = require("./T2VApiClient");
function isResolvedPaymentConfig(config) {
    return typeof config === "object" && config !== null && "pricePerCreditMinorUnits" in config;
}
class T2VOrchestrator {
    constructor(options = {}) {
        if (options.apiClient) {
            this.apiClient = options.apiClient;
            this.baseUrl = options.apiClient.getBaseUrl();
        }
        else {
            const apiConfig = (0, t2v_1.buildT2VApiConfig)(options.apiConfig);
            this.apiClient = new T2VApiClient_1.T2VApiClient(apiConfig);
            this.baseUrl = apiConfig.baseUrl;
        }
        this.paymentBuilder = options.paymentBuilder ?? new X402PaymentBuilder_1.X402PaymentBuilder();
        this.facilitatorService = options.facilitatorService ?? new X402FacilitatorService_1.X402FacilitatorService();
        this.paymentConfig = isResolvedPaymentConfig(options.paymentConfig)
            ? options.paymentConfig
            : (0, t2v_1.buildT2VPaymentConfig)(options.paymentConfig);
        this.protocolVersion = options.protocolVersion;
    }
    quote(input) {
        const breakdown = (0, models_1.calculateT2VCostBreakdown)(input);
        const totalMinorUnits = BigInt(breakdown.totalCredits) * this.paymentConfig.pricePerCreditMinorUnits;
        return {
            ...breakdown,
            pricePerCreditMinorUnits: this.paymentConfig.pricePerCreditMinorUnits,
            totalMinorUnits,
            totalMinorUnitsString: totalMinorUnits.toString()
        };
    }
    buildPaymentRequirement(quote, overrides = {}) {
        const maxAmountRequired = quote.totalMinorUnits?.toString();
        if (!maxAmountRequired) {
            throw new Error("Unable to derive payment amount for T2V quote.");
        }
        const resource = overrides.resource ?? this.paymentConfig.resource ?? new URL("create", this.baseUrl).toString();
        const description = overrides.description ?? this.paymentConfig.description ?? "SamsarOne T2V generation";
        const mimeType = overrides.mimeType ?? this.paymentConfig.mimeType ?? "application/json";
        const maxTimeoutSeconds = overrides.maxTimeoutSeconds ?? this.paymentConfig.maxTimeoutSeconds ?? 600;
        const extraDetails = {
            credits: quote.totalCredits,
            rateCreditsPerSecond: quote.rateCreditsPerSecond,
            durationSeconds: quote.durationSeconds,
            imageModel: quote.imageModel,
            videoModel: quote.videoModel,
            pricePerCreditMinorUnits: quote.pricePerCreditMinorUnits?.toString(),
            totalMinorUnits: quote.totalMinorUnits?.toString()
        };
        return {
            scheme: "exact",
            network: overrides.network ?? this.paymentConfig.network,
            maxAmountRequired,
            resource,
            description,
            mimeType,
            payTo: overrides.payTo ?? this.paymentConfig.payTo,
            maxTimeoutSeconds,
            asset: overrides.asset ?? this.paymentConfig.asset,
            extra: {
                ...extraDetails,
                ...overrides.extra
            }
        };
    }
    async createPaymentSession(signer, input, options = {}) {
        const quote = this.quote(input);
        const requirement = this.buildPaymentRequirement(quote, options.requirementOverrides);
        const { requirementOverrides, ...headerOptions } = options;
        const headerResult = await this.paymentBuilder.createHeader(signer, requirement, {
            ...headerOptions,
            protocolVersion: headerOptions.protocolVersion ?? this.protocolVersion
        });
        const paymentSession = this.paymentBuilder.createSession(headerResult);
        return {
            quote,
            requirement,
            paymentHeader: headerResult.header,
            paymentSession
        };
    }
    async submitPaidRequest(input, paymentPayload, paymentRequirements, options = {}) {
        const quote = this.quote(input);
        const expectedAmount = quote.totalMinorUnits;
        if (!expectedAmount) {
            throw new Error("Unable to determine expected payment amount for T2V submission.");
        }
        if (paymentRequirements.asset !== this.paymentConfig.asset) {
            throw new Error("Payment asset does not match expected T2V configuration.");
        }
        if (paymentRequirements.network !== this.paymentConfig.network) {
            throw new Error("Payment network does not match expected T2V configuration.");
        }
        if (paymentRequirements.payTo !== this.paymentConfig.payTo) {
            throw new Error("Payment destination does not match expected T2V configuration.");
        }
        const paidAmount = BigInt(paymentRequirements.maxAmountRequired);
        if (paidAmount < expectedAmount) {
            throw new Error("Paid amount is lower than the expected T2V quote.");
        }
        let verifyResponse;
        if (!options.skipVerification) {
            if (options.useOnchainVerification) {
                verifyResponse = await this.facilitatorService.verifyOnchain(paymentPayload, paymentRequirements, options.verificationOptions);
            }
            else {
                verifyResponse = await this.facilitatorService.verifyPayment(paymentPayload, paymentRequirements);
            }
        }
        let settleResponse;
        if (!options.skipSettlement) {
            if (options.useOnchainSettlement) {
                settleResponse = await this.facilitatorService.settleOnchain(paymentPayload, paymentRequirements, options.settlementOptions);
            }
            else {
                settleResponse = await this.facilitatorService.settlePayment(paymentPayload, paymentRequirements);
            }
        }
        const requestPayload = (0, models_1.buildT2VCreateRequest)(input);
        const apiResponse = await this.apiClient.createVideo(requestPayload, options.signal);
        return {
            quote,
            requirement: paymentRequirements,
            verifyResponse,
            settleResponse,
            apiResponse,
            requestId: "request_id" in apiResponse ? apiResponse.request_id : undefined
        };
    }
    async getStatus(requestId, signal) {
        return this.apiClient.getStatus(requestId, signal);
    }
}
exports.T2VOrchestrator = T2VOrchestrator;
