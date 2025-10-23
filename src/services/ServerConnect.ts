

import express, { Router, type ErrorRequestHandler, type NextFunction, type Request, type Response } from "express";
import { x402Versions } from "x402/types";
import type {
  ListDiscoveryResourcesRequest,
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
  T2VAspectRatio,
  T2VCreateVideoInput,
  T2VTone,
  T2VImageModelKey,
  T2VVideoModelKey
} from "../models";
import {
  T2V_IMAGE_MODELS,
  T2V_VIDEO_MODELS,
  T2V_API_BASE_URL,
  calculateT2VCostBreakdown
} from "../models";
import {
  type LocalSettlementOptions,
  type LocalVerificationOptions,
  X402FacilitatorService
} from "./X402FacilitatorService";
import { AgentverseClient } from "./AgentverseClient";
import type { AgentverseRegistrationRequest, AgentverseRegistrationResponse } from "../models";
import { buildT2VPaymentConfig, type T2VPaymentConfig } from "../config/t2v";
import { env } from "../config/env";
import { PaymentListenerService, type QuoteSummary } from "./PaymentListenerService";

export interface WebServiceConnectOptions {
  /**
   * Optional router to mount the routes on. When omitted a new Router instance is created.
   */
  router?: Router;
  /**
   * Service instance used to execute facilitator actions. A new instance is created when omitted.
   */
  facilitatorService?: X402FacilitatorService;
  /**
   * Client instance used to communicate with the Agentverse API. A new instance is created when omitted.
   */
  agentverseClient?: AgentverseClient;
  /**
   * Service that monitors on-chain payments and dispatches internal follow-up actions.
   */
  paymentListenerService?: PaymentListenerService;
  /**
   * Override for the Agentverse chat agent ID. Defaults to AGENTVERSE_CHAT_AGENT_ID when omitted.
   */
  agentverseChatAgentId?: string;
  /**
   * Require the request to include an `Authorization` header before accessing facilitator routes.
   * The `/health` endpoint remains public.
   */
  requireAuthorization?: boolean;
}

interface VerifyRequestBody {
  payload?: PaymentPayload;
  requirements?: PaymentRequirements;
  options?: LocalVerificationOptions;
}

interface SettleRequestBody {
  payload?: PaymentPayload;
  requirements?: PaymentRequirements;
  options?: LocalSettlementOptions;
}

interface ListResourcesRequestBody {
  request?: ListDiscoveryResourcesRequest;
}

interface AgentverseRegisterRequestBody {
  address?: string;
  challenge?: string;
  challengeResponse?: string;
  challenge_response?: string;
  agentType?: AgentverseRegistrationRequest["agentType"];
  agent_type?: AgentverseRegistrationRequest["agentType"];
  endpoint?: string;
  prefix?: AgentverseRegistrationRequest["prefix"];
}

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function asyncHandler(handler: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

type VerifyRequestBodyValidated = VerifyRequestBody & {
  payload: PaymentPayload;
  requirements: PaymentRequirements;
};

type SettleRequestBodyValidated = SettleRequestBody & {
  payload: PaymentPayload;
  requirements: PaymentRequirements;
};

interface PricingRequestBody {
  input?: unknown;
}

const T2V_TONE_VALUES: readonly T2VTone[] = ["grounded", "cinematic"] as const;
const T2V_ASPECT_RATIO_VALUES: readonly T2VAspectRatio[] = ["9:16", "16:9"] as const;
const USDC_DECIMALS = 6n;
const DEFAULT_PAYMENT_DESCRIPTION = "SamsarOne T2V generation";
const [DEFAULT_X402_VERSION] = x402Versions;

function validateVerifyBody(body: VerifyRequestBody): asserts body is VerifyRequestBodyValidated {
  if (!body.payload || !body.requirements) {
    throw new Error("Missing payment payload or requirements in request body.");
  }
}

function validateSettleBody(body: SettleRequestBody): asserts body is SettleRequestBodyValidated {
  if (!body.payload || !body.requirements) {
    throw new Error("Missing payment payload or requirements in request body.");
  }
}

function createHealthRoute(router: Router): void {
  router.get(
    "/health",
    asyncHandler(async (_req, res) => {
      res.json({ status: "ok" });
    })
  );
}

function createRootRoute(router: Router): void {
  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      res.json({ message: "Foldspace Protocol proxy is up." });
    })
  );
}

function isStringRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertAllowedValue<TValue extends string>(
  value: unknown,
  allowed: readonly TValue[],
  field: string
): asserts value is TValue {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new Error(`Invalid ${field}. Expected one of: ${(allowed as readonly string[]).join(", ")}`);
  }
}

