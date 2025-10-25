import os
from pathlib import Path
from typing import Any, Dict, Optional, cast
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from uagents_core.contrib.protocols.chat import ChatMessage, TextContent
from uagents_core.envelope import Envelope
from uagents_core.identity import Identity
from uagents_core.utils.messages import parse_envelope, send_message_to_agent

BASE_DIR = Path(__file__).parent
PROJECT_ROOT = BASE_DIR.parent
env_override = os.getenv("FOLDSPACE_ENV_FILE")
if env_override:
    ENV_FILE = Path(env_override)
else:
    root_env = PROJECT_ROOT / ".env"
    script_env = BASE_DIR / ".env"
    ENV_FILE = root_env if root_env.exists() else script_env

load_dotenv(ENV_FILE)

AGENT_SEED_PHRASE = os.getenv("AGENT_SEED_PHRASE")
identity: Optional[Identity]
if AGENT_SEED_PHRASE:
    identity = Identity.from_seed(AGENT_SEED_PHRASE, 0)
else:
    identity = None
    print(
        "[FastAPI] Warning: AGENT_SEED_PHRASE is not configured. "
        "Outbound /chat responses will be disabled."
    )

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

    warning: Optional[str] = None
    send_status = "skipped"
    delivery_statuses: Optional[list[JSONDict | str]] = None

    if identity:
        statuses = send_message_to_agent(
            destination=env.sender,
            msg=ChatMessage([TextContent("Thanks for the message!")]),
            sender=identity,
        )

        if isinstance(statuses, list):
            delivery_statuses = [
                status.model_dump() if hasattr(status, "model_dump") else str(status) for status in statuses
            ]
            if not statuses:
                send_status = "no_endpoints"
            elif any(
                entry.get("status") == "sent" for entry in delivery_statuses if isinstance(entry, dict)
            ):
                send_status = "sent"
            else:
                send_status = "failed"
        else:
            delivery_statuses = [str(statuses)]
            send_status = "unknown"

        print(f"[FastAPI][Chat] Delivery statuses: {delivery_statuses}")
    else:
        warning = "AGENT_SEED_PHRASE not configured; outbound reply skipped."
        send_status = "disabled"
        print(f"[FastAPI][Chat] {warning}")

    return _placeholder_response(
        "/chat",
        "POST",
        messagePreview=preview,
        sendStatus=send_status,
        deliveryStatuses=delivery_statuses,
        warning=warning,
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
