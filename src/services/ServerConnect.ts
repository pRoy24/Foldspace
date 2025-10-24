import express, { Router, type ErrorRequestHandler, type NextFunction, type Request, type Response } from "express";
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
  T2V_VIDEO_MODELS
} from "../models";
import {
  type LocalSettlementOptions,
  type LocalVerificationOptions,
  X402FacilitatorService
} from "./X402FacilitatorService";
import { AgentverseClient } from "./AgentverseClient";
import type { AgentverseRegistrationRequest, AgentverseRegistrationResponse } from "../models";
import { env } from "../config/env";
import { SessionService, type PaymentConfirmationOptions } from "./SessionService";

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
   * Service that manages session lifecycle and communicates with SamsarOne.
   */
  sessionService?: SessionService;
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

interface PaymentConfirmationRequestBody {
  payload?: PaymentPayload;
  requirements?: PaymentRequirements;
  options?: PaymentConfirmationOptions;
}

interface ChatRequestBody {
  sender?: string;
  message?: unknown;
}

const T2V_TONE_VALUES: readonly T2VTone[] = ["grounded", "cinematic"] as const;
const T2V_ASPECT_RATIO_VALUES: readonly T2VAspectRatio[] = ["9:16", "16:9"] as const;

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
      res.json({ message: "Foldspace Protocol chat adapter is running." });
    })
  );
}

function createStatusRoute(router: Router): void {
  router.get(
    "/status",
    asyncHandler(async (_req, res) => {
      res.json({ status: "OK - Agent is running" });
    })
  );
}

function createChatRoute(router: Router): void {
  router.post(
    "/chat",
    asyncHandler(async (req, res) => {
      const { sender, message } = (req.body ?? {}) as ChatRequestBody;
      const text = typeof message === "string" ? message : JSON.stringify(message);

      if (text && text.length > 0) {
        console.log(`Received chat message${sender ? ` from ${sender}` : ""}: ${text}`);
      } else {
        console.log(`Received chat request${sender ? ` from ${sender}` : ""} with no message payload.`);
      }

      res.json({ message: "Thanks for the message!" });
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

function createPricingRoute(router: Router, sessionService: SessionService | undefined): void {
  const handler = asyncHandler(async (req, res) => {
    if (!sessionService) {
      res.status(503).json({ error: "T2V session service is not configured." });
      return;
    }

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
      const { session, requirement, quote, x402Version } = await sessionService.createSession(input);

      res
        .status(402)
        .set({
          "Content-Type": "application/json",
          "Access-Control-Allow-Headers": "Content-Type, X-PAYMENT",
          "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE"
        })
        .json({
          x402Version,
          accepts: [requirement],
          quote,
          sessionId: session.id,
          sessionStatus: session.status,
          session
        });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.get("/request_pricing", handler);
  router.post("/request_pricing", handler);
}

function createSessionRoutes(router: Router, sessionService: SessionService | undefined): void {
  router.get(
    "/sessions/:sessionId",
    asyncHandler(async (req, res) => {
      if (!sessionService) {
        res.status(503).json({ error: "T2V session service is not configured." });
        return;
      }

      const sessionId = req.params.sessionId;
      const session = await sessionService.getSession(sessionId);
      if (!session) {
        res.status(404).json({ error: `Session ${sessionId} not found.` });
        return;
      }
      res.json({ session });
    })
  );

  router.post(
    "/sessions/:sessionId/payment",
    asyncHandler(async (req, res) => {
      if (!sessionService) {
        res.status(503).json({ error: "T2V session service is not configured." });
        return;
      }

      const sessionId = req.params.sessionId;
      const body = (req.body ?? {}) as PaymentConfirmationRequestBody;
      if (!body.payload || !body.requirements) {
        res.status(400).json({ error: "Missing payment payload or requirements in request body." });
        return;
      }

      try {
        const session = await sessionService.confirmPayment(sessionId, body.payload, body.requirements, body.options);
        res.json({ session });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const normalized = message.toLowerCase();
        const status = normalized.includes("not found") ? 404 : normalized.includes("mismatch") ? 400 : 500;
        res.status(status).json({ error: message });
      }
    })
  );
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
  const sessionService = resolveSessionService(options.sessionService, agentverse, chatAgentId);

  router.use(express.json());

  createRootRoute(router);
  createHealthRoute(router);
  createStatusRoute(router);
  createChatRoute(router);
  createPricingRoute(router, sessionService);
  createSessionRoutes(router, sessionService);

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

function resolveSessionService(
  service: SessionService | undefined,
  agentverse: AgentverseClient | undefined,
  agentverseAgentId: string | undefined
): SessionService | undefined {
  if (service) {
    return service;
  }

  try {
    return new SessionService({
      agentverseClient: agentverse,
      agentverseAgentId
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Skipping T2V session service initialization: ${message}`);
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
