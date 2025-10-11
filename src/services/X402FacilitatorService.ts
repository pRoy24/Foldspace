import { buildFacilitatorConfig } from "../config/x402";
import { env } from "../config/env";
import type {
  FacilitatorConfig,
  ListDiscoveryResourcesRequest,
  ListDiscoveryResourcesResponse,
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  SupportedPaymentKindsResponse,
  VerifyResponse
} from "../models";
import type { X402Credentials, X402ServiceOptions } from "../models";
import { createConnectedClient, createSigner } from "x402/types";
import { useFacilitator } from "x402/verify";
import { settle as settleOnchain, verify as verifyOnchain } from "x402/facilitator";

export interface LocalSettlementOptions {
  privateKey?: string;
  networkOverride?: string;
}

export interface LocalVerificationOptions {
  networkOverride?: string;
}

export class X402FacilitatorService {
  private readonly facilitatorConfig: FacilitatorConfig;
  private readonly verifyWithFacilitator: (payload: PaymentPayload, requirements: PaymentRequirements) => Promise<VerifyResponse>;
  private readonly settleWithFacilitator: (payload: PaymentPayload, requirements: PaymentRequirements) => Promise<SettleResponse>;
  private readonly listWithFacilitator: (request?: ListDiscoveryResourcesRequest) => Promise<ListDiscoveryResourcesResponse>;
  private readonly supportedWithFacilitator: () => Promise<SupportedPaymentKindsResponse>;
  private readonly defaultNetwork: string;
  private readonly signerPrivateKey?: string;

  constructor(options: X402ServiceOptions = {}) {
    const credentials = options.credentials ?? this.resolveCredentialsFromEnv();
    this.defaultNetwork = options.defaultNetwork ?? options.signer?.network ?? env.x402DefaultNetwork ?? "base-sepolia";
    this.signerPrivateKey = options.signer?.privateKey ?? env.x402PrivateKey;
    this.facilitatorConfig = buildFacilitatorConfig({
      apiKeyId: credentials?.apiKeyId,
      apiKeySecret: credentials?.apiKeySecret
    });

    const facilitatorClient = useFacilitator(this.facilitatorConfig);
    this.verifyWithFacilitator = facilitatorClient.verify;
    this.settleWithFacilitator = facilitatorClient.settle;
    this.listWithFacilitator = facilitatorClient.list;
    this.supportedWithFacilitator = facilitatorClient.supported;
  }

  getFacilitatorConfig(): FacilitatorConfig {
    return this.facilitatorConfig;
  }

  async verifyPayment(payload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse> {
    return this.verifyWithFacilitator(payload, requirements);
  }

  async settlePayment(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse> {
    return this.settleWithFacilitator(payload, requirements);
  }

  async listResources(request?: ListDiscoveryResourcesRequest): Promise<ListDiscoveryResourcesResponse> {
    return this.listWithFacilitator(request);
  }

  async supportedPaymentKinds(): Promise<SupportedPaymentKindsResponse> {
    return this.supportedWithFacilitator();
  }

  async verifyOnchain(payload: PaymentPayload, requirements: PaymentRequirements, options: LocalVerificationOptions = {}): Promise<VerifyResponse> {
    const network = options.networkOverride ?? requirements.network ?? this.defaultNetwork;
    const client = createConnectedClient(network);
    return verifyOnchain(client, payload, requirements);
  }

  async settleOnchain(payload: PaymentPayload, requirements: PaymentRequirements, options: LocalSettlementOptions = {}): Promise<SettleResponse> {
    const network = options.networkOverride ?? requirements.network ?? this.defaultNetwork;
    const signer = await createSigner(network, this.resolvePrivateKey(options.privateKey));
    return settleOnchain(signer, payload, requirements);
  }

  private resolveCredentialsFromEnv(): X402Credentials | undefined {
    if (env.cdpApiKeyId && env.cdpApiKeySecret) {
      return {
        apiKeyId: env.cdpApiKeyId,
        apiKeySecret: env.cdpApiKeySecret
      };
    }
    return undefined;
  }

  private resolvePrivateKey(override?: string): string {
    const privateKey = override ?? this.signerPrivateKey;
    if (!privateKey) {
      throw new Error("Missing X402 signer private key. Provide via X402_SERVICE options or X402_PRIVATE_KEY env variable.");
    }
    return privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  }
}
