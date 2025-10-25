import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, cast
from uuid import uuid4
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    TextContent,
    chat_protocol_spec,
)
from uagents_core.envelope import Envelope
from uagents_core.identity import Identity
from uagents_core.models import Model
from uagents_core.utils.messages import parse_envelope

BASE_DIR = Path(__file__).parent
PROJECT_ROOT = BASE_DIR.parent
DEFAULT_ENV_FILE = PROJECT_ROOT / ".env"
env_override = os.getenv("FOLDSPACE_ENV_FILE")
if env_override:
    ENV_FILE = Path(env_override)
else:
    ENV_FILE = DEFAULT_ENV_FILE

if not ENV_FILE.exists():
    fallback_env = BASE_DIR / ".env"
    if fallback_env.exists():
        print(f"[FastAPI] Warning: {ENV_FILE} not found, falling back to {fallback_env}")
        ENV_FILE = fallback_env

load_dotenv(ENV_FILE)

DEFAULT_AGENTVERSE_BASE_URL = "https://agentverse.ai/"


def _ensure_trailing_slash(value: str) -> str:
    return value if value.endswith("/") else f"{value}/"


AGENTVERSE_API_KEY = os.getenv("AGENTVERSE_API_KEY")
AGENTVERSE_BASE_URL = os.getenv("AGENTVERSE_BASE_URL")
AGENT_SEED_PHRASE = os.getenv("AGENT_SEED_PHRASE")
CHAT_PLACEHOLDER_RESPONSE = "Message received"

if not AGENTVERSE_API_KEY:
    print("[FastAPI] Warning: AGENTVERSE_API_KEY is not configured; Agentverse features will be limited.")

if not AGENTVERSE_BASE_URL:
    print("[FastAPI] Warning: AGENTVERSE_BASE_URL is not configured; default Agentverse URL will be assumed.")

if not AGENT_SEED_PHRASE:
    print("[FastAPI] Warning: AGENT_SEED_PHRASE is not configured; outbound chat replies will be skipped.")

AGENTVERSE_BASE_URL_RESOLVED = _ensure_trailing_slash(AGENTVERSE_BASE_URL or DEFAULT_AGENTVERSE_BASE_URL)
# Mailbox submission endpoint documented at https://docs.agentverse.ai/api-reference/mailbox/submit-message-envelope
AGENTVERSE_MAILBOX_SUBMIT_URL = urljoin(AGENTVERSE_BASE_URL_RESOLVED, "v1/submit")

CHAT_MESSAGE_SCHEMA_DIGEST = Model.build_schema_digest(ChatMessage)
CHAT_ACK_SCHEMA_DIGEST = Model.build_schema_digest(ChatAcknowledgement)
CHAT_PROTOCOL_DIGEST = chat_protocol_spec.digest

AGENT_IDENTITY: Optional[Identity] = None
AGENT_ADDRESS: Optional[str] = None

if AGENT_SEED_PHRASE:
    try:
        AGENT_IDENTITY = Identity.from_seed(AGENT_SEED_PHRASE, 0)
        AGENT_ADDRESS = AGENT_IDENTITY.address
        print(f"[FastAPI] Agent identity loaded. Address: {AGENT_ADDRESS}")
    except Exception as identity_error:  # noqa: BLE001
        AGENT_IDENTITY = None
        AGENT_ADDRESS = None
        print(f"[FastAPI] Failed to derive agent identity from AGENT_SEED_PHRASE: {identity_error}")


def _agentverse_mailbox_headers() -> Dict[str, str]:
    headers: Dict[str, str] = {"Content-Type": "application/json"}
    if AGENTVERSE_API_KEY:
        headers["Authorization"] = f"Bearer {AGENTVERSE_API_KEY}"
    return headers


def _serialize_envelope(envelope: Envelope) -> str:
    return json.dumps(envelope.model_dump(mode="json"), default=str)


