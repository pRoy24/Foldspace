import type {
  MultiNetworkSigner,
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  Signer,
  VerifyResponse
} from "x402/types";

import type {
  PaymentSession,
  T2VCreateVideoInput,
  T2VCreateVideoRequest,
  T2VCreateVideoResponse,
  T2VPaymentQuote,
  T2VStatusResponse
} from "../models";
import {
  buildT2VCreateRequest,
  calculateT2VCostBreakdown
} from "../models";
import {
  buildT2VApiConfig,
  buildT2VPaymentConfig,
  type T2VApiConfigOptions,
  type T2VPaymentConfig,
  type T2VPaymentConfigOptions
} from "../config/t2v";
import { X402PaymentBuilder, type HeaderCreationOptions } from "./X402PaymentBuilder";
import {
  X402FacilitatorService,
  type LocalSettlementOptions,
  type LocalVerificationOptions
} from "./X402FacilitatorService";
import { T2VApiClient } from "./T2VApiClient";

function isResolvedPaymentConfig(config: T2VPaymentConfigOptions | T2VPaymentConfig | undefined): config is T2VPaymentConfig {
  return typeof config === "object" && config !== null && "pricePerCreditMinorUnits" in config;
}

export interface T2VPaymentRequirementOverrides {
  network?: PaymentRequirements["network"];
  asset?: string;
  payTo?: string;
  resource?: string;
  description?: string;
  mimeType?: string;
  maxTimeoutSeconds?: number;
  extra?: Record<string, unknown>;
}

export interface T2VPaymentSessionOptions extends HeaderCreationOptions {
  requirementOverrides?: T2VPaymentRequirementOverrides;
}

export interface T2VPaymentSessionResult {
  quote: T2VPaymentQuote;
  requirement: PaymentRequirements;
  paymentHeader: string;
  paymentSession: PaymentSession;
}

export interface T2VSubmissionOptions {
  skipVerification?: boolean;
  skipSettlement?: boolean;
  useOnchainVerification?: boolean;
  useOnchainSettlement?: boolean;
  verificationOptions?: LocalVerificationOptions;
  settlementOptions?: LocalSettlementOptions;
  signal?: AbortSignal;
}

export interface T2VSubmissionResult {
  quote: T2VPaymentQuote;
  requirement: PaymentRequirements;
  verifyResponse?: VerifyResponse;
  settleResponse?: SettleResponse;
  apiResponse: T2VCreateVideoResponse;
  requestId?: string;
}

export interface T2VOrchestratorOptions {
  apiClient?: T2VApiClient;
  apiConfig?: T2VApiConfigOptions;
  paymentBuilder?: X402PaymentBuilder;
  paymentConfig?: T2VPaymentConfig | T2VPaymentConfigOptions;
  facilitatorService?: X402FacilitatorService;
  protocolVersion?: number;
}

export class T2VOrchestrator {
  private readonly apiClient: T2VApiClient;
  private readonly paymentBuilder: X402PaymentBuilder;
  private readonly facilitatorService: X402FacilitatorService;
  private readonly paymentConfig: T2VPaymentConfig;
  private readonly baseUrl: string;
  private readonly protocolVersion?: number;

  constructor(options: T2VOrchestratorOptions = {}) {
    if (options.apiClient) {
      this.apiClient = options.apiClient;
      this.baseUrl = options.apiClient.getBaseUrl();
    } else {
      const apiConfig = buildT2VApiConfig(options.apiConfig);
      this.apiClient = new T2VApiClient(apiConfig);
      this.baseUrl = apiConfig.baseUrl;
    }

    this.paymentBuilder = options.paymentBuilder ?? new X402PaymentBuilder();
    this.facilitatorService = options.facilitatorService ?? new X402FacilitatorService();
    this.paymentConfig = isResolvedPaymentConfig(options.paymentConfig)
      ? options.paymentConfig
      : buildT2VPaymentConfig(options.paymentConfig);
    this.protocolVersion = options.protocolVersion;
  }

  quote(input: T2VCreateVideoInput): T2VPaymentQuote {
    const breakdown = calculateT2VCostBreakdown(input);
    const totalMinorUnits = BigInt(breakdown.totalCredits) * this.paymentConfig.pricePerCreditMinorUnits;
    return {
      ...breakdown,
      pricePerCreditMinorUnits: this.paymentConfig.pricePerCreditMinorUnits,
      totalMinorUnits,
      totalMinorUnitsString: totalMinorUnits.toString()
    };
  }

  buildPaymentRequirement(
    quote: T2VPaymentQuote,
    overrides: T2VPaymentRequirementOverrides = {}
  ): PaymentRequirements {
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
    } satisfies Record<string, unknown>;

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
    } satisfies PaymentRequirements;
  }

  async createPaymentSession(
    signer: Signer | MultiNetworkSigner,
    input: T2VCreateVideoInput,
    options: T2VPaymentSessionOptions = {}
  ): Promise<T2VPaymentSessionResult> {
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

  async submitPaidRequest(
    input: T2VCreateVideoInput,
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
    options: T2VSubmissionOptions = {}
  ): Promise<T2VSubmissionResult> {
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

    let verifyResponse: VerifyResponse | undefined;
    if (!options.skipVerification) {
      if (options.useOnchainVerification) {
        verifyResponse = await this.facilitatorService.verifyOnchain(
          paymentPayload,
          paymentRequirements,
          options.verificationOptions
        );
      } else {
        verifyResponse = await this.facilitatorService.verifyPayment(paymentPayload, paymentRequirements);
      }
    }

    let settleResponse: SettleResponse | undefined;
    if (!options.skipSettlement) {
      if (options.useOnchainSettlement) {
        settleResponse = await this.facilitatorService.settleOnchain(
          paymentPayload,
          paymentRequirements,
          options.settlementOptions
        );
      } else {
        settleResponse = await this.facilitatorService.settlePayment(paymentPayload, paymentRequirements);
      }
    }

    const requestPayload: T2VCreateVideoRequest = buildT2VCreateRequest(input);
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

  async getStatus(requestId: string, signal?: AbortSignal): Promise<T2VStatusResponse> {
    return this.apiClient.getStatus(requestId, signal);
  }
}
