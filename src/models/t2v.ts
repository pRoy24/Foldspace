export const T2V_API_BASE_URL = "https://api.samsar.one/v1/video/";

export const T2V_IMAGE_MODELS = [
  "GPTIMAGE1",
  "IMAGEN4",
  "SEEDREAM",
  "NANOBANANA",
  "HUNYUAN"
] as const;
export type T2VImageModelKey = (typeof T2V_IMAGE_MODELS)[number];

export const T2V_VIDEO_MODELS = [
  "RUNWAYML",
  "SEEDANCEI2V",
  "HAILUO",
  "HAILUOPRO",
  "WANI2V",
  "WANI2V5B",
  "VEO3.1I2V",
  "VEO3.1I2VFAST",
  "KLINGIMGTOVIDTURBO",
  "SORA2",
  "SORA2PRO"
] as const;
export type T2VVideoModelKey = (typeof T2V_VIDEO_MODELS)[number];

export type T2VTone = "grounded" | "cinematic";
export type T2VAspectRatio = "9:16" | "16:9";

export interface T2VCreateVideoInput {
  prompt: string;
  duration?: number;
  image_model?: T2VImageModelKey;
  video_model?: T2VVideoModelKey;
  tone?: T2VTone;
  aspect_ratio?: T2VAspectRatio;
}

export interface T2VCreateVideoRequest {
  input: T2VCreateVideoInput;
}

export interface T2VCreateVideoSuccessResponse {
  request_id: string;
}

export interface T2VErrorResponse {
  message: string;
}

export type T2VCreateVideoResponse = T2VCreateVideoSuccessResponse | T2VErrorResponse;

export type T2VStatusPhase =
  | "PENDING"
  | "COMPLETED"
  | "FAILED"
  | "PROCESSING"
  | string;

export interface T2VStatusPendingDetails {
  prompt_generation?: string;
  image_generation?: string;
  audio_generation?: string;
  frame_generation?: string;
  video_generation?: string;
  ai_video_generation?: string;
  speech_generation?: string;
  music_generation?: string;
  lip_sync_generation?: string;
  sound_effect_generation?: string;
  transcript_generation?: string;
  [phase: string]: unknown;
}

export interface T2VStatusPendingResponse {
  status: T2VStatusPhase;
  details: T2VStatusPendingDetails;
}

export interface T2VStatusCompletedResponse {
  status: "COMPLETED";
  url: string;
}

export type T2VStatusResponse =
  | T2VStatusPendingResponse
  | T2VStatusCompletedResponse
  | T2VErrorResponse;

export interface T2VCostBreakdown {
  durationSeconds: number;
  videoModel: T2VVideoModelKey;
  imageModel: T2VImageModelKey;
  rateCreditsPerSecond: number;
  imageModelMultiplier: number;
  totalCredits: number;
}

export interface T2VPaymentQuote extends T2VCostBreakdown {
  pricePerCreditMinorUnits?: bigint;
  totalMinorUnits?: bigint;
  totalMinorUnitsString?: string;
}

const DEFAULT_DURATION_SECONDS = 30;
const MAX_DURATION_SECONDS = 180;
const DEFAULT_IMAGE_MODEL: T2VImageModelKey = "GPTIMAGE1";
const DEFAULT_VIDEO_MODEL: T2VVideoModelKey = "RUNWAYML";

const DEFAULT_VIDEO_RATE = 10;
const VIDEO_RATE_EXCEPTIONS: Record<T2VVideoModelKey, number> = {
  RUNWAYML: DEFAULT_VIDEO_RATE,
  SEEDANCEI2V: DEFAULT_VIDEO_RATE,
  HAILUO: DEFAULT_VIDEO_RATE,
  HAILUOPRO: DEFAULT_VIDEO_RATE,
  WANI2V: DEFAULT_VIDEO_RATE,
  WANI2V5B: DEFAULT_VIDEO_RATE,
  "VEO3.1I2V": 60,
  "VEO3.1I2VFAST": 30,
  KLINGIMGTOVIDTURBO: 15,
  SORA2: 30,
  SORA2PRO: 70
};

const HUNYUAN_MULTIPLIER = 1.5;

function coerceDurationSeconds(duration?: number): number {
  if (typeof duration !== "number" || Number.isNaN(duration)) {
    return DEFAULT_DURATION_SECONDS;
  }
  if (duration <= 0) {
    return DEFAULT_DURATION_SECONDS;
  }
  return Math.min(Math.floor(duration), MAX_DURATION_SECONDS);
}

function resolveVideoRate(model: T2VVideoModelKey): number {
  return VIDEO_RATE_EXCEPTIONS[model] ?? DEFAULT_VIDEO_RATE;
}

function resolveImageModelMultiplier(model: T2VImageModelKey): number {
  return model === "HUNYUAN" ? HUNYUAN_MULTIPLIER : 1;
}

export function calculateT2VCostBreakdown(input: T2VCreateVideoInput): T2VCostBreakdown {
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

export function buildT2VCreateRequest(input: T2VCreateVideoInput): T2VCreateVideoRequest {
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
