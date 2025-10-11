import { createCdpAuthHeaders, createFacilitatorConfig, facilitator as defaultFacilitator } from "@coinbase/x402";
import type { CreateHeaders } from "x402/verify";
import type { FacilitatorConfig, Resource } from "x402/types";
import { env } from "./env";

export interface X402FacilitatorOptions {
  apiKeyId?: string;
  apiKeySecret?: string;
  baseUrlOverride?: string;
}

function isResourceUrl(value: string): value is Resource {
  return value.includes("://");
}

function withBaseUrlOverride(config: FacilitatorConfig, baseUrl?: string): FacilitatorConfig {
  if (!baseUrl || !isResourceUrl(baseUrl)) {
    return config;
  }

  return {
    ...config,
    url: baseUrl
  };
}

export function buildFacilitatorConfig(options: X402FacilitatorOptions = {}): FacilitatorConfig {
  const apiKeyId = options.apiKeyId ?? env.cdpApiKeyId;
  const apiKeySecret = options.apiKeySecret ?? env.cdpApiKeySecret;

  if (!apiKeyId || !apiKeySecret) {
    return withBaseUrlOverride(defaultFacilitator, options.baseUrlOverride ?? env.coinbaseFacilitatorUrl);
  }

  const config = createFacilitatorConfig(apiKeyId, apiKeySecret);
  return withBaseUrlOverride(config, options.baseUrlOverride ?? env.coinbaseFacilitatorUrl);
}

export function buildAuthHeaderFactory(options: X402FacilitatorOptions = {}): CreateHeaders {
  const apiKeyId = options.apiKeyId ?? env.cdpApiKeyId;
  const apiKeySecret = options.apiKeySecret ?? env.cdpApiKeySecret;
  return createCdpAuthHeaders(apiKeyId, apiKeySecret);
}
