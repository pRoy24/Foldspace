import { createFacilitatorConfig, facilitator as defaultFacilitator } from "@coinbase/x402";
import type { FacilitatorConfig, PaymentPayload, PaymentRequirements, SettleResponse, VerifyResponse } from "x402/types";
import { useFacilitator } from "x402/verify";

export interface X402FacilitatorOptions {
  apiKeyId?: string;
  apiKeySecret?: string;
  baseUrlOverride?: FacilitatorConfig["url"];
}

function buildConfig(options: X402FacilitatorOptions = {}): FacilitatorConfig {
  const { apiKeyId, apiKeySecret, baseUrlOverride } = options;
  if (apiKeyId && apiKeySecret) {
    const config = createFacilitatorConfig(apiKeyId, apiKeySecret);
    if (baseUrlOverride) {
      return { ...config, url: baseUrlOverride };
    }
    return config;
  }

  if (baseUrlOverride) {
    return { ...defaultFacilitator, url: baseUrlOverride };
  }

  return defaultFacilitator;
}

export class X402Facilitator {
  private readonly verifyFn: (payload: PaymentPayload, requirements: PaymentRequirements) => Promise<VerifyResponse>;
  private readonly settleFn: (payload: PaymentPayload, requirements: PaymentRequirements) => Promise<SettleResponse>;

  constructor(options: X402FacilitatorOptions = {}) {
    const facilitatorConfig = buildConfig(options);
    const client = useFacilitator(facilitatorConfig);
    this.verifyFn = client.verify;
    this.settleFn = client.settle;
  }

  async verifyPayment(payload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse> {
    return this.verifyFn(payload, requirements);
  }

  async settlePayment(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse> {
    return this.settleFn(payload, requirements);
  }
}
