from __future__ import annotations

import json
from typing import Any, Dict, List


_EMBEDDING_SOURCE = r"""
{
  "smart_chunk_version": "2025-10-24.1",
  "source_metadata": {
    "LLM_EXPORT_VERSION": "1",
    "GENERATED_AT_UTC": "2025-10-24T05:43:05.697777Z",
    "DOC_COUNT": 4,
    "files": [
      "docs/api.mdx",
      "docs/intro.md",
      "docs/pricing.md",
      "docs/speakers.md"
    ]
  },
  "global": {
    "product": "Samsar.One / VidGenie",
    "base_url": "https://api.samsar.one/v1/video/",
    "auth": {
      "type": "bearer",
      "header": "Authorization",
      "format": "Bearer YOUR_API_KEY",
      "where_to_get_key": "Create/manage in dashboard at app.samsar.one",
      "errors": {
        "400": "Missing or empty API_KEY header",
        "401": "Invalid API_KEY"
      }
    }
  },
  "chunks": [
    {
      "id": "models.image.v1",
      "title": "Supported Image Models",
      "kind": "reference",
      "retrieval_keys": [
        "models",
        "image",
        "gptimage1",
        "imagen4",
        "seedream",
        "nanobanana",
        "hunyuan"
      ],
      "canonical_facts": {
        "models": [
          { "name": "GPT Image 1", "key": "GPTIMAGE1" },
          { "name": "Imagen 4", "key": "IMAGEN4" },
          { "name": "Seedream", "key": "SEEDREAM" },
          { "name": "NanoBanana", "key": "NANOBANANA" },
          {
            "name": "Hunyuan V3",
            "key": "HUNYUAN",
            "notes": "Selecting HUNYUAN multiplies per-second video rate by 1.5"
          }
        ]
      }
    },
    {
      "id": "models.video.v1",
      "title": "Supported Video Models",
      "kind": "reference",
      "retrieval_keys": [
        "models",
        "video",
        "runwayml",
        "seedancei2v",
        "hailuo",
        "wani2v",
        "veo3.1i2v",
        "klingimgtovidturbopro",
        "sora2",
        "sora2pro"
      ],
      "canonical_facts": {
        "models": [
          { "name": "Runway Gen-4 (Default)", "key": "RUNWAYML" },
          { "name": "SeeDance I2V", "key": "SEEDANCEI2V" },
          { "name": "Hailuo Img2Vid", "key": "HAILUO" },
          { "name": "Hailuo Pro", "key": "HAILUOPRO" },
          { "name": "Wani I2V", "key": "WANI2V" },
          { "name": "Wani I2V 5B", "key": "WANI2V5B" },
          { "name": "Veo3.1 I2V", "key": "VEO3.1I2V" },
          { "name": "Veo3.1 I2V Fast", "key": "VEO3.1I2VFAST" },
          { "name": "Kling I2V Turbo Pro", "key": "KLINGIMGTOVIDTURBO" },
          { "name": "Sora 2", "key": "SORA2" },
          { "name": "Sora 2 Pro", "key": "SORA2PRO" }
        ],
        "aliases_and_inconsistencies": {
          "note": "Parameter enum in /create shows older keys VEO3I2V, VEO3I2VFLASH; prefer table keys above. See `schema.aliases`.",
          "aliases": {
            "VEO3I2V": "VEO3.1I2V",
            "VEO3I2VFLASH": "VEO3.1I2VFAST",
            "KLINGI2VTURBOPRO": "KLINGIMGTOVIDTURBO"
          }
        }
      }
    },
    {
      "id": "pricing.api.v1",
      "title": "Per-second Video Pricing (API page)",
      "kind": "pricing",
      "retrieval_keys": ["pricing", "per-second", "credits"],
      "canonical_facts": {
        "per_second_rates_credits": [
          {
            "model": "Default (all other)",
            "video_model_key": "*",
            "credits_per_sec": 10,
            "applies_when": "Model not listed below"
          },
          {
            "model": "Kling I2V Turbo Pro",
            "video_model_key": "KLINGIMGTOVIDTURBO",
            "credits_per_sec": 15
          },
          {
            "model": "Veo3.1 I2V Fast",
            "video_model_key": "VEO3.1I2VFAST",
            "credits_per_sec": 30
          },
          {
            "model": "Sora 2",
            "video_model_key": "SORA2",
            "credits_per_sec": 30
          },
          {
            "model": "Veo3.1 I2V",
            "video_model_key": "VEO3.1I2V",
            "credits_per_sec": 60
          },
          {
            "model": "Sora 2 Pro",
            "video_model_key": "SORA2PRO",
            "credits_per_sec": 70
          }
        ],
        "image_multiplier": [
          {
            "image_model_key": "HUNYUAN",
            "multiplier": 1.5,
            "note": "applies to video per-second rate"
          }
        ],
        "effective_credits_formula": "duration_seconds * video_rate_credits_per_sec * (image_model == HUNYUAN ? 1.5 : 1)",
        "examples": [
          {
            "duration_seconds": 60,
            "video_model_key": "KLINGIMGTOVIDTURBO",
            "image_model_key": "SEEDREAM",
            "result_credits": 900
          },
          {
            "duration_seconds": 60,
            "video_model_key": "KLINGIMGTOVIDTURBO",
            "image_model_key": "HUNYUAN",
            "result_credits": 1350
          }
        ]
      }
    },
    {
      "id": "pricing.plans.v1",
      "title": "Subscription Plan",
      "kind": "pricing",
      "retrieval_keys": ["plan", "credits", "creator plan"],
      "canonical_facts": {
        "plans": [
          {
            "name": "Creator Plan",
            "monthly_fee_usd": 49.99,
            "included_credits_per_month": 5000,
            "extra_credits": { "price_usd": 10, "credits": 1000 }
          }
        ]
      }
    },
    {
      "id": "endpoints.create.v1",
      "title": "POST /create (Video Session)",
      "kind": "endpoint",
      "retrieval_keys": ["endpoint", "create", "request", "response", "validation"],
      "canonical_facts": {
        "method": "POST",
        "path": "/create",
        "request": {
          "headers": {
            "Authorization": "Bearer YOUR_API_KEY",
            "Content-Type": "application/json"
          },
          "body_schema": {
            "type": "object",
            "required": ["input.prompt"],
            "properties": {
              "input.prompt": {
                "type": "string",
                "max_len": 1000,
                "desc": "Text prompt for image & video generation"
              },
              "input.duration": {
                "type": "number",
                "units": "seconds",
                "max": 180,
                "default": 30
              },
              "input.image_model": {
                "type": "enum",
                "allowed": [
                  "GPTIMAGE1",
                  "IMAGEN4",
                  "SEEDREAM",
                  "NANOBANANA",
                  "HUNYUAN"
                ],
                "default": "GPTIMAGE1"
              },
              "input.video_model": {
                "type": "enum",
                "allowed": [
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
                ],
                "default": "RUNWAYML"
              },
              "input.tone": {
                "type": "enum",
                "allowed": ["grounded", "cinematic"],
                "default": "grounded"
              },
              "input.aspect_ratio": {
                "type": "enum",
                "allowed": ["9:16", "16:9"],
                "default": "16:9"
              }
            }
          },
          "example": {
            "input": {
              "prompt": "An astronaut cat exploring a neon-lit Mars colony",
              "duration": 30,
              "image_model": "IMAGEN4",
              "video_model": "SORA2",
              "tone": "grounded",
              "aspect_ratio": "16:9"
            }
          }
        },
        "responses": {
          "201": {
            "body": { "request_id": "vid_1234567890" },
            "desc": "Session created"
          },
          "400": { "body": { "message": "Validation error" } },
          "401": { "desc": "Authentication error" }
        },
        "notes": {
          "aliases_supported": {
            "VEO3I2V": "VEO3.1I2V",
            "VEO3I2VFLASH": "VEO3.1I2VFAST"
          }
        }
      }
    },
    {
      "id": "endpoints.status.v1",
      "title": "GET /status (Poll Session)",
      "kind": "endpoint",
      "retrieval_keys": ["endpoint", "status", "polling", "request_id"],
      "canonical_facts": {
        "method": "GET",
        "path": "/status",
        "query": { "request_id": { "type": "string", "required": true } },
        "headers": { "Authorization": "Bearer YOUR_API_KEY" },
        "responses": {
          "200.pending": {
            "body": {
              "status": "PENDING",
              "details": {
                "prompt_generation": "COMPLETED|PENDING|INIT",
                "image_generation": "COMPLETED|PENDING|INIT",
                "audio_generation": "COMPLETED|PENDING|INIT",
                "frame_generation": "INIT|PENDING|COMPLETED",
                "video_generation": "INIT|PENDING|COMPLETED",
                "ai_video_generation": "PENDING|COMPLETED",
                "speech_generation": "COMPLETED|PENDING|INIT",
                "music_generation": "COMPLETED|PENDING|INIT",
                "lip_sync_generation": "INIT|PENDING|COMPLETED",
                "sound_effect_generation": "INIT|PENDING|COMPLETED",
                "transcript_generation": "INIT|PENDING|COMPLETED"
              }
            }
          },
          "200.completed": {
            "body": {
              "status": "COMPLETED",
              "url": "https://cdn.samsar.one/videos/vid_1234567890.mp4"
            },
            "variants": [
              {
                "field": "video_link",
                "example": "https://cdn.samsar.one/videos/vid_1234567890.mp4",
                "note": "Seen in example; prefer `url` if both exist."
              }
            ]
          },
          "400": { "body": { "message": "Missing or invalid session_id." } },
          "404": { "desc": "Not found" },
          "401": { "desc": "Authentication error" }
        }
      }
    },
    {
      "id": "pricing.masterchart.v1",
      "title": "Pricing Chart (Docs/pricing.md)",
      "kind": "pricing",
      "retrieval_keys": [
        "pricing",
        "model prices",
        "tts",
        "music",
        "assistants",
        "video price table"
      ],
      "canonical_facts": {
        "plan": {
          "name": "Creator’s Plan",
          "monthly_fee_usd": 49.99,
          "included_credits": 5000,
          "extra_credits_price_per_1000": 10
        },
        "image_model_prices": [
          { "key": "GPTIMAGE1", "ar_prices_cr": { "1:1": 15, "16:9": 15, "9:16": 15 } },
          { "key": "IMAGEN4", "ar_prices_cr": { "1:1": 5, "16:9": 5, "9:16": 5 } },
          { "key": "SEEDREAM", "ar_prices_cr": { "1:1": 10, "16:9": 15, "9:16": 15 } },
          { "key": "NANOBANANA", "ar_prices_cr": { "1:1": 15, "16:9": 15, "9:16": 15 } },
          { "key": "HUNYUAN", "ar_prices_cr": { "1:1": 40, "16:9": 40, "9:16": 40 } }
        ],
        "video_model_prices_examples": [
          { "key": "RUNWAYML", "price_cr": 60, "units": [5, 10] },
          { "key": "SEEDANCEI2V", "price_cr": 60, "units": [5, 10] },
          { "key": "HAILUO", "price_cr": 60, "units": [6, 10] },
          { "key": "HAILUOPRO", "price_cr": 100, "units": [6] },
          { "key": "KLINGIMGTOVIDTURBO", "price_cr": 60, "units": [5, 10] },
          { "key": "VEO3.1I2VFAST", "price_cr": "300–700", "units": [8] },
          { "key": "SORA2", "price_cr": 100, "units": [8] },
          { "key": "SORA2PRO", "price_cr": 300, "units": [8] }
        ],
        "other_categories": {
          "tts_engines": ["OPENAI", "PLAYTS", "ELEVENLABS"],
          "assistant_models": [
            { "key": "GPT4O", "unit": "words per 1,000", "price_cr": 1 },
            { "key": "GROK3", "unit": "words per 1,000", "price_cr": 1 },
            { "key": "GPTO3", "unit": "words per 1,000", "price_cr": 6 }
          ],
          "theme_pricing": [{ "operation": "query", "tokens_per_op": 1, "price_cr": 1 }],
          "translation_pricing": [{ "operation": "line", "tokens_per_op": 1, "price_cr": 1 }],
          "prompt_generation_pricing": [{ "operation": "line", "tokens_per_op": 1, "price_cr": 1 }],
          "speech_models": [
            { "key": "TTS", "unit": "words per 1,000", "price_cr": 1 },
            { "key": "TTSHD", "unit": "words per 400", "price_cr": 1 }
          ],
          "music_models": [
            { "key": "AUDIOCRAFT", "operation": "generate_song", "price_cr": 2 },
            { "key": "CASSETTEAI", "operation": "generate_song", "price_cr": 5 },
            { "key": "LYRIA2", "operation": "generate_song", "price_cr": 2 }
          ]
        },
        "notes": [
          "All prices in credits.",
          "For video models, 'Additional Units' are provider clip lengths."
        ]
      }
    }
  ]
}
"""


