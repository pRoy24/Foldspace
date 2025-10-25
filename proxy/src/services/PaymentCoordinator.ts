import { createHash, randomUUID } from "node:crypto";

import type {
  CreateJobPayload,
  PaymentRequirementConfig,
  PaymentRequiredPayload,
  ProxyBehaviorConfig,
  SessionHistoryEntry,
  SessionRecord,
  WalletEventPayload
} from "../types";
import type { SessionStore } from "../storage/FileSessionStore";
import { HttpError } from "../errors";
import { SamsarClient, type SamsarSubmissionResult } from "./SamsarClient";
import { X402Facilitator } from "./X402Facilitator";
import type { PaymentRequirements } from "x402/types";

interface PaymentCoordinatorOptions {
  store: SessionStore;
  x402Version: number;
  payment: PaymentRequirementConfig;
  samsarClient: SamsarClient;
  facilitator: X402Facilitator;
  behavior: ProxyBehaviorConfig;
}

function nowIso(): string {
  return new Date().toISOString();
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export class PaymentCoordinator {
  private readonly store: SessionStore;
  private readonly x402Version: number;
  private readonly payment: PaymentRequirementConfig;
  private readonly samsarClient: SamsarClient;
  private readonly facilitator: X402Facilitator;
  private readonly behavior: ProxyBehaviorConfig;

  constructor(options: PaymentCoordinatorOptions) {
    this.store = options.store;
    this.x402Version = options.x402Version;
    this.payment = options.payment;
    this.samsarClient = options.samsarClient;
    this.facilitator = options.facilitator;
    this.behavior = options.behavior;
    if (this.behavior.autoSubmitOnPayment && !this.samsarClient.isEnabled()) {
      throw new Error("AUTO_SUBMIT_ON_PAYMENT=true requires SAMSAR_API_KEY to be set.");
    }
  }

  async createPaywalledSession(payload: CreateJobPayload): Promise<PaymentRequiredPayload> {
    const sessionId = randomUUID();
    const requirement = this.buildRequirement(sessionId, payload);
    const createdAt = nowIso();
    const record: SessionRecord = {
      id: sessionId,
      payload,
      status: "payment_pending",
      createdAt,
      updatedAt: createdAt,
      quote: {
        amountMinorUnits: requirement.maxAmountRequired,
        asset: requirement.asset ?? this.payment.asset,
        network: requirement.network,
        description: requirement.description
      },
      requirement,
      events: [
        {
          status: "payment_pending",
          timestamp: createdAt,
          message: "Session created. Awaiting payment.",
          metadata: { sessionId }
        }
      ]
    };

    await this.store.insert(record);
    return {
      message: "Payment required to access /create.",
      sessionId,
      x402Version: String(this.x402Version),
      accepts: [requirement],
      quote: record.quote
    };
  }

  async listSessions(): Promise<SessionRecord[]> {
    return this.store.list();
  }

  async getSession(sessionId: string): Promise<SessionRecord | undefined> {
    return this.store.get(sessionId);
  }

  async recordWalletEvent(event: WalletEventPayload): Promise<SessionRecord> {
    if (!event.sessionId) {
      throw new HttpError(400, "sessionId is required in wallet events");
    }

    const session = await this.store.get(event.sessionId);
    if (!session) {
      throw new HttpError(404, `Session ${event.sessionId} not found`);
    }
    if (session.status === "forwarded" || session.status === "forwarding") {
      return session;
    }

    const requirement = event.paymentRequirements ?? session.requirement;
    this.assertRequirementMatches(session.requirement, requirement);

    const verification = await this.facilitator.verifyPayment(event.paymentPayload, requirement);
    const verificationRecord = toRecord(verification);
    const verificationId = typeof verificationRecord?.id === "string" ? verificationRecord.id : undefined;
    let settlementReceipt: Record<string, unknown> | undefined;
    if (this.behavior.autoSettlePayments && !event.skipSettlement) {
      const settlement = await this.facilitator.settlePayment(event.paymentPayload, requirement);
      settlementReceipt = toRecord(settlement);
    }
    const settlementId = typeof settlementReceipt?.id === "string" ? settlementReceipt.id : undefined;

    const paymentMetadata = {
      ...(event.metadata ?? {}),
      verificationId,
      settlementId
    };
    const verifiedSession = await this.store.update(session.id, (record) => {
      const updated: SessionRecord = {
        ...record,
        status: "payment_verified",
        updatedAt: nowIso(),
        paymentPayload: event.paymentPayload,
        verificationReceipt: verificationRecord,
        settlementReceipt,
        events: [
          ...record.events,
          this.buildEvent("payment_verified", "Payment verified via facilitator.", paymentMetadata)
        ]
      };
      return updated;
    });

    if (!this.behavior.autoSubmitOnPayment) {
      return verifiedSession;
    }

    return this.forwardToSamsar(verifiedSession);
  }

  private buildRequirement(sessionId: string, payload: CreateJobPayload): PaymentRequirements {
    const payloadHash = createHash("sha256").update(JSON.stringify(payload ?? {})).digest("hex");
    return {
      scheme: "exact",
      network: this.payment.network as PaymentRequirements["network"],
      maxAmountRequired: this.payment.amountMinorUnits.toString(),
      resource: this.payment.resource as PaymentRequirements["resource"],
      description: this.payment.description,
      mimeType: this.payment.mimeType,
      payTo: this.payment.payTo as PaymentRequirements["payTo"],
      maxTimeoutSeconds: this.payment.maxTimeoutSeconds,
      asset: this.payment.asset as PaymentRequirements["asset"],
      extra: {
        sessionId,
        payloadHash,
        flatFeeMinorUnits: this.payment.amountMinorUnits.toString()
      }
    };
  }

  private assertRequirementMatches(expected: PaymentRequirements, actual: PaymentRequirements): void {
    const keys: Array<keyof PaymentRequirements> = ["scheme", "network", "maxAmountRequired", "payTo", "asset", "resource"];
    for (const key of keys) {
      const expectedValue = expected[key];
      const actualValue = actual[key];
      if (expectedValue !== actualValue) {
        throw new HttpError(400, `Payment requirement mismatch for ${String(key)}`);
      }
    }
  }

  private buildEvent(status: SessionHistoryEntry["status"], message: string, metadata?: Record<string, unknown>): SessionHistoryEntry {
    return {
      status,
      message,
      metadata,
      timestamp: nowIso()
    };
  }

  private async forwardToSamsar(session: SessionRecord): Promise<SessionRecord> {
    const forwardingSession = await this.store.update(session.id, (record) => ({
      ...record,
      status: "forwarding",
      updatedAt: nowIso(),
      events: [
        ...record.events,
        this.buildEvent("forwarding", "Payment confirmed. Forwarding to SamsarOne.")
      ]
    }));

    try {
      const submission = await this.samsarClient.submitCreate(forwardingSession.payload);
      return this.handleForwardingSuccess(forwardingSession.id, submission);
    } catch (error) {
      return this.handleForwardingFailure(forwardingSession.id, error as Error);
    }
  }

  private async handleForwardingSuccess(sessionId: string, submission: SamsarSubmissionResult): Promise<SessionRecord> {
    return this.store.update(sessionId, (record) => ({
      ...record,
      status: "forwarded",
      updatedAt: nowIso(),
      samsarRequestId: submission.requestId,
      samsarResponse: submission.responseBody,
      events: [
        ...record.events,
        this.buildEvent("forwarded", "Payload forwarded to SamsarOne.", {
          requestId: submission.requestId,
          statusCode: submission.statusCode
        })
      ]
    }));
  }

  private async handleForwardingFailure(sessionId: string, error: Error): Promise<SessionRecord> {
    return this.store.update(sessionId, (record) => ({
      ...record,
      status: "failed",
      updatedAt: nowIso(),
      error: {
        stage: "forwarding",
        message: error.message,
        stack: error.stack
      },
      events: [
        ...record.events,
        this.buildEvent("failed", "Forwarding to SamsarOne failed.", { message: error.message })
      ]
    }));
  }
}
