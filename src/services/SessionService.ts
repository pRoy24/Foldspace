import { randomUUID } from "node:crypto";

import { x402Versions } from "x402/types";

import {
  calculateT2VCostBreakdown,
  buildT2VCreateRequest
} from "../models";
import type {
  PaymentPayload,
  PaymentRequirements,
  SessionRecord,
  SessionStatus,
  SessionUpdate,
  SessionHistoryEntry,
  QuoteSummary,
  T2VCreateVideoInput,
  T2VStatusResponse
} from "../models";
import {
  buildT2VPaymentConfig
} from "../config/t2v";
import { env } from "../config/env";
import { AgentverseClient } from "./AgentverseClient";
import { T2VOrchestrator } from "./T2VOrchestrator";

const USDC_DECIMALS = 6n;
const DEFAULT_PAYMENT_DESCRIPTION = "SamsarOne T2V generation";
const [DEFAULT_X402_VERSION] = x402Versions;

function formatMinorUnitsToUsdc(minorUnits: bigint): string {
  const sign = minorUnits < 0n ? "-" : "";
  const absolute = minorUnits < 0n ? -minorUnits : minorUnits;
  const base = 10n ** USDC_DECIMALS;
  const whole = absolute / base;
  const fraction = absolute % base;
  const fractionText = fraction.toString().padStart(Number(USDC_DECIMALS), "0");
  return `${sign}${whole.toString()}.${fractionText}`;
}

function buildQuoteSummary(input: T2VCreateVideoInput, requirement: PaymentRequirements): QuoteSummary {
  const breakdown = calculateT2VCostBreakdown(input);
  const pricePerCreditMinorUnits = requirement.extra?.pricePerCreditMinorUnits
    ? BigInt(requirement.extra.pricePerCreditMinorUnits)
    : 0n;
  const totalMinorUnits = requirement.maxAmountRequired
    ? BigInt(requirement.maxAmountRequired)
    : BigInt(breakdown.totalCredits) * pricePerCreditMinorUnits;
  return {
    asset: requirement.asset ?? "",
    network: requirement.network,
    totalCredits: breakdown.totalCredits,
    durationSeconds: breakdown.durationSeconds,
    imageModel: breakdown.imageModel,
    videoModel: breakdown.videoModel,
    rateCreditsPerSecond: breakdown.rateCreditsPerSecond,
    pricePerCreditMinorUnits: pricePerCreditMinorUnits.toString(),
    pricePerCreditUsdc: formatMinorUnitsToUsdc(pricePerCreditMinorUnits),
    totalMinorUnits: requirement.maxAmountRequired ?? totalMinorUnits.toString(),
    totalUsdc: formatMinorUnitsToUsdc(BigInt(requirement.maxAmountRequired ?? totalMinorUnits.toString()))
  };
}

interface SessionServiceOptions {
  pollIntervalMs?: number;
  agentverseClient?: AgentverseClient;
  agentverseAgentId?: string;
  orchestrator?: T2VOrchestrator;
}

interface CreateSessionResult {
  session: SessionRecord;
  requirement: PaymentRequirements;
  quote: QuoteSummary;
  x402Version: string;
}

export interface PaymentConfirmationOptions {
  skipSettlement?: boolean;
  skipVerification?: boolean;
}

export class SessionService {
  private readonly pollIntervalMs: number;
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly pollers = new Map<string, NodeJS.Timeout>();
  private readonly agentverseClient?: AgentverseClient;
  private readonly agentverseAgentId?: string;
  private readonly orchestrator: T2VOrchestrator;

  constructor(options: SessionServiceOptions = {}) {
    this.pollIntervalMs = options.pollIntervalMs ?? 5_000;
    this.agentverseClient = options.agentverseClient;
    this.agentverseAgentId = options.agentverseAgentId;
    this.orchestrator = options.orchestrator ?? new T2VOrchestrator();
  }