INSTRUCTION_EMBEDDING: Dict[str, Any] = json.loads(_EMBEDDING_SOURCE)


def _summarize_models(section_id: str) -> str:
    for chunk in INSTRUCTION_EMBEDDING["chunks"]:
        if chunk["id"] == section_id:
            models: List[Dict[str, Any]] = chunk["canonical_facts"]["models"]
            lines = [f"- {entry['name']} (`{entry['key']}`)" for entry in models]
            note = chunk["canonical_facts"].get("aliases_and_inconsistencies")
            extra = ""
            if note:
                alias_info = note.get("aliases", {})
                alias_lines = ", ".join(f"{src}→{dest}" for src, dest in alias_info.items())
                extra = f"\n  Aliases: {alias_lines}"
            return "\n".join(lines) + extra
    return ""


def _summarize_pricing() -> str:
    rates_chunk = next(
        (c for c in INSTRUCTION_EMBEDDING["chunks"] if c["id"] == "pricing.api.v1"),
        None,
    )
    if not rates_chunk:
        return ""
    facts = rates_chunk["canonical_facts"]
    lines = []
    for entry in facts["per_second_rates_credits"]:
        model = entry["model"]
        rate = entry["credits_per_sec"]
        key = entry["video_model_key"]
        lines.append(f"- {model} (`{key}`): {rate} credits/sec")
    formula = facts["effective_credits_formula"]
    multiplier = facts["image_multiplier"][0]
    lines.append(f"- Image multiplier: `{multiplier['image_model_key']}` x{multiplier['multiplier']}")
    lines.append(f"- Formula: {formula}")
    return "\n".join(lines)


