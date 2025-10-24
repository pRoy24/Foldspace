import { randomUUID } from "node:crypto";

import express, { Router, type ErrorRequestHandler, type NextFunction, type Request, type Response } from "express";
import type {
  ListDiscoveryResourcesRequest,
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
  ChatProtocolContent,
  ChatProtocolEnvelope,
  ChatProtocolMessage,
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
  msg_id?: string;
  msgId?: string;
  timestamp?: string;
  content?: unknown;
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

function createChatRoute(
  router: Router,
  agentverse: AgentverseClient | undefined,
  agentverseChatAgentId: string | undefined
): void {

  interface ParsedChatProtocol {
    envelope: ChatProtocolEnvelope;
    message?: ChatProtocolMessage;
    payloadJson?: unknown;
    payloadText?: string;
  }

  interface NormalizedChatPayload {
    msgId: string;
    timestamp?: string;
    text: string;
    trimmedText: string;
    sender?: string;
    metadataStrings: Record<string, string>;
    hasRecognizedContent: boolean;
    chatProtocol?: ParsedChatProtocol;
  }

  const safeStringify = (value: unknown): string | undefined => {
    if (value === undefined) {
      return undefined;
    }
    if (typeof value === "string") {
      return value;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };

  const isChatProtocolMessage = (value: unknown): value is ChatProtocolMessage => {
    if (!isStringRecord(value)) {
      return false;
    }
    if (typeof value.msg_id !== "string" || value.msg_id.trim().length === 0) {
      return false;
    }
    if (value.content !== undefined && !Array.isArray(value.content)) {
      return false;
    }
    if (value.timestamp !== undefined && typeof value.timestamp !== "string") {
      return false;
    }
    return true;
  };

  const parseChatProtocolEnvelope = (raw: unknown): ParsedChatProtocol | undefined => {
    if (!isStringRecord(raw)) {
      return undefined;
    }

    const {
      version,
      sender,
      target,
      session,
      schema_digest: schemaDigest,
      protocol_digest: protocolDigest,
      payload,
      expires,
      nonce,
      signature
    } = raw;

    if (
      typeof version !== "number" ||
      typeof sender !== "string" ||
      typeof target !== "string" ||
      typeof session !== "string" ||
      typeof schemaDigest !== "string"
    ) {
      return undefined;
    }

    const envelope: ChatProtocolEnvelope = {
      version,
      sender,
      target,
      session,
      schema_digest: schemaDigest,
      protocol_digest: typeof protocolDigest === "string" ? protocolDigest : undefined,
      payload: typeof payload === "string" ? payload : undefined,
      expires: typeof expires === "number" ? expires : undefined,
      nonce: typeof nonce === "number" ? nonce : undefined,
      signature: typeof signature === "string" ? signature : undefined
    };

    let payloadText: string | undefined;
    if (envelope.payload) {
      try {
        payloadText = Buffer.from(envelope.payload, "base64").toString("utf8");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[Chat] Failed to decode chat protocol payload: ${message}`);
      }
    }

    let payloadJson: unknown;
    if (payloadText) {
      try {
        payloadJson = JSON.parse(payloadText);
      } catch {
        // payload is not JSON; ignore and fall back to the raw text preview.
      }
    }

    const message = isChatProtocolMessage(payloadJson) ? payloadJson : undefined;

    return {
      envelope,
      message,
      payloadJson,
      payloadText
    };
  };

  const normalizeChatPayload = (raw: unknown): NormalizedChatPayload => {
    const fallbackMsgId = randomUUID();
    const initial: NormalizedChatPayload = {
      msgId: fallbackMsgId,
      timestamp: undefined,
      text: "",
      trimmedText: "",
      sender: undefined,
      metadataStrings: {},
      hasRecognizedContent: false
    };

    const chatProtocol = parseChatProtocolEnvelope(raw);
    if (chatProtocol) {
      const message = chatProtocol.message;
      const textParts: string[] = [];
      const metadataStrings: Record<string, string> = {};
      let senderFromMetadata: string | undefined;

      const contentArray = Array.isArray(message?.content) ? (message?.content as ChatProtocolContent[]) : [];
      for (const item of contentArray) {
        const type = typeof item.type === "string" ? item.type : undefined;
        if (type === "text") {
          const contentText = typeof item.text === "string" ? item.text : undefined;
          if (contentText) {
            textParts.push(contentText);
          }
          continue;
        }
        if (type === "metadata") {
          const metadata = isStringRecord(item.metadata) ? item.metadata : undefined;
          if (!metadata) {
            continue;
          }
          for (const [key, value] of Object.entries(metadata)) {
            if (typeof value === "string") {
              metadataStrings[`metadata_${key}`] = value;
              if (key === "sender" && !senderFromMetadata) {
                senderFromMetadata = value.trim();
              }
            } else {
              const serialized = safeStringify(value);
              if (serialized !== undefined) {
                metadataStrings[`metadata_${key}`] = serialized;
              }
            }
          }
        }
      }

      const combinedText = textParts.join("\n");
      const trimmedCombined = combinedText.trim();
      const resolvedMsgId = typeof message?.msg_id === "string" && message.msg_id.trim().length > 0
        ? message.msg_id
        : fallbackMsgId;

      return {
        msgId: resolvedMsgId,
        timestamp: typeof message?.timestamp === "string" ? message.timestamp : undefined,
        text: combinedText,
        trimmedText: trimmedCombined,
        sender: senderFromMetadata ?? chatProtocol.envelope.sender,
        metadataStrings,
        hasRecognizedContent:
          trimmedCombined.length > 0 ||
          Object.keys(metadataStrings).length > 0 ||
          (chatProtocol.payloadText ? chatProtocol.payloadText.trim().length > 0 : false),
        chatProtocol
      };
    }

    const body = isStringRecord(raw) ? (raw as Partial<ChatRequestBody>) : undefined;
    const directMessage = safeStringify(body?.message);
    if (directMessage !== undefined) {
      const trimmedDirect = directMessage.trim();
      const msgIdFromBody = typeof body?.msg_id === "string" && body.msg_id.trim().length > 0
        ? body.msg_id
        : typeof body?.msgId === "string" && body.msgId.trim().length > 0
          ? body.msgId
          : undefined;
      return {
        ...initial,
        msgId: msgIdFromBody ?? fallbackMsgId,
        timestamp: typeof body?.timestamp === "string" ? body.timestamp : undefined,
        sender: typeof body?.sender === "string" && body.sender.trim().length > 0 ? body.sender.trim() : undefined,
        text: directMessage,
        trimmedText: trimmedDirect,
        hasRecognizedContent: true
      };
    }

    const bodyContent = Array.isArray(body?.content) ? body.content : undefined;
    if (!bodyContent) {
      const msgIdFromBody = typeof body?.msg_id === "string" && body.msg_id.trim().length > 0
        ? body.msg_id
        : typeof body?.msgId === "string" && body.msgId.trim().length > 0
          ? body.msgId
          : undefined;
      return {
        ...initial,
        msgId: msgIdFromBody ?? fallbackMsgId,
        timestamp: typeof body?.timestamp === "string" ? body.timestamp : undefined,
        sender: typeof body?.sender === "string" && body.sender.trim().length > 0 ? body.sender.trim() : undefined
      };
    }

    const textParts: string[] = [];
    const metadataStrings: Record<string, string> = {};
    let senderFromMetadata: string | undefined;

    for (const item of bodyContent ?? []) {
      if (!isStringRecord(item)) {
        continue;
      }
      const type = typeof item.type === "string" ? item.type : undefined;
      if (type === "text" && typeof item.text === "string") {
        textParts.push(item.text);
        continue;
      }
      if (type === "metadata" && isStringRecord(item.metadata)) {
        for (const [key, value] of Object.entries(item.metadata)) {
          if (typeof value === "string") {
            metadataStrings[`metadata_${key}`] = value;
            if (key === "sender" && !senderFromMetadata) {
              senderFromMetadata = value.trim();
            }
          } else {
            const serialized = safeStringify(value);
            if (serialized !== undefined) {
              metadataStrings[`metadata_${key}`] = serialized;
            }
          }
        }
      }
    }

    const combinedText = textParts.join("\n");
    const trimmedCombined = combinedText.trim();
    const msgIdFromBody = typeof body?.msg_id === "string" && body.msg_id.trim().length > 0
      ? body.msg_id
      : typeof body?.msgId === "string" && body.msgId.trim().length > 0
        ? body.msgId
        : undefined;
    const senderFromBody = typeof body?.sender === "string" && body.sender.trim().length > 0 ? body.sender.trim() : undefined;

    return {
      msgId: msgIdFromBody ?? fallbackMsgId,
      timestamp: typeof body?.timestamp === "string" ? body.timestamp : undefined,
      text: combinedText,
      trimmedText: trimmedCombined,
      sender: senderFromMetadata ?? senderFromBody,
      metadataStrings,
      hasRecognizedContent: textParts.length > 0 || Object.keys(metadataStrings).length > 0
    };
  };

  router.post(
    "/chat",
    (req, _res, next) => {
      const entrySnapshot = {
        method: req.method,
        originalUrl: req.originalUrl,
        ip: req.ip,
        contentType: req.headers["content-type"],
        contentLength: req.headers["content-length"],
        authorization: req.headers.authorization ? "present" : "missing"
      };
      console.log(`[Chat] Entry middleware triggered: ${JSON.stringify(entrySnapshot)}`);
      next();
    },
    asyncHandler(async (req, res) => {
      const receivedAt = new Date().toISOString();
      const headerSnapshot = {
        "content-type": req.headers["content-type"],
        "content-length": req.headers["content-length"],
        "user-agent": req.headers["user-agent"],
        "x-forwarded-for": req.headers["x-forwarded-for"],
        "x-request-id": req.headers["x-request-id"]
      };
      const rawBodyPreview = (() => {
        const serialized = safeStringify(req.body);
        if (!serialized) {
          return serialized;
        }
        const MAX_PREVIEW_LENGTH = 1000;
        return serialized.length > MAX_PREVIEW_LENGTH
          ? `${serialized.slice(0, MAX_PREVIEW_LENGTH)}…`
          : serialized;
      })();

      console.log(`[Chat] POST /chat invoked at ${receivedAt} from ${req.ip ?? "unknown ip"}`);
      console.log(`[Chat] Header snapshot: ${JSON.stringify(headerSnapshot)}`);
      console.log(`[Chat] Body preview: ${rawBodyPreview ?? "undefined"}`);

      const normalized = normalizeChatPayload(req.body ?? {});
      const { sender, text, trimmedText, msgId, metadataStrings, hasRecognizedContent, chatProtocol } = normalized;
      const normalizedSummary = {
        msgId,
        sender,
        trimmedTextLength: trimmedText.length,
        metadataKeys: Object.keys(metadataStrings),
        chatProtocol: Boolean(chatProtocol),
        rawKeys: isStringRecord(req.body) ? Object.keys(req.body as Record<string, unknown>) : undefined
      };
      console.log(`[Chat] Normalized payload summary: ${JSON.stringify(normalizedSummary)}`);
      if (chatProtocol) {
        const sessionId = chatProtocol.envelope.session;
        const schemaDigest = chatProtocol.envelope.schema_digest;
        const messageId = chatProtocol.message?.msg_id;
        console.log(`[Chat] Detected chat protocol envelope: session=${sessionId}, schema=${schemaDigest}${messageId ? `, msg_id=${messageId}` : ""}`);
      }

      const senderLabel = sender ? ` from ${sender}` : "";

      if (trimmedText.length > 0) {
        console.log(`Received chat message${senderLabel}: ${trimmedText}`);
      } else if (hasRecognizedContent) {
        console.log(`Received chat message${senderLabel} without text content. Metadata keys: ${Object.keys(metadataStrings).join(", ") || "none"}.`);
      } else {
        const rawKeys = isStringRecord(req.body) ? Object.keys(req.body as Record<string, unknown>) : [];
        console.log(`Received chat request${senderLabel} with an unrecognized payload shape. Raw keys: ${rawKeys.join(", ") || "none"}.`);
        console.log("Expected either a Chat Protocol envelope payload or a JSON body containing { message, content[] }.");
      }

      const placeholderReply = trimmedText.length > 0
        ? `Thanks for your message! This placeholder agent recorded: "${trimmedText}". We'll respond with full functionality soon.`
        : "Thanks for reaching out! This placeholder agent does not have an answer yet, but your request was logged.";

      const agentverseMetadata: Record<string, unknown> = {
        sender,
        originalMessage: trimmedText.length > 0 ? trimmedText : undefined,
        rawMessage: trimmedText.length === 0 && text.length > 0 ? text : undefined,
        receivedAt: new Date().toISOString(),
        placeholder: true
      };

      const ackMetadata: Record<string, string> = {
        ...metadataStrings,
        placeholder_response: placeholderReply
      };
      if (chatProtocol) {
        ackMetadata.chat_protocol = "true";
        ackMetadata.chat_protocol_sender = chatProtocol.envelope.sender;
        ackMetadata.chat_protocol_session = chatProtocol.envelope.session;
        ackMetadata.chat_protocol_schema = chatProtocol.envelope.schema_digest;
        if (chatProtocol.envelope.protocol_digest) {
          ackMetadata.chat_protocol_protocol = chatProtocol.envelope.protocol_digest;
        }
        if (chatProtocol.message?.msg_id) {
          ackMetadata.chat_protocol_msg_id = chatProtocol.message.msg_id;
        }
        if (chatProtocol.message?.timestamp) {
          ackMetadata.chat_protocol_timestamp = chatProtocol.message.timestamp;
        }
        if (!trimmedText.length && chatProtocol.payloadText) {
          const PAYLOAD_PREVIEW_MAX = 240;
          const preview = chatProtocol.payloadText.length > PAYLOAD_PREVIEW_MAX
            ? `${chatProtocol.payloadText.slice(0, PAYLOAD_PREVIEW_MAX)}…`
            : chatProtocol.payloadText;
          ackMetadata.chat_protocol_payload_preview = preview;
        }
      }
      if (sender) {
        ackMetadata.sender = sender;
      }
      if (trimmedText.length === 0) {
        ackMetadata.placeholder_reason = hasRecognizedContent ? "no_text_content" : "unrecognized_payload";
      }

      try {
        if (agentverse && agentverseChatAgentId) {
          const compactMetadata = Object.fromEntries(
            Object.entries(agentverseMetadata).filter(([, value]) => value !== undefined)
          );
          await agentverse.sendChatMessage(agentverseChatAgentId, placeholderReply, compactMetadata);
          ackMetadata.forwarded = "true";
        } else {
          ackMetadata.forwarded = "false";
          ackMetadata.forwarded_reason = "agentverse_not_configured";
        }
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        console.error("Failed to forward chat message to Agentverse:", error);
        ackMetadata.forwarded = "false";
        ackMetadata.forwarded_reason = "agentverse_forward_failed";
        ackMetadata.forwarded_error = messageText;
      }

      res.json({
        acknowledged_msg_id: msgId,
        timestamp: new Date().toISOString(),
        metadata: ackMetadata
      });
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

  console.log(
    `[Init] Agentverse client ${agentverse ? "configured" : "not configured"}.` +
    ` Chat agent id: ${chatAgentId ?? "unset"}`
  );
  console.log(
    `[Init] Authorization required for facilitator routes: ${options.requireAuthorization ?? true}`
  );

  router.use((req, _res, next) => {
    console.log(`[HTTP] ${req.method} ${req.originalUrl} from ${req.ip ?? "unknown ip"}`);
    next();
  });

  router.use(express.json());

  createRootRoute(router);
  createHealthRoute(router);
  createStatusRoute(router);
  createChatRoute(router, agentverse, chatAgentId);
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
