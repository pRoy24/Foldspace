#!/usr/bin/env python3
"""Register the T2V Price Discovery agent with Agentverse."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from uagents_core.utils.registration import (
    register_chat_agent,
    RegistrationRequestCredentials,
)

REGISTRATION_NAME = "T2V Pricing"
REGISTRATION_ENDPOINT = "http://65.109.163.21/request_pricing"
DESTINATION_WALLET = "0x182596E23D6d3bDCA7d2c7ab2089C9f625583352"
DESTINATION_CHAIN = "base-seplolia"


def _get_required_env(name: str) -> str:
    """Fetch a required environment variable or abort with a helpful message."""
    try:
        return os.environ[name]
    except KeyError as exc:
        missing = exc.args[0]
        print(
            f"Environment variable {missing!r} is required to register the agent.",
            file=sys.stderr,
        )
        raise


def main() -> int:
    """Register the price discovery endpoint with Agentverse."""
    load_dotenv(dotenv_path=Path(__file__).with_name(".env"))
    try:
        register_chat_agent(
            REGISTRATION_NAME,
            REGISTRATION_ENDPOINT,
            active=True,
            metadata={
                "destination_wallet": DESTINATION_WALLET,
                "destination_chain": DESTINATION_CHAIN,
            },
            credentials=RegistrationRequestCredentials(
                agentverse_api_key=_get_required_env("AGENTVERSE_KEY"),
                agent_seed_phrase=_get_required_env("AGENT_SEED_PHRASE"),
            ),
        )
    except KeyError:
        return 1

    print(f"Registered {REGISTRATION_NAME!r} at {REGISTRATION_ENDPOINT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
