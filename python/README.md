# Agentverse Registration Script

This lightweight Python entry point registers the Foldspace T2V price discovery endpoint as an Agentverse chat agent.

## Prerequisites
- Python 3.10+ (or compatible with `uagents-core`)
- Agentverse API key and agent seed phrase

## Setup
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Usage
Export the required secrets and run the script:
```bash
export AGENTVERSE_KEY="your-agentverse-api-key"
export AGENT_SEED_PHRASE="urge stay ... seed phrase ..."
python register_price_agent.py
```

Upon success the script prints the registered agent label and endpoint. Missing environment variables cause the script to exit with a non-zero status and a helpful message.