def _post_agentverse_envelope(envelope: Envelope, envelope_type: str) -> tuple[bool, Optional[str]]:
    payload_json = _serialize_envelope(envelope)
    preview = payload_json if len(payload_json) <= 600 else f"{payload_json[:600]}..."
    print(
        "[FastAPI][Agentverse] Attempting to submit envelope",
        {
            "url": AGENTVERSE_MAILBOX_SUBMIT_URL,
            "sender": envelope.sender,
            "target": envelope.target,
            "session": str(envelope.session),
            "schemaDigest": envelope.schema_digest,
            "protocolDigest": envelope.protocol_digest,
            "envelopeType": envelope_type,
            "payloadPreview": preview,
        },
    )

    request = Request(
        AGENTVERSE_MAILBOX_SUBMIT_URL,
        data=payload_json.encode("utf-8"),
        headers=_agentverse_mailbox_headers(),
        method="POST",
    )

    try:
        with urlopen(request, timeout=10) as response:
            status_code = getattr(response, "status", response.getcode())
            body = response.read()
            body_preview = body.decode("utf-8", "ignore") if body else ""
            if len(body_preview) > 300:
                body_preview = f"{body_preview[:300]}..."
            print(
                "[FastAPI][Agentverse] Envelope submitted successfully",
                {
                    "status": status_code,
                    "responseBytes": len(body),
                    "responsePreview": body_preview,
                    "envelopeType": envelope_type,
                },
            )
            return True, None
    except HTTPError as exc:
        error_body = exc.read().decode("utf-8", "ignore")
        print(
            "[FastAPI][Agentverse] HTTP error while submitting envelope",
            {
                "status": exc.code,
                "reason": exc.reason,
                "body": error_body,
                "url": AGENTVERSE_MAILBOX_SUBMIT_URL,
                "envelopeType": envelope_type,
            },
        )
        return False, f"HTTP {exc.code}: {error_body or exc.reason}"
    except URLError as exc:
        print(
            "[FastAPI][Agentverse] Network error while submitting envelope",
            {
                "url": AGENTVERSE_MAILBOX_SUBMIT_URL,
                "error": str(exc),
                "envelopeType": envelope_type,
            },
        )
        return False, str(getattr(exc, "reason", exc))
    except Exception as exc:  # noqa: BLE001
        print(
            "[FastAPI][Agentverse] Unexpected error while submitting envelope",
            {
                "url": AGENTVERSE_MAILBOX_SUBMIT_URL,
                "error": str(exc),
                "envelopeType": envelope_type,
            },
        )
        return False, str(exc)

    return False, "Unknown Agentverse response state"


async def submit_agentverse_envelope(envelope: Envelope, envelope_type: str) -> tuple[bool, Optional[str]]:
    return await run_in_threadpool(_post_agentverse_envelope, envelope, envelope_type)


def _build_ack_envelope(
    incoming: Envelope,
    message: ChatMessage,
    metadata: Optional[Dict[str, str]],
    identity: Identity,
) -> Envelope:
    acknowledgement = ChatAcknowledgement(
        acknowledged_msg_id=message.msg_id,
        metadata=metadata,
    )
    envelope = Envelope(
        version=incoming.version,
        sender=identity.address,
        target=incoming.sender,
        session=incoming.session,
        schema_digest=CHAT_ACK_SCHEMA_DIGEST,
        protocol_digest=CHAT_PROTOCOL_DIGEST,
    )
    envelope.encode_payload(acknowledgement.model_dump_json())
    envelope.sign(identity)
    return envelope


def _build_placeholder_message_envelope(
    incoming: Envelope,
    reply_text: str,
    identity: Identity,
) -> Envelope:
    message = ChatMessage(content=[TextContent(text=reply_text)])
    envelope = Envelope(
        version=incoming.version,
        sender=identity.address,
        target=incoming.sender,
        session=incoming.session,
        schema_digest=CHAT_MESSAGE_SCHEMA_DIGEST,
        protocol_digest=CHAT_PROTOCOL_DIGEST,
    )
    envelope.encode_payload(message.model_dump_json())
    envelope.sign(identity)
    return envelope

app = FastAPI(
    title="Foldspace FastAPI Adapter",
    description="FastAPI reimplementation of the Foldspace Express adapter with placeholder handlers.",
    version="0.1.0",
)


JSONDict = Dict[str, Any]


class PricingRequest(BaseModel):
    input: Optional[JSONDict] = None


class PaymentRequest(BaseModel):
    payload: Optional[JSONDict] = None
    requirements: Optional[JSONDict] = None
    options: Optional[JSONDict] = None


