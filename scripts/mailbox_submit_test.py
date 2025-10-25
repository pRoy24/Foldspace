#!/usr/bin/env python3
"""
Utility script that submits a signed chat message envelope to the Agentverse mailbox.

By default it loops the message back to the derived agent address so you can
quickly validate credentials and connectivity. Override --target to reach a
different agent once you have their registered handle.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Optional
from uuid import UUID, uuid4

import requests
from dotenv import load_dotenv
from uagents_core.contrib.protocols.chat import ChatMessage, TextContent, chat_protocol_spec
from uagents_core.envelope import Envelope
from uagents_core.identity import Identity
from uagents_core.models import Model

BASE_DIR = Path(__file__).parent
PROJECT_ROOT = BASE_DIR.parent
DEFAULT_ENV_FILE = PROJECT_ROOT / ".env"


def resolve_env_file() -> Path:
    override = os.getenv("FOLDSPACE_ENV_FILE")
    if override:
        candidate = Path(override)
        if candidate.exists():
            return candidate
        print(f"[MailboxTest] FOLDSPACE_ENV_FILE '{candidate}' not found; falling back to defaults.")

    if DEFAULT_ENV_FILE.exists():
        return DEFAULT_ENV_FILE

    fallback = BASE_DIR / ".env"
    if fallback.exists():
        print(f"[MailboxTest] Using fallback env file {fallback}")
        return fallback

    return DEFAULT_ENV_FILE


def coerce_uuid(value: Optional[str]) -> UUID:
    if not value:
        return uuid4()
    try:
        return UUID(value)
    except ValueError as exc:
        raise ValueError(f"Invalid session UUID '{value}': {exc}") from exc


def build_envelope(identity: Identity, target: str, session: UUID, message_text: str, version: int) -> Envelope:
    message = ChatMessage(content=[TextContent(text=message_text)])
    envelope = Envelope(
        version=version,
        sender=identity.address,
        target=target,
        session=session,
        schema_digest=Model.build_schema_digest(ChatMessage),
        protocol_digest=chat_protocol_spec.digest,
    )
    envelope.encode_payload(message.model_dump_json())
    envelope.sign(identity)
    return envelope


def submit_envelope(endpoint: str, api_key: str, envelope: Envelope, timeout: float) -> requests.Response:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = json.dumps(envelope.model_dump(mode="json"), default=str)
    print(
        "[MailboxTest] Submitting envelope",
        {
            "url": endpoint,
            "sender": envelope.sender,
            "target": envelope.target,
            "session": str(envelope.session),
            "schemaDigest": envelope.schema_digest,
            "protocolDigest": envelope.protocol_digest,
            "payloadBytes": len(payload),
        },
    )
    response = requests.post(endpoint, headers=headers, data=payload, timeout=timeout)
    return response


def main() -> None:
    parser = argparse.ArgumentParser(description="Submit a signed chat envelope to Agentverse.")
    parser.add_argument(
        "--target",
        help="Agentverse handle to receive the message. Defaults to the derived agent address.",
    )
    parser.add_argument(
        "--message",
        default="Hello from mailbox_submit_test.py!",
        help="Text content to send.",
    )
    parser.add_argument(
        "--session",
        help="Optional session UUID. If omitted, a random UUID is generated.",
    )
    parser.add_argument(
        "--version",
        type=int,
        default=1,
        help="Envelope version to use (default: 1).",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=10.0,
        help="HTTP timeout in seconds (default: 10).",
    )
    parser.add_argument(
        "--base-url",
        help="Override Agentverse base URL. Defaults to AGENTVERSE_BASE_URL or https://agentverse.ai/.",
    )
    args = parser.parse_args()

    env_file = resolve_env_file()
    if env_file.exists():
        load_dotenv(env_file)
        print(f"[MailboxTest] Loaded environment variables from {env_file}")
    else:
        print(f"[MailboxTest] Warning: env file {env_file} does not exist. Relying on process env.")

    api_key = os.getenv("AGENTVERSE_API_KEY")
    if not api_key:
        raise RuntimeError("AGENTVERSE_API_KEY is required.")

    seed_phrase = os.getenv("AGENT_SEED_PHRASE")
    if not seed_phrase:
        raise RuntimeError("AGENT_SEED_PHRASE is required.")

    base_url = args.base_url or os.getenv("AGENTVERSE_BASE_URL") or "https://agentverse.ai/"
    if not base_url.endswith("/"):
        base_url = f"{base_url}/"
    submit_url = f"{base_url}v1/submit"

    identity = Identity.from_seed(seed_phrase, 0)
    target = args.target or identity.address
    session = coerce_uuid(args.session)

    envelope = build_envelope(
        identity=identity,
        target=target,
        session=session,
        message_text=args.message,
        version=args.version,
    )

    response = submit_envelope(submit_url, api_key, envelope, args.timeout)
    print(
        "[MailboxTest] Agentverse response",
        {
            "status": response.status_code,
            "reason": response.reason,
            "body": response.text,
        },
    )
    response.raise_for_status()


if __name__ == "__main__":
    main()
