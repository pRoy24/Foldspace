"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.T2V_VIDEO_MODELS = exports.T2V_IMAGE_MODELS = exports.T2V_API_BASE_URL = void 0;
exports.calculateT2VCostBreakdown = calculateT2VCostBreakdown;
exports.buildT2VCreateRequest = buildT2VCreateRequest;
exports.T2V_API_BASE_URL = "https://api.samsar.one/v1/video/";
exports.T2V_IMAGE_MODELS = [
    "GPTIMAGE1",
    "IMAGEN4",
    "SEEDREAM",
    "NANOBANANA",
    "HUNYUAN"
];
exports.T2V_VIDEO_MODELS = [
    "RUNWAYML",
    "SEEDANCEI2V",
    "HAILUO",
    "HAILUOPRO",
    "WANI2V",
    "WANI2V5B",
    "VEO3I2V",
    "VEO3I2VFLASH",
    "KLINGIMGTOVIDTURBO",
    "SORA2",
    "SORA2PRO"
];
const DEFAULT_DURATION_SECONDS = 30;
const MAX_DURATION_SECONDS = 180;
const DEFAULT_IMAGE_MODEL = "GPTIMAGE1";
const DEFAULT_VIDEO_MODEL = "RUNWAYML";
const DEFAULT_VIDEO_RATE = 10;
const VIDEO_RATE_EXCEPTIONS = {
    RUNWAYML: DEFAULT_VIDEO_RATE,
    SEEDANCEI2V: DEFAULT_VIDEO_RATE,
    HAILUO: DEFAULT_VIDEO_RATE,
    HAILUOPRO: DEFAULT_VIDEO_RATE,
    WANI2V: DEFAULT_VIDEO_RATE,
    WANI2V5B: DEFAULT_VIDEO_RATE,
    VEO3I2V: 60,
    VEO3I2VFLASH: 30,
    KLINGIMGTOVIDTURBO: 15,
    SORA2: 30,
    SORA2PRO: 70
};
const HUNYUAN_MULTIPLIER = 1.5;
function coerceDurationSeconds(duration) {
    if (typeof duration !== "number" || Number.isNaN(duration)) {
        return DEFAULT_DURATION_SECONDS;
    }
    if (duration <= 0) {
        return DEFAULT_DURATION_SECONDS;
    }
    return Math.min(Math.floor(duration), MAX_DURATION_SECONDS);
}
function resolveVideoRate(model) {
    return VIDEO_RATE_EXCEPTIONS[model] ?? DEFAULT_VIDEO_RATE;
}
function resolveImageModelMultiplier(model) {
    return model === "HUNYUAN" ? HUNYUAN_MULTIPLIER : 1;
}
function calculateT2VCostBreakdown(input) {
    const durationSeconds = coerceDurationSeconds(input.duration);
    const videoModel = input.video_model ?? DEFAULT_VIDEO_MODEL;
    const imageModel = input.image_model ?? DEFAULT_IMAGE_MODEL;
    const rateCreditsPerSecond = resolveVideoRate(videoModel);
    const imageModelMultiplier = resolveImageModelMultiplier(imageModel);
    const totalCredits = Math.round(durationSeconds * rateCreditsPerSecond * imageModelMultiplier);
    return {
        durationSeconds,
        videoModel,
        imageModel,
        rateCreditsPerSecond,
        imageModelMultiplier,
        totalCredits
    };
}
function buildT2VCreateRequest(input) {
    return {
        input: {
            ...input,
            duration: coerceDurationSeconds(input.duration),
            image_model: input.image_model ?? DEFAULT_IMAGE_MODEL,
            video_model: input.video_model ?? DEFAULT_VIDEO_MODEL,
            tone: input.tone ?? "grounded",
            aspect_ratio: input.aspect_ratio ?? "16:9"
        }
    };
}
