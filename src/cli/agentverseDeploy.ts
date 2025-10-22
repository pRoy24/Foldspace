#!/usr/bin/env node
import type { AgentverseAgentPrefix, AgentverseAgentType } from "../config/agentverse";
import { AgentverseClient } from "../services";
import { env } from "../config/env";
import { Wallet } from "ethers";

interface CliOptions {
  address?: string;
  challenge?: string;
  challengeResponse?: string;
  agentType?: string;
  prefix?: string;
  endpoint?: string;
  privateKey?: string;
  outputJson?: boolean;
  help?: boolean;
}

interface DeploymentInput {
  address: string;
  challenge: string;
  challengeResponse: string;
  agentType?: AgentverseAgentType;
  prefix?: AgentverseAgentPrefix;
  endpoint?: string;
}

const AGENT_TYPE_VALUES = ["mailbox", "proxy", "custom"] as const satisfies readonly string[];
const PREFIX_VALUES = ["agent", "test-agent"] as const satisfies readonly string[];

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {};

  const setOption = (key: keyof CliOptions, value: string | boolean) => {
    if (typeof value === "boolean") {
      options[key] = value as never;
      return;
    }
    if (typeof value === "string") {
      options[key] = value.trim() as never;
    }
  };

  const lookup: Record<string, keyof CliOptions> = {
    address: "address",
    challenge: "challenge",
    "challenge-response": "challengeResponse",
    "challenge_response": "challengeResponse",
    challengeResponse: "challengeResponse",
    "agent-type": "agentType",
    agentType: "agentType",
    prefix: "prefix",
    endpoint: "endpoint",
    json: "outputJson",
    "private-key": "privateKey",
    privateKey: "privateKey"
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    if (arg === "--json") {
      options.outputJson = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      // Positional arguments are not supported.
      continue;
    }

    const raw = arg.slice(2);
    const [maybeKey, inline] = raw.split("=", 2);
    const key = lookup[maybeKey];

    if (!key) {
      throw new Error(`Unknown option: --${maybeKey}`);
    }

    if (inline !== undefined) {
      setOption(key, inline);
      continue;
    }

    const next = args[i + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for option: --${maybeKey}`);
    }

    setOption(key, next);
    i += 1;
  }

  return options;
}

function usage(): string {
  return `
Foldspace Agentverse deployment

Usage:
  npm run agentverse:deploy -- \\
    --address 0xYourAgentAddress \\
    --challenge "challenge-string" \\
    --challenge-response "signature" \\
    [--agent-type mailbox|proxy|custom] \\
    [--prefix agent|test-agent] \\
    [--endpoint https://your-api.example/path] \\
    [--json]

Flags:
  --address                Agent wallet address (derived from --private-key when omitted)
  --challenge              Challenge provided by Agentverse
  --challenge-response     Signature of the challenge (computed automatically when --private-key is present)
  --private-key            Hex-encoded private key used to sign the challenge
  --agent-type             Optional override for agent type (mailbox, proxy, custom)
  --prefix                 Optional override for agent prefix (agent, test-agent)
  --endpoint               Optional callback endpoint for the agent
  --json                   Emit JSON response instead of a formatted message
  --help                   Show this help message

Environment fallbacks:
  AGENTVERSE_AGENT_ADDRESS
  AGENTVERSE_CHALLENGE
  AGENTVERSE_CHALLENGE_RESPONSE
  AGENTVERSE_PRIVATE_KEY (falls back to X402_PRIVATE_KEY when omitted)
  AGENTVERSE_AGENT_TYPE
  AGENTVERSE_PREFIX
  AGENTVERSE_ENDPOINT

Ensure AGENTVERSE_API_KEY is configured before running.
`;
}

function coerceAgentType(value?: string): AgentverseAgentType | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if ((AGENT_TYPE_VALUES as readonly string[]).includes(normalized)) {
    return normalized as AgentverseAgentType;
  }
  throw new Error(`Unsupported agent type "${value}". Expected one of: ${AGENT_TYPE_VALUES.join(", ")}`);
}

function coercePrefix(value?: string): AgentverseAgentPrefix | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim();
  if ((PREFIX_VALUES as readonly string[]).includes(normalized)) {
    return normalized as AgentverseAgentPrefix;
  }
  throw new Error(`Unsupported agent prefix "${value}". Expected one of: ${PREFIX_VALUES.join(", ")}`);
}

function ensureHexPrefix(value: string): string {
  return value.startsWith("0x") ? value : `0x${value}`;
}

function deriveWallet(privateKey?: string): Wallet | undefined {
  if (!privateKey) {
    return undefined;
  }
  const normalized = ensureHexPrefix(privateKey.trim());
  return new Wallet(normalized);
}

async function resolveDeploymentInput(options: CliOptions): Promise<DeploymentInput> {
  const wallet = deriveWallet(
    options.privateKey ?? process.env.AGENTVERSE_PRIVATE_KEY ?? process.env.X402_PRIVATE_KEY
  );

  const address =
    options.address ??
    process.env.AGENTVERSE_AGENT_ADDRESS ??
    wallet?.address;

  if (!address) {
    throw new Error("Agent address is required. Provide --address or configure AGENTVERSE_AGENT_ADDRESS / --private-key.");
  }

  const challenge = options.challenge ?? process.env.AGENTVERSE_CHALLENGE;
  if (!challenge) {
    throw new Error("Challenge is required. Provide --challenge or set AGENTVERSE_CHALLENGE.");
  }

  let challengeResponse =
    options.challengeResponse ?? process.env.AGENTVERSE_CHALLENGE_RESPONSE;

  if (!challengeResponse) {
    if (!wallet) {
      throw new Error("Challenge response missing. Provide --challenge-response or configure --private-key to sign locally.");
    }
    challengeResponse = await wallet.signMessage(challenge);
  }

  const agentType = coerceAgentType(options.agentType ?? process.env.AGENTVERSE_AGENT_TYPE ?? env.agentverseDefaultAgentType);
  const prefix = coercePrefix(options.prefix ?? process.env.AGENTVERSE_PREFIX ?? env.agentverseDefaultPrefix);
  const endpoint = options.endpoint ?? process.env.AGENTVERSE_ENDPOINT ?? env.agentverseDefaultEndpoint;

  return {
    address,
    challenge,
    challengeResponse,
    agentType,
    prefix,
    endpoint
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(usage());
    return;
  }

  try {
    const input = await resolveDeploymentInput(args);
    const client = new AgentverseClient();
    const response = await client.registerAgent({
      address: input.address,
      challenge: input.challenge,
      challengeResponse: input.challengeResponse,
      agentType: input.agentType,
      endpoint: input.endpoint,
      prefix: input.prefix
    });

    if (args.outputJson) {
      console.log(JSON.stringify(response, null, 2));
      return;
    }

    console.log("Agentverse registration succeeded.");
    console.log(`  Address:   ${input.address}`);
    console.log(`  AgentType: ${input.agentType ?? "default"}`);
    if (input.prefix) {
      console.log(`  Prefix:    ${input.prefix}`);
    }
    if (input.endpoint) {
      console.log(`  Endpoint:  ${input.endpoint}`);
    }
    console.log(`  Response:  ${JSON.stringify(response)}`);
  } catch (error) {
    console.error("Agentverse deployment failed.");
    if (error instanceof Error) {
      console.error(`  ${error.message}`);
    } else {
      console.error(`  ${String(error)}`);
    }
    console.log();
    console.log(usage());
    process.exitCode = 1;
  }
}

void main();