function parseCreateVideoInput(body: PricingRequestBody): T2VCreateVideoInput {
  if (!isStringRecord(body)) {
    throw new Error("Request body must be a JSON object.");
  }
  if (!isStringRecord(body.input)) {
    throw new Error("Missing Samsar.One-compatible payload under 'input'.");
  }

  const input = body.input as Record<string, unknown>;
  const prompt = input.prompt;
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new Error("Input.prompt is required and must be a non-empty string.");
  }

  const sanitized: T2VCreateVideoInput = {
    prompt: prompt.trim()
  };

  if ("duration" in input) {
    const { duration } = input;
    if (typeof duration !== "number" || Number.isNaN(duration)) {
      throw new Error("Input.duration must be a number when provided.");
    }
    sanitized.duration = duration;
  }

  if ("image_model" in input) {
    const imageModel = input.image_model;
    assertAllowedValue<T2VImageModelKey>(imageModel, T2V_IMAGE_MODELS, "input.image_model");
    sanitized.image_model = imageModel;
  }

  if ("video_model" in input) {
    const videoModel = input.video_model;
    assertAllowedValue<T2VVideoModelKey>(videoModel, T2V_VIDEO_MODELS, "input.video_model");
    sanitized.video_model = videoModel;
  }

  if ("tone" in input) {
    const tone = input.tone;
    assertAllowedValue<T2VTone>(tone, T2V_TONE_VALUES, "input.tone");
    sanitized.tone = tone;
  }

  if ("aspect_ratio" in input) {
    const aspectRatio = input.aspect_ratio;
    assertAllowedValue<T2VAspectRatio>(aspectRatio, T2V_ASPECT_RATIO_VALUES, "input.aspect_ratio");
    sanitized.aspect_ratio = aspectRatio;
  }

  return sanitized;
}

function formatMinorUnitsToUsdc(minorUnits: bigint): string {
  const sign = minorUnits < 0n ? "-" : "";
  const absolute = minorUnits < 0n ? -minorUnits : minorUnits;
  const base = 10n ** USDC_DECIMALS;
  const whole = absolute / base;
  const fraction = absolute % base;
  const fractionText = fraction.toString().padStart(Number(USDC_DECIMALS), "0");
  return `${sign}${whole.toString()}.${fractionText}`;
}

function extractPricingRequestBody(req: Request): PricingRequestBody {
  if (req.method === "GET") {
    const { input: rawInput } = req.query as Record<string, unknown>;
    if (rawInput === undefined) {
      throw new Error("Missing 'input' query parameter.");
    }
    if (Array.isArray(rawInput)) {
      throw new Error("Query parameter 'input' must only be provided once.");
    }
    if (typeof rawInput !== "string" || rawInput.trim().length === 0) {
      throw new Error("Query parameter 'input' must be a non-empty JSON string.");
    }
    try {
      return { input: JSON.parse(rawInput) };
    } catch {
      throw new Error("Query parameter 'input' must be valid JSON.");
    }
  }

  return (req.body ?? {}) as PricingRequestBody;
}

function resolveT2VResource(paymentConfig: T2VPaymentConfig): string {
  if (paymentConfig.resource) {
    return paymentConfig.resource;
  }
  const baseUrl = env.t2vBaseUrl ?? T2V_API_BASE_URL;
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("create", normalizedBase).toString();
}

