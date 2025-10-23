#!/usr/bin/env python3
"""Register the T2V Price Discovery agent with Agentverse."""

from __future__ import annotations

import os
import sys

from uagents_core.utils.registration import (
    register_chat_agent,
    RegistrationRequestCredentials,
)

REGISTRATION_NAME = "T2V Price Discovery Agent"
REGISTRATION_ENDPOINT = "http://65.109.163.21:3000/request_pricing"


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
    try:
        register_chat_agent(
            REGISTRATION_NAME,
            REGISTRATION_ENDPOINT,
            active=True,
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
