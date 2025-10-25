import express, { type Application, type NextFunction, type Request, type Response } from "express";

import { config } from "./config";
import { HttpError, isHttpError } from "./errors";
import { PaymentCoordinator } from "./services/PaymentCoordinator";
import { SamsarClient } from "./services/SamsarClient";
import { X402Facilitator } from "./services/X402Facilitator";
import { FileSessionStore } from "./storage/FileSessionStore";
import type { CreateJobPayload, WalletEventPayload } from "./types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toCreatePayload(body: unknown): CreateJobPayload {
  return isPlainObject(body) ? (body as CreateJobPayload) : {};
}

function toWalletEvent(body: unknown): WalletEventPayload {
  if (!isPlainObject(body)) {
    throw new HttpError(400, "Wallet events must be JSON objects");
  }
  const { sessionId, paymentPayload, paymentRequirements, metadata, skipSettlement } = body;
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    throw new HttpError(400, "sessionId is required");
  }
  if (!paymentPayload || typeof paymentPayload !== "object") {
    throw new HttpError(400, "paymentPayload is required");
  }
  if (paymentRequirements !== undefined && !isPlainObject(paymentRequirements)) {
    throw new HttpError(400, "paymentRequirements must be an object when provided");
  }
  return {
    sessionId,
    paymentPayload: paymentPayload as WalletEventPayload["paymentPayload"],
    paymentRequirements: paymentRequirements as WalletEventPayload["paymentRequirements"],
    metadata: isPlainObject(metadata) ? metadata : undefined,
    skipSettlement: typeof skipSettlement === "boolean" ? skipSettlement : undefined
  };
}

function requireWebhookSecret(req: Request): void {
  if (!config.walletWebhookSecret) {
    return;
  }
  const provided = req.get("x-wallet-secret");
  if (!provided || provided !== config.walletWebhookSecret) {
    throw new HttpError(401, "Unauthorized wallet webhook request");
  }
}

function asyncHandler<T extends (req: Request, res: Response, next: NextFunction) => Promise<unknown>>(handler: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };
}

export async function createApp(): Promise<Application> {
  const store = new FileSessionStore(config.databasePath);
  await store.init();

  const samsarClient = new SamsarClient(config.samsar);
  const facilitator = new X402Facilitator(config.facilitator);
  const coordinator = new PaymentCoordinator({
    store,
    x402Version: config.x402Version,
    payment: config.payment,
    samsarClient,
    facilitator,
    behavior: config.behavior
  });

  const app = express();
  app.use(express.json({ limit: config.expressBodyLimit }));

  app.get("/", (_req, res) => {
    res.json({ status: "ok", service: "Foldspace proxy" });
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post(
    "/create",
    asyncHandler(async (req, res) => {
      const payload = toCreatePayload(req.body);
      const response = await coordinator.createPaywalledSession(payload);
      res.setHeader("X-Payment-Required", "x402");
      res.status(402).json(response);
    })
  );

  app.post(
    "/wallet/events",
    asyncHandler(async (req, res) => {
      requireWebhookSecret(req);
      const event = toWalletEvent(req.body);
      const session = await coordinator.recordWalletEvent(event);
      res.json(session);
    })
  );

  app.get(
    "/sessions",
    asyncHandler(async (_req, res) => {
      const sessions = await coordinator.listSessions();
      res.json({ sessions });
    })
  );

  app.get(
    "/sessions/:sessionId",
    asyncHandler(async (req, res) => {
      const session = await coordinator.getSession(req.params.sessionId);
      if (!session) {
        throw new HttpError(404, "Session not found");
      }
      res.json(session);
    })
  );

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (isHttpError(error)) {
      res.status(error.statusCode).json({ message: error.message, details: error.details });
      return;
    }
    console.error("Unhandled error", error);
    res.status(500).json({ message: "Internal server error" });
  });

  return app;
}