function createPricingRoute(router: Router, paymentListener: PaymentListenerService): void {
  const handler = asyncHandler(async (req, res) => {
    if (req.method === "GET") {
      const { input: rawInput } = req.query as Record<string, unknown>;
      if (rawInput === undefined) {
        res.json({
          message: "Request pricing by providing a Samsar.One-compatible payload via '?input=' or POSTing the same payload in the request body."
        });
        return;
      }
    }

    let input: T2VCreateVideoInput;
    try {
      input = parseCreateVideoInput(extractPricingRequestBody(req));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
      return;
    }

    try {
      const paymentConfig = buildT2VPaymentConfig();
      const breakdown = calculateT2VCostBreakdown(input);
      const pricePerCreditMinorUnits = paymentConfig.pricePerCreditMinorUnits;
      const totalMinorUnits = BigInt(breakdown.totalCredits) * pricePerCreditMinorUnits;

      const quote: QuoteSummary = {
        asset: paymentConfig.asset,
        network: paymentConfig.network,
        totalCredits: breakdown.totalCredits,
        durationSeconds: breakdown.durationSeconds,
        imageModel: breakdown.imageModel,
        videoModel: breakdown.videoModel,
        rateCreditsPerSecond: breakdown.rateCreditsPerSecond,
        pricePerCreditMinorUnits: pricePerCreditMinorUnits.toString(),
        pricePerCreditUsdc: formatMinorUnitsToUsdc(pricePerCreditMinorUnits),
        totalMinorUnits: totalMinorUnits.toString(),
        totalUsdc: formatMinorUnitsToUsdc(totalMinorUnits)
      };

      const requirement: PaymentRequirements = {
        scheme: "exact",
        network: paymentConfig.network,
        maxAmountRequired: quote.totalMinorUnits,
        resource: resolveT2VResource(paymentConfig),
        description: paymentConfig.description ?? DEFAULT_PAYMENT_DESCRIPTION,
        mimeType: paymentConfig.mimeType ?? "application/json",
        payTo: paymentConfig.payTo,
        maxTimeoutSeconds: paymentConfig.maxTimeoutSeconds ?? 600,
        asset: paymentConfig.asset,
        extra: { ...quote }
      };

      const registration = await paymentListener.registerPayment({
        requirement,
        quote,
        input
      });

      res
        .status(402)
        .set({
          "Content-Type": "application/json",
          "Access-Control-Allow-Headers": "Content-Type, X-PAYMENT",
          "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE"
        })
        .json({
          x402Version: DEFAULT_X402_VERSION,
          accepts: [requirement],
          quote,
          paymentSessionId: registration.sessionId
        });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.get("/request_pricing", handler);
  router.post("/request_pricing", handler);
}

function createAuthorizationGuard(router: Router): void {
  router.use((req, res, next) => {
    if (!req.headers.authorization) {
      res.status(401).json({ error: "Missing Authorization header." });
      return;
    }
    next();
  });
}

function createFacilitatorRoutes(router: Router, facilitator: X402FacilitatorService): void {
  router.post(
    "/facilitator/resources",
    asyncHandler(async (req, res) => {
      const { request } = (req.body ?? {}) as ListResourcesRequestBody;
      const response = await facilitator.listResources(request);
      res.json(response);
    })
  );

  router.get(
    "/facilitator/supported",
    asyncHandler(async (_req, res) => {
      const response = await facilitator.supportedPaymentKinds();
      res.json(response);
    })
  );

  router.post(
    "/payments/verify",
    asyncHandler(async (req, res) => {
      const body = (req.body ?? {}) as VerifyRequestBody;
      validateVerifyBody(body);
      const response: VerifyResponse = await facilitator.verifyPayment(body.payload, body.requirements);
      res.json(response);
    })
  );

  router.post(
    "/payments/settle",
    asyncHandler(async (req, res) => {
      const body = (req.body ?? {}) as SettleRequestBody;
      validateSettleBody(body);
      const response: SettleResponse = await facilitator.settlePayment(body.payload, body.requirements);
      res.json(response);
    })
  );

  router.post(
    "/payments/verify/onchain",
    asyncHandler(async (req, res) => {
      const body = (req.body ?? {}) as VerifyRequestBody;
      validateVerifyBody(body);
      const response: VerifyResponse = await facilitator.verifyOnchain(body.payload, body.requirements, body.options);
      res.json(response);
    })
  );

  router.post(
    "/payments/settle/onchain",
    asyncHandler(async (req, res) => {
      const body = (req.body ?? {}) as SettleRequestBody;
      validateSettleBody(body);
      const response: SettleResponse = await facilitator.settleOnchain(body.payload, body.requirements, body.options);
      res.json(response);
    })
  );
}

const defaultErrorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = typeof err.status === "number" ? err.status : 500;
  const message = err instanceof Error ? err.message : "Unexpected error occurred.";
  res.status(status).json({ error: message });
};

// authenticated requests only
export function connectToWebService(options: WebServiceConnectOptions = {}): Router {
  const router = options.router ?? express.Router();
  const agentverse = resolveAgentverseClient(options.agentverseClient);
  const facilitator = options.facilitatorService ?? new X402FacilitatorService();
  const chatAgentId = options.agentverseChatAgentId ?? env.agentverseChatAgentId;
  const paymentListener =
    options.paymentListenerService ??
    new PaymentListenerService({
      agentverseClient: agentverse,
      agentverseAgentId: chatAgentId
    });

  router.use(express.json());

  createRootRoute(router);
  createHealthRoute(router);
  createPricingRoute(router, paymentListener);

  if (options.requireAuthorization ?? true) {
    createAuthorizationGuard(router);
  }

  createFacilitatorRoutes(router, facilitator);
  if (agentverse) {
    createAgentverseRoutes(router, agentverse);
  }
  router.use(defaultErrorHandler);
  return router;
}

function resolveAgentverseClient(client?: AgentverseClient): AgentverseClient | undefined {
  if (client) {
    return client;
  }

  try {
    return new AgentverseClient();
  } catch (error) {
    if (process.env.AGENTVERSE_API_KEY) {
      throw error;
    }
    return undefined;
  }
}

function validateAgentverseBody(body: AgentverseRegisterRequestBody): AgentverseRegistrationRequest {
  const challengeResponse = body.challengeResponse ?? body.challenge_response;
  const agentType = body.agentType ?? body.agent_type;

  if (!body.address) {
    throw new Error("Missing Agentverse registration field: address");
  }
  if (!body.challenge) {
    throw new Error("Missing Agentverse registration field: challenge");
  }
  if (!challengeResponse) {
    throw new Error("Missing Agentverse registration field: challengeResponse");
  }

  return {
    address: body.address,
    challenge: body.challenge,
    challengeResponse,
    agentType,
    endpoint: body.endpoint,
    prefix: body.prefix
  };
}

function createAgentverseRoutes(router: Router, agentverse: AgentverseClient): void {
  router.post(
    "/agentverse/register",
    asyncHandler(async (req, res) => {
      const request = validateAgentverseBody((req.body ?? {}) as AgentverseRegisterRequestBody);
      const response: AgentverseRegistrationResponse = await agentverse.registerAgent(request);
      res.json(response);
    })
  );
}
