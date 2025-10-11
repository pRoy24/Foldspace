import {
  createPaymentHeader,
  preparePaymentHeader,
  selectPaymentRequirements,
  signPaymentHeader
} from "x402/client";
import type {
  MultiNetworkSigner,
  PaymentRequirements,
  Signer,
  UnsignedPaymentPayload,
  X402Config
} from "x402/types";
import type {
  PaymentHeaderResult,
  PaymentPreparationContext,
  PaymentSession,
  RequirementSelectionOptions
} from "../models";
import type { Address } from "viem";

export interface HeaderCreationOptions {
  configOverride?: X402Config;
  protocolVersion?: number;
}

const DEFAULT_X402_VERSION = 1;

export class X402PaymentBuilder {
  private readonly defaultVersion: number;
  private readonly defaultConfig?: X402Config;

  constructor(defaultConfig?: X402Config, defaultVersion: number = DEFAULT_X402_VERSION) {
    this.defaultConfig = defaultConfig;
    this.defaultVersion = defaultVersion;
  }

  selectRequirement(requirements: PaymentRequirements[], options: RequirementSelectionOptions = {}): PaymentRequirements {
    const { selector, network, scheme } = options;
    if (selector) {
      return selector(requirements, network, scheme);
    }

    return selectPaymentRequirements(requirements, network, scheme);
  }

  prepare(from: Address, requirement: PaymentRequirements, version: number = this.defaultVersion): PaymentPreparationContext {
    const unsignedPayload = preparePaymentHeader(from, version, requirement);
    return {
      from,
      requirement,
      unsignedPayload
    };
  }

  async createHeader(
    signer: Signer | MultiNetworkSigner,
    requirement: PaymentRequirements,
    options: HeaderCreationOptions = {}
  ): Promise<PaymentHeaderResult> {
    const version = options.protocolVersion ?? this.defaultVersion;
    const config = options.configOverride ?? this.defaultConfig;
    const header = await createPaymentHeader(signer, version, requirement, config);
    return {
      header,
      requirement,
      version
    };
  }

  async signPrepared(
    signer: Signer | MultiNetworkSigner,
    requirement: PaymentRequirements,
    unsignedPayload: UnsignedPaymentPayload
  ): Promise<string> {
    return signPaymentHeader(signer, requirement, unsignedPayload);
  }

  createSession(result: PaymentHeaderResult): PaymentSession {
    return {
      requirement: result.requirement,
      header: result.header,
      status: "pending"
    };
  }
}
