

import express, { Router, type ErrorRequestHandler, type NextFunction, type Request, type Response } from "express";
import type {
  ListDiscoveryResourcesRequest,
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse
} from "../models";
import {
  type LocalSettlementOptions,
  type LocalVerificationOptions,
  X402FacilitatorService
} from "./X402FacilitatorService";
import { AgentverseClient } from "./AgentverseClient";
import type { AgentverseRegistrationRequest, AgentverseRegistrationResponse } from "../models";

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
  const facilitator = options.facilitatorService ?? new X402FacilitatorService();
  const agentverse = resolveAgentverseClient(options.agentverseClient);

  router.use(express.json());

  createRootRoute(router);
  createHealthRoute(router);

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
