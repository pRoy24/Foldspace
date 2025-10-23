import { randomUUID } from "node:crypto";
import { clearInterval, setInterval } from "node:timers";
import {
  createPublicClient,
  getAddress,
  http,
  parseAbiItem,
  type Address,
  type Chain,
  type Hash,
  type PublicClient
} from "viem";
import {
  avalanche,
  avalancheFuji,
  base,
  baseSepolia,
  iotex,
  peaq,
  polygon,
  polygonAmoy,
  sei,
  seiTestnet
} from "viem/chains";

import {
  buildT2VCreateRequest,
  type T2VCreateVideoInput,
  type T2VCreateVideoResponse
} from "../models";
import type { PaymentRequirements } from "../models";
import { buildT2VApiConfig } from "../config/t2v";
import { T2VApiClient } from "./T2VApiClient";
import type { AgentverseClient } from "./AgentverseClient";

const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

type SupportedNetwork = Extract<
  PaymentRequirements["network"],
  | "base-sepolia"
  | "base"
  | "avalanche-fuji"
  | "avalanche"
  | "iotex"
  | "polygon"
  | "polygon-amoy"
  | "sei"
  | "sei-testnet"
  | "peaq"
>;

const NETWORK_TO_CHAIN: Record<SupportedNetwork, Chain> = {
  "base-sepolia": baseSepolia,
  base,
  "avalanche-fuji": avalancheFuji,
  avalanche,
  iotex,
  polygon,
  "polygon-amoy": polygonAmoy,
  sei,
  "sei-testnet": seiTestnet,
  peaq
};

export interface QuoteSummary {
  asset: string;
  network: PaymentRequirements["network"];
  totalCredits: number;
  durationSeconds: number;
  imageModel: string;
  videoModel: string;
  rateCreditsPerSecond: number;
  pricePerCreditMinorUnits: string;
  pricePerCreditUsdc: string;
  totalMinorUnits: string;
  totalUsdc: string;
}

interface PaymentSession {
  id: string;
  requirement: PaymentRequirements;
  quote: QuoteSummary;
  input: T2VCreateVideoInput;
  status: "pending" | "processing" | "completed" | "failed";
  transactionHash?: Hash;
  error?: string;
  response?: T2VCreateVideoResponse;
}

interface NetworkState {
  client: PublicClient;
  lastBlock: bigint;
  polling: boolean;
  assets: Set<Address>;
  sessionsByAsset: Map<Address, Set<string>>;
  timer?: NodeJS.Timeout;
  processedTxHashes: Set<Hash>;
}

export interface PaymentRegistrationResult {
  sessionId: string;
}

export interface PaymentRegistrationInput {
  requirement: PaymentRequirements;
  quote: QuoteSummary;
  input: T2VCreateVideoInput;
}

export interface PaymentListenerOptions {
  pollIntervalMs?: number;
  agentverseClient?: AgentverseClient;
  agentverseAgentId?: string;
}

export class PaymentListenerService {
  private readonly pollIntervalMs: number;
  private readonly apiClient: T2VApiClient;
  private readonly agentverseClient?: AgentverseClient;
  private readonly agentverseAgentId?: string;
  private readonly sessions = new Map<string, PaymentSession>();
  private readonly networkStates = new Map<SupportedNetwork, NetworkState>();

  constructor(options: PaymentListenerOptions = {}) {
    this.pollIntervalMs = options.pollIntervalMs ?? 5_000;
    const apiConfig = buildT2VApiConfig();
    this.apiClient = new T2VApiClient(apiConfig);
    this.agentverseClient = options.agentverseClient;
    this.agentverseAgentId = options.agentverseAgentId;
  }

  async registerPayment(input: PaymentRegistrationInput): Promise<PaymentRegistrationResult> {
    const network = input.requirement.network as SupportedNetwork;
    if (!(network in NETWORK_TO_CHAIN)) {
      throw new Error(`Unsupported network for payment monitoring: ${input.requirement.network}`);
    }

    const sessionId = randomUUID();
    const session: PaymentSession = {
      id: sessionId,
      requirement: input.requirement,
      quote: input.quote,
      input: input.input,
      status: "pending"
    };

    this.sessions.set(sessionId, session);

    const normalizedAsset = this.normalizeAddress(input.requirement.asset);
    const state = await this.ensureNetworkState(network);
    state.assets.add(normalizedAsset);

    if (!state.sessionsByAsset.has(normalizedAsset)) {
      state.sessionsByAsset.set(normalizedAsset, new Set());
    }
    state.sessionsByAsset.get(normalizedAsset)?.add(sessionId);

    await this.notifyAgentverse(session, "Waiting for payment confirmation.", {
      status: "waiting_for_payment",
      network,
      asset: normalizedAsset,
      amount: input.requirement.maxAmountRequired
    });

    await this.pollNetwork(network).catch((error: unknown) => {
      console.error("Initial payment poll failed:", error);
    });

    return { sessionId };
  }

  private async ensureNetworkState(network: SupportedNetwork): Promise<NetworkState> {
    const existing = this.networkStates.get(network);
    if (existing) {
      return existing;
    }

    const chain = NETWORK_TO_CHAIN[network];
    const client = createPublicClient({
      chain,
      transport: http()
    });

    const latestBlock = await client.getBlockNumber();
    const initialBlock = latestBlock > 0n ? latestBlock - 1n : latestBlock;

    const state: NetworkState = {
      client,
      lastBlock: initialBlock,
      polling: false,
      assets: new Set<Address>(),
      sessionsByAsset: new Map<Address, Set<string>>(),
      processedTxHashes: new Set<Hash>()
    };

    state.timer = setInterval(() => {
      this.pollNetwork(network).catch((error: unknown) => {
        console.error(`Payment poll failed for network ${network}:`, error);
      });
    }, this.pollIntervalMs);

    this.networkStates.set(network, state);
    return state;
  }