class SessionPaymentRequest(PaymentRequest):
    pass


class AgentverseRegisterRequest(BaseModel):
    address: Optional[str] = None
    challenge: Optional[str] = None
    challengeResponse: Optional[str] = None
    challenge_response: Optional[str] = None
    agentType: Optional[str] = None
    agent_type: Optional[str] = None
    endpoint: Optional[str] = None
    prefix: Optional[str] = None


def _placeholder_response(endpoint: str, method: str, **extra: Any) -> JSONDict:
    base: JSONDict = {
        "endpoint": endpoint,
        "method": method,
        "status": "placeholder",
        "message": "FastAPI stub response.",
    }
    base.update({k: v for k, v in extra.items() if v is not None})
    return base


@app.get("/")
async def root():
    return {"message": "Foldspace Protocol chat adapter is running."}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/status")
async def status_check():
    return {"status": "OK - Agent is running"}


@app.post("/chat")
async def handle_chat(env: Envelope):
    envelope_meta = {
        "sender": env.sender,
        "recipient": getattr(env, "recipient", None),
        "protocol": getattr(env, "protocol", None),
        "session": getattr(env, "session", None),
        "trace": getattr(env, "trace", None),
    }
    print(f"[FastAPI][Chat] Envelope received: {envelope_meta}")

    try:
        msg = cast(ChatMessage, parse_envelope(env, ChatMessage))
    except Exception as exc:  # noqa: BLE001
        print(f"[FastAPI][Chat] Failed to parse envelope: {exc}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    message_text = msg.text()
    preview = message_text if not message_text or len(message_text) <= 200 else f"{message_text[:200]}..."
    print(
        "[FastAPI][Chat] Parsed message",
        {
            "message_id": getattr(msg, "id", None),
            "payload_type": type(msg).__name__,
            "preview": preview,
        },
    )

    print(f"[FastAPI][Chat] Placeholder mode active. Reply text: '{CHAT_PLACEHOLDER_RESPONSE}'.")

    ack_metadata: Dict[str, str] = {
        "placeholder": "true",
        "placeholder_response": CHAT_PLACEHOLDER_RESPONSE,
        "received_at": datetime.now(timezone.utc).isoformat(),
    }
    message_id = getattr(msg, "msg_id", None)
    if message_id:
        ack_metadata["message_id"] = str(message_id)
    session_value = envelope_meta.get("session")
    if session_value:
        ack_metadata["session"] = str(session_value)
    if env.sender:
        ack_metadata["sender"] = env.sender
    if preview:
        ack_metadata["message_preview"] = preview
    if not message_text:
        ack_metadata["placeholder_reason"] = "empty_message"

    warning_messages: list[str] = []
    delivery_statuses: list[JSONDict] = []
    send_status = "mailbox_disabled"

    if AGENT_IDENTITY:
        ack_envelope: Optional[Envelope] = None
        reply_envelope: Optional[Envelope] = None

        try:
            ack_envelope = _build_ack_envelope(
                incoming=env,
                message=msg,
                metadata=ack_metadata,
                identity=AGENT_IDENTITY,
            )
        except Exception as build_error:  # noqa: BLE001
            warning_messages.append(f"Failed to build acknowledgement envelope: {build_error}")
            print(f"[FastAPI][Chat] Error constructing acknowledgement: {build_error}")

        try:
            reply_envelope = _build_placeholder_message_envelope(
                incoming=env,
                reply_text=CHAT_PLACEHOLDER_RESPONSE,
                identity=AGENT_IDENTITY,
            )
        except Exception as build_error:  # noqa: BLE001
            warning_messages.append(f"Failed to build chat reply envelope: {build_error}")
            print(f"[FastAPI][Chat] Error constructing reply envelope: {build_error}")

        async def _submit_and_record(envelope: Envelope, envelope_type: str) -> None:
            success, error_detail = await submit_agentverse_envelope(envelope, envelope_type)
            delivery_statuses.append(
                {
                    "status": "submitted" if success else "failed",
                    "destination": env.sender,
                    "transport": "agentverse_mailbox",
                    "messageType": envelope_type,
                    "detail": error_detail,
                }
            )
            if not success and error_detail:
                warning_messages.append(f"{envelope_type} submission failed: {error_detail}")

        if ack_envelope:
            await _submit_and_record(ack_envelope, "chat_acknowledgement")
        if reply_envelope:
            await _submit_and_record(reply_envelope, "chat_message")

        attempts = len(delivery_statuses)
        successes = sum(1 for status_entry in delivery_statuses if status_entry["status"] == "submitted")
        if attempts == 0:
            send_status = "mailbox_construct_failed"
        elif successes == attempts:
            send_status = "mailbox_submitted"
        elif successes == 0:
            send_status = "mailbox_failed"
        else:
            send_status = "mailbox_partial"
    else:
        warning_messages.append("AGENT_SEED_PHRASE missing; outbound placeholder skipped.")
        print("[FastAPI][Chat] AGENT_SEED_PHRASE missing; outbound placeholder skipped.")

    return _placeholder_response(
        "/chat",
        "POST",
        placeholderResponse=CHAT_PLACEHOLDER_RESPONSE,
        messagePreview=preview,
        sendStatus=send_status,
        deliveryStatuses=delivery_statuses or None,
        warning=" | ".join(warning_messages) if warning_messages else None,
        ackMetadata=ack_metadata,
        **envelope_meta,
    )


@app.get("/request_pricing")
async def get_pricing(input: Optional[str] = None):
    session_id = str(uuid4())
    content = _placeholder_response("/request_pricing", "GET", sessionId=session_id, input=input)
    return JSONResponse(status_code=status.HTTP_402_PAYMENT_REQUIRED, content=content)


@app.post("/request_pricing")
async def post_pricing(body: PricingRequest):
    session_id = str(uuid4())
    content = _placeholder_response("/request_pricing", "POST", sessionId=session_id, input=body.input)
    return JSONResponse(status_code=status.HTTP_402_PAYMENT_REQUIRED, content=content)


@app.get("/sessions/{session_id}")
async def get_session(session_id: str):
    return _placeholder_response("/sessions/{sessionId}", "GET", sessionId=session_id)


@app.post("/sessions/{session_id}/payment")
async def post_session_payment(session_id: str, body: SessionPaymentRequest):
    if not body.payload or not body.requirements:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="payload and requirements are required",
        )
    return _placeholder_response(
        "/sessions/{sessionId}/payment",
        "POST",
        sessionId=session_id,
        payload=body.payload,
        requirements=body.requirements,
    )