def build_instruction_text() -> str:
    base = [
        "Foldspace T2V • Enter a prompt, choose image & video models, then render.",
        "",
        "Supported Image Models:",
        _summarize_models("models.image.v1"),
        "",
        "Supported Video Models:",
        _summarize_models("models.video.v1"),
        "",
        "Pricing Highlights:",
        _summarize_pricing(),
        "",
        "API Essentials:",
        "- POST /create (Bearer auth) with prompt, duration (<=180s), image_model, video_model, tone, aspect_ratio.",
        "- GET /status?request_id=<id> to poll progress (fields: prompt/image/audio/frame/video generation, etc.).",
        "- Creator plan: $49.99/mo, 5k credits, $10 per extra 1k credits.",
    ]
    return "\n".join(part for part in base if part)


INSTRUCTION_TEXT = build_instruction_text()


def get_instruction_text() -> str:
    return INSTRUCTION_TEXT


def find_chunk(keyword: str) -> Dict[str, Any] | None:
    normalized = keyword.strip().lower()
    if not normalized:
        return None
    for chunk in INSTRUCTION_EMBEDDING["chunks"]:
        keys = {chunk["id"].lower(), chunk["title"].lower()}
        keys.update(k.lower() for k in chunk.get("retrieval_keys", []))
        if normalized in keys:
            return chunk
    return None


def format_chunk(keyword: str) -> str:
    chunk = find_chunk(keyword)
    if not chunk:
        return ""
    return json.dumps(chunk["canonical_facts"], indent=2, sort_keys=True)


__all__ = [
    "INSTRUCTION_EMBEDDING",
    "INSTRUCTION_TEXT",
    "find_chunk",
    "format_chunk",
    "get_instruction_text",
]
