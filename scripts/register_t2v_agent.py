import os

from dotenv import load_dotenv
from uagents_core.utils.registration import (
    register_chat_agent,
    RegistrationRequestCredentials,
)

# Load variables from .env so local runs have the required secrets available.
load_dotenv()


register_chat_agent(
    "T2V Chat",
    "http://65.109.163.21/chat",
    active=True,
    credentials=RegistrationRequestCredentials(
        agentverse_api_key=os.environ["AGENTVERSE_KEY"],
        agent_seed_phrase=os.environ["AGENT_SEED_PHRASE"],
    ),
)