  async createSession(input: T2VCreateVideoInput): Promise<CreateSessionResult> {
    const sessionId = randomUUID();
    const paymentConfig = buildT2VPaymentConfig();
    const breakdown = calculateT2VCostBreakdown(input);
    const pricePerCreditMinorUnits = paymentConfig.pricePerCreditMinorUnits;
    const totalMinorUnits = BigInt(breakdown.totalCredits) * pricePerCreditMinorUnits;

    const requirement: PaymentRequirements = {
      scheme: "exact",
      network: paymentConfig.network,
      maxAmountRequired: totalMinorUnits.toString(),
      resource: this.resolveT2VResource(),
      description: paymentConfig.description ?? DEFAULT_PAYMENT_DESCRIPTION,
      mimeType: paymentConfig.mimeType ?? "application/json",
      payTo: paymentConfig.payTo,
      maxTimeoutSeconds: paymentConfig.maxTimeoutSeconds ?? 600,
      asset: paymentConfig.asset,
      extra: {
        ...breakdown,
        pricePerCreditMinorUnits: pricePerCreditMinorUnits.toString(),
        pricePerCreditUsdc: formatMinorUnitsToUsdc(pricePerCreditMinorUnits),
        totalMinorUnits: totalMinorUnits.toString(),
        totalUsdc: formatMinorUnitsToUsdc(totalMinorUnits),
        sessionId
      }
    };

    const nowIso = new Date().toISOString();
    const session: SessionRecord = {
      id: sessionId,
      createdAt: nowIso,
      updatedAt: nowIso,
      status: "payment_pending",
      input,
      quote: buildQuoteSummary(input, requirement),
      requirement,
      history: [
        {
          status: "payment_pending",
          message: "Session created. Awaiting payment.",
          timestamp: nowIso,
          metadata: { sessionId }
        }
      ]
    };

    this.sessions.set(sessionId, session);
    await this.postAgentverseUpdate(session, "Session created. Awaiting payment.", {
      sessionId,
      status: session.status,
      requirement
    });

    return {
      session,
      requirement,
      quote: session.quote,
      x402Version: String(DEFAULT_X402_VERSION)
    };
  }

  async getSession(sessionId: string): Promise<SessionRecord | undefined> {
    return this.sessions.get(sessionId);
  }

