import type {
  DiscoveredResource,
  FacilitatorConfig,
  ListDiscoveryResourcesRequest,
  ListDiscoveryResourcesResponse,
  MultiNetworkSigner,
  Network,
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  Signer,
  SupportedPaymentKindsResponse,
  UnsignedPaymentPayload,
  VerifyResponse,
  X402Config
} from "x402/types";
import type { PaymentRequirementsSelector } from "x402/client";
import type { Address } from "viem";

export type { Address };
export type {
  DiscoveredResource,
  FacilitatorConfig,
  ListDiscoveryResourcesRequest,
  ListDiscoveryResourcesResponse,
  MultiNetworkSigner,
  Network,
  PaymentPayload,
  PaymentRequirements,
  PaymentRequirementsSelector,
  SettleResponse,
  Signer,
  SupportedPaymentKindsResponse,
  UnsignedPaymentPayload,
  VerifyResponse,
  X402Config
};

export type PaymentSessionStatus = "pending" | "verified" | "settled";

export interface PaymentSession {
  requirement: PaymentRequirements;
  header: string;
  status: PaymentSessionStatus;
  verifyResponse?: VerifyResponse;
  settleResponse?: SettleResponse;
}

export interface RequirementSelectionOptions {
  selector?: PaymentRequirementsSelector;
  network?: Network | Network[];
  scheme?: "exact";
}

export interface PaymentPreparationContext {
  from: Address;
  requirement: PaymentRequirements;
  unsignedPayload: UnsignedPaymentPayload;
}

export interface PaymentHeaderResult {
  header: string;
  requirement: PaymentRequirements;
  version: number;
}
