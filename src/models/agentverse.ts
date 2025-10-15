import type { AgentverseAgentType, AgentverseAgentPrefix } from "../config/agentverse";

export { AgentverseAgentType, AgentverseAgentPrefix };

export interface AgentverseRegistrationRequest {
  address: string;
  challenge: string;
  challengeResponse: string;
  agentType?: AgentverseAgentType;
  endpoint?: string;
  prefix?: AgentverseAgentPrefix;
}

export interface AgentverseRegistrationResponse {
  success: boolean;
}

