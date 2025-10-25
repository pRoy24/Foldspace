import os
from pathlib import Path

from dotenv import load_dotenv
from uagents_core.utils.registration import (
    register_chat_agent,
    RegistrationRequestCredentials,
)

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
        print(f"[Register] Warning: {ENV_FILE} not found, falling back to {fallback_env}")
        ENV_FILE = fallback_env

# Load variables from the project root .env so local runs have the required secrets available.
load_dotenv(ENV_FILE)

agentverse_api_key = os.getenv("AGENTVERSE_API_KEY")
if not agentverse_api_key:
    legacy_key = os.getenv("AGENTVERSE_KEY")
    if legacy_key:
        print("[Register] Warning: AGENTVERSE_KEY is deprecated; please rename it to AGENTVERSE_API_KEY.")
        agentverse_api_key = legacy_key
    else:
        raise RuntimeError("Missing AGENTVERSE_API_KEY in the root .env file.")

agent_seed_phrase = os.getenv("AGENT_SEED_PHRASE")
if not agent_seed_phrase:
    raise RuntimeError("Missing AGENT_SEED_PHRASE in the root .env file.")

agentverse_base_url = os.getenv("AGENTVERSE_BASE_URL")
if not agentverse_base_url:
    print("[Register] Warning: AGENTVERSE_BASE_URL not configured; default service URL will be assumed.")

agentverse_chat_agent_id = os.getenv("AGENTVERSE_CHAT_AGENT_ID")
if not agentverse_chat_agent_id:
    print("[Register] Warning: AGENTVERSE_CHAT_AGENT_ID is not configured.")


register_chat_agent(
    "T2V Chat",
    "http://65.109.163.21/chat",
    active=True,
    credentials=RegistrationRequestCredentials(
        agentverse_api_key=agentverse_api_key,
        agent_seed_phrase=agent_seed_phrase,
    ),
)