@app.post("/facilitator/resources")
async def list_resources(body: JSONDict):
    return _placeholder_response("/facilitator/resources", "POST", request=body)


@app.get("/facilitator/supported")
async def supported_facilitator():
    return _placeholder_response("/facilitator/supported", "GET", kinds=["local_stub"])


@app.post("/payments/verify")
async def verify_payment(body: PaymentRequest):
    return _placeholder_response(
        "/payments/verify",
        "POST",
        payload=body.payload,
        requirements=body.requirements,
    )


@app.post("/payments/settle")
async def settle_payment(body: PaymentRequest):
    return _placeholder_response(
        "/payments/settle",
        "POST",
        payload=body.payload,
        requirements=body.requirements,
    )


@app.post("/payments/verify/onchain")
async def verify_onchain(body: PaymentRequest):
    return _placeholder_response(
        "/payments/verify/onchain",
        "POST",
        payload=body.payload,
        requirements=body.requirements,
    )


@app.post("/payments/settle/onchain")
async def settle_onchain(body: PaymentRequest):
    return _placeholder_response(
        "/payments/settle/onchain",
        "POST",
        payload=body.payload,
        requirements=body.requirements,
    )


@app.post("/agentverse/register")
async def register_agent(body: AgentverseRegisterRequest):
    if not body.address or not body.challenge or not (body.challengeResponse or body.challenge_response):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="address, challenge, and challengeResponse are required",
        )

    return _placeholder_response(
        "/agentverse/register",
        "POST",
        address=body.address,
        endpoint=body.endpoint,
        agentType=body.agentType or body.agent_type,
    )


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "3000"))
    uvicorn.run("scripts.fastapi_server:app", host="0.0.0.0", port=port, reload=True)
