"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectToWebService = connectToWebService;
const express_1 = __importDefault(require("express"));
const X402FacilitatorService_1 = require("./X402FacilitatorService");
function asyncHandler(handler) {
    return (req, res, next) => {
        handler(req, res, next).catch(next);
    };
}
function validateVerifyBody(body) {
    if (!body.payload || !body.requirements) {
        throw new Error("Missing payment payload or requirements in request body.");
    }
}
function validateSettleBody(body) {
    if (!body.payload || !body.requirements) {
        throw new Error("Missing payment payload or requirements in request body.");
    }
}
function createHealthRoute(router) {
    router.get("/health", asyncHandler(async (_req, res) => {
        res.json({ status: "ok" });
    }));
}
function createAuthorizationGuard(router) {
    router.use((req, res, next) => {
        if (!req.headers.authorization) {
            res.status(401).json({ error: "Missing Authorization header." });
            return;
        }
        next();
    });
}
function createFacilitatorRoutes(router, facilitator) {
    router.post("/facilitator/resources", asyncHandler(async (req, res) => {
        const { request } = (req.body ?? {});
        const response = await facilitator.listResources(request);
        res.json(response);
    }));
    router.get("/facilitator/supported", asyncHandler(async (_req, res) => {
        const response = await facilitator.supportedPaymentKinds();
        res.json(response);
    }));
    router.post("/payments/verify", asyncHandler(async (req, res) => {
        const body = (req.body ?? {});
        validateVerifyBody(body);
        const response = await facilitator.verifyPayment(body.payload, body.requirements);
        res.json(response);
    }));
    router.post("/payments/settle", asyncHandler(async (req, res) => {
        const body = (req.body ?? {});
        validateSettleBody(body);
        const response = await facilitator.settlePayment(body.payload, body.requirements);
        res.json(response);
    }));
    router.post("/payments/verify/onchain", asyncHandler(async (req, res) => {
        const body = (req.body ?? {});
        validateVerifyBody(body);
        const response = await facilitator.verifyOnchain(body.payload, body.requirements, body.options);
        res.json(response);
    }));
    router.post("/payments/settle/onchain", asyncHandler(async (req, res) => {
        const body = (req.body ?? {});
        validateSettleBody(body);
        const response = await facilitator.settleOnchain(body.payload, body.requirements, body.options);
        res.json(response);
    }));
}
const defaultErrorHandler = (err, _req, res, _next) => {
    const status = typeof err.status === "number" ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unexpected error occurred.";
    res.status(status).json({ error: message });
};
// authenticated requests only
function connectToWebService(options = {}) {
    const router = options.router ?? express_1.default.Router();
    const facilitator = options.facilitatorService ?? new X402FacilitatorService_1.X402FacilitatorService();
    router.use(express_1.default.json());
    createHealthRoute(router);
    if (options.requireAuthorization ?? true) {
        createAuthorizationGuard(router);
    }
    createFacilitatorRoutes(router, facilitator);
    router.use(defaultErrorHandler);
    return router;
}