  private async pollNetwork(network: SupportedNetwork): Promise<void> {
    const state = this.networkStates.get(network);
    if (!state || state.polling) {
      return;
    }

    if (state.assets.size === 0) {
      return;
    }

    state.polling = true;
    try {
      const latestBlock = await state.client.getBlockNumber();
      if (latestBlock <= state.lastBlock) {
        return;
      }

      const fromBlock = state.lastBlock + 1n;
      const toBlock = latestBlock;
      state.lastBlock = latestBlock;

      const logs = await state.client.getLogs({
        address: Array.from(state.assets),
        event: transferEvent,
        fromBlock,
        toBlock
      });

      for (const log of logs) {
        const transactionHash = log.transactionHash;
        if (transactionHash && state.processedTxHashes.has(transactionHash)) {
          continue;
        }

        if (transactionHash) {
          state.processedTxHashes.add(transactionHash);
        }

        const assetAddress = this.normalizeAddress(log.address);
        const sessionsForAsset = state.sessionsByAsset.get(assetAddress);
        if (!sessionsForAsset?.size) {
          continue;
        }

        const recipientArg = log.args.to;
        if (!recipientArg) {
          continue;
        }
        const toAddress = this.normalizeAddress(recipientArg as Address);

        const rawValue = log.args.value;
        const value = typeof rawValue === "bigint" ? rawValue : BigInt(rawValue ?? 0);

        for (const sessionId of Array.from(sessionsForAsset)) {
          const session = this.sessions.get(sessionId);
          if (!session || session.status !== "pending") {
            continue;
          }

          const requirement = session.requirement;
          const payTo = this.safeNormalize(requirement.payTo);
          if (!payTo || payTo !== toAddress) {
            continue;
          }

          const requiredAmount = BigInt(requirement.maxAmountRequired);
          if (value < requiredAmount) {
            continue;
          }

          await this.handlePaymentDetected(session, transactionHash, network, assetAddress);
        }
      }
    } finally {
      state.polling = false;
    }
  }

  private async handlePaymentDetected(
    session: PaymentSession,
    transactionHash: Hash | undefined,
    network: SupportedNetwork,
    assetAddress: Address
  ): Promise<void> {
    session.status = "processing";
    session.transactionHash = transactionHash;

    await this.notifyAgentverse(session, "Payment detected. Submitting video request.", {
      status: "payment_received",
      network,
      asset: assetAddress,
      transactionHash
    });

    try {
      const requestPayload = buildT2VCreateRequest(session.input);
      const response = await this.apiClient.createVideo(requestPayload);
      session.response = response;

      if (response && typeof response === "object" && "request_id" in response && response.request_id) {
        session.status = "completed";
        await this.notifyAgentverse(session, `Request submitted successfully. Request ID: ${response.request_id}`, {
          status: "request_submitted",
          network,
          asset: assetAddress,
          transactionHash,
          requestId: response.request_id
        });
        this.cleanupSession(session, network, assetAddress);
        return;
      }

      const failureMessage =
        response && typeof response === "object" && "message" in response && typeof response.message === "string"
          ? response.message
          : "Unknown response received from SamsarOne.";
      session.status = "failed";
      session.error = failureMessage;
      await this.notifyAgentverse(session, `Failed to submit video request: ${failureMessage}`, {
        status: "submission_failed",
        network,
        asset: assetAddress,
        transactionHash
      });
      this.cleanupSession(session, network, assetAddress);
    } catch (error) {
      session.status = "failed";
      session.error = error instanceof Error ? error.message : String(error);
      console.error("Failed to submit T2V request after payment:", error);
      await this.notifyAgentverse(session, `Failed to submit video request: ${session.error}`, {
        status: "submission_failed",
        network,
        asset: assetAddress,
        transactionHash
      });
      this.cleanupSession(session, network, assetAddress);
    }
  }

  private cleanupSession(session: PaymentSession, network: SupportedNetwork, assetAddress: Address): void {
    this.sessions.delete(session.id);
    const state = this.networkStates.get(network);
    if (!state) {
      return;
    }

    const sessionsForAsset = state.sessionsByAsset.get(assetAddress);
    sessionsForAsset?.delete(session.id);
    if (sessionsForAsset && sessionsForAsset.size === 0) {
      state.sessionsByAsset.delete(assetAddress);
      state.assets.delete(assetAddress);
    }

    if (state.assets.size === 0 && state.timer) {
      clearInterval(state.timer);
      this.networkStates.delete(network);
    }
  }

  private normalizeAddress(address: Address | string): Address {
    return getAddress(address as Address);
  }

  private safeNormalize(value: string | undefined): Address | undefined {
    if (!value) {
      return undefined;
    }

    try {
      return this.normalizeAddress(value);
    } catch (_error) {
      return undefined;
    }
  }

  private async notifyAgentverse(
    session: PaymentSession,
    message: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    if (!this.agentverseClient || !this.agentverseAgentId) {
      return;
    }

    try {
      await this.agentverseClient.sendChatMessage(this.agentverseAgentId, message, {
        paymentSessionId: session.id,
        status: session.status,
        ...metadata
      });
    } catch (error) {
      console.error("Failed to post Agentverse chat update:", error);
    }
  }
}
