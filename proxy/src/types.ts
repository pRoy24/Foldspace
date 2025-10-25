import type { FacilitatorConfig, PaymentPayload, PaymentRequirements } from "x402/types";

export type CreateJobPayload = Record<string, unknown>;

export interface PaymentQuote {
  amountMinorUnits: string;
  asset: string;
  network: string;
  description: string;
}

export type SessionStatus = "payment_pending" | "payment_verified" | "forwarding" | "forwarded" | "failed";

export interface SessionHistoryEntry {
  status: SessionStatus;
  timestamp: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface SessionRecord {
  id: string;
  payload: CreateJobPayload;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  requirement: PaymentRequirements;
  quote: PaymentQuote;
  events: SessionHistoryEntry[];
  paymentPayload?: PaymentPayload;
  verificationReceipt?: Record<string, unknown>;
  settlementReceipt?: Record<string, unknown>;
  samsarRequestId?: string;
  samsarResponse?: Record<string, unknown>;
  error?: {
    stage: "payment" | "forwarding";
    message: string;
    stack?: string;
  };
}

export interface PaymentRequiredPayload {
  message: string;
  sessionId: string;
  x402Version: string;
  accepts: PaymentRequirements[];
  quote: PaymentQuote;
}

export interface WalletEventPayload {
  sessionId: string;
  paymentPayload: PaymentPayload;
  paymentRequirements?: PaymentRequirements;
  metadata?: Record<string, unknown>;
  skipSettlement?: boolean;
}

export interface PaymentRequirementConfig {
  payTo: PaymentRequirements["payTo"];
  asset: PaymentRequirements["asset"];
  network: PaymentRequirements["network"];
  resource: PaymentRequirements["resource"];
  description: string;
  mimeType: string;
  maxTimeoutSeconds: number;
  amountMinorUnits: bigint;
}

export interface SamsarClientOptions {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
}

export interface ProxyBehaviorConfig {
  autoSubmitOnPayment: boolean;
  autoSettlePayments: boolean;
}

export interface ProxyConfig {
  port: number;
  x402Version: number;
  databasePath: string;
  walletWebhookSecret?: string;
  payment: PaymentRequirementConfig;
  samsar: SamsarClientOptions;
  behavior: ProxyBehaviorConfig;
  expressBodyLimit: string;
  facilitator: {
    apiKeyId?: string;
    apiKeySecret?: string;
    baseUrlOverride?: FacilitatorConfig["url"];
  };
}