  async confirmPayment(
    sessionId: string,
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    options: PaymentConfirmationOptions = {}
  ): Promise<SessionRecord> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found.`);
    }

    this.assertRequirementsMatch(session.requirement, requirements);

    await this.applyUpdate(sessionId, {
      status: "payment_confirmed",
      lastPaymentPayload: payload
    }, "Payment confirmed. Preparing SamsarOne request.", {
      sessionId,
      paymentPayload: payload
    });

    const submission = await this.orchestrator.submitPaidRequest(
      session.input,
      payload,
      requirements,
      {
        skipSettlement: options.skipSettlement,
        skipVerification: options.skipVerification
      }
    );

    const requestId = submission.requestId;
    if (!requestId) {
      throw new Error("SamsarOne response did not include a request_id.");
    }

    const pendingSession = await this.applyUpdate(sessionId, {
      status: "creation_pending",
      samsarRequestId: requestId
    }, `SamsarOne request accepted. Request ID ${requestId}.`, {
      sessionId,
      requestId,
      samsarSubmission: submission.apiResponse
    });

    this.schedulePoll(pendingSession.id, requestId);
    return pendingSession;
  }

  private resolveT2VResource(): string {
    if (env.t2vResource) {
      return env.t2vResource;
    }
    const baseUrl = env.t2vBaseUrl ?? "https://api.samsar.one/v1/video/";
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    return new URL("create", normalizedBase).toString();
  }

  private assertRequirementsMatch(expected: PaymentRequirements, actual: PaymentRequirements): void {
    const mismatch: string[] = [];
    if (expected.asset !== actual.asset) {
      mismatch.push("asset");
    }
    if (expected.network !== actual.network) {
      mismatch.push("network");
    }
    if (expected.payTo !== actual.payTo) {
      mismatch.push("payTo");
    }
    if (expected.maxAmountRequired !== actual.maxAmountRequired) {
      mismatch.push("maxAmountRequired");
    }
    if (mismatch.length > 0) {
      throw new Error(`Payment requirements mismatch for session: ${mismatch.join(", ")}`);
    }
  }

  private schedulePoll(sessionId: string, requestId: string): void {
    if (this.pollers.has(sessionId)) {
      return;
    }

    const timer = setInterval(() => {
      this.pollOnce(sessionId, requestId).catch((error: unknown) => {
        console.error(`Failed to poll SamsarOne status for session ${sessionId}:`, error);
      });
    }, this.pollIntervalMs);

    this.pollers.set(sessionId, timer);
  }

  private stopPoll(sessionId: string): void {
    const timer = this.pollers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.pollers.delete(sessionId);
    }
  }

  private async pollOnce(sessionId: string, requestId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.stopPoll(sessionId);
      return;
    }

    if (session.status === "completed" || session.status === "failed") {
      this.stopPoll(sessionId);
      return;
    }

    const status = await this.orchestrator.getStatus(requestId);
    const metadata = { sessionId, requestId, status };

    if ("status" in status) {
      const normalized = status.status?.toString().toUpperCase();
      if (normalized === "COMPLETED" && "url" in status && typeof status.url === "string") {
        await this.applyUpdate(sessionId, {
          status: "completed",
          samsarStatus: status as T2VStatusResponse,
          resultUrl: status.url
        }, "SamsarOne processing completed.", {
          ...metadata,
          resultUrl: status.url
        });
        this.stopPoll(sessionId);
        return;
      }

      if (normalized === "FAILED") {
        const failureReason = "message" in status && typeof status.message === "string"
          ? status.message
          : "SamsarOne reported a failure.";
        await this.applyUpdate(sessionId, {
          status: "failed",
          samsarStatus: status,
          failureReason
        }, `SamsarOne processing failed: ${failureReason}`, metadata);
        this.stopPoll(sessionId);
        return;
      }

      await this.applyUpdate(sessionId, {
        status: "creation_in_progress",
        samsarStatus: status
      }, "SamsarOne processing in progress.", metadata);
    } else {
      await this.applyUpdate(sessionId, {
        status: "creation_in_progress",
        samsarStatus: status as T2VStatusResponse
      }, "Received intermediate status response.", metadata);
    }
  }

  private async applyUpdate(
    sessionId: string,
    update: SessionUpdate,
    message: string,
    metadata: Record<string, unknown>
  ): Promise<SessionRecord> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found.`);
    }

    const timestamp = new Date().toISOString();
    const historyEntry: SessionHistoryEntry = {
      status: update.status ?? session.status,
      message,
      timestamp,
      metadata
    };

    const nextSession: SessionRecord = {
      ...session,
      status: update.status ?? session.status,
      updatedAt: timestamp,
      samsarRequestId: update.samsarRequestId ?? session.samsarRequestId,
      samsarStatus: update.samsarStatus ?? session.samsarStatus,
      resultUrl: update.resultUrl ?? session.resultUrl,
      failureReason: update.failureReason ?? session.failureReason,
      lastPaymentPayload: update.lastPaymentPayload ?? session.lastPaymentPayload,
      requirement: update.requirement ?? session.requirement,
      history: [...session.history, update.historyEntry ?? historyEntry]
    };

    this.sessions.set(sessionId, nextSession);
    await this.postAgentverseUpdate(nextSession, message, {
      ...metadata,
      status: nextSession.status
    });
    return nextSession;
  }

  private async postAgentverseUpdate(
    session: SessionRecord,
    message: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    if (!this.agentverseClient || !this.agentverseAgentId) {
      return;
    }

    try {
      await this.agentverseClient.sendChatMessage(this.agentverseAgentId, message, {
        session,
        ...metadata
      });
    } catch (error) {
      console.error("Failed to post Agentverse update:", error);
    }
  }
}
