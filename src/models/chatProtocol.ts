export interface ChatProtocolEnvelope {
  version: number;
  sender: string;
  target: string;
  session: string;
  schema_digest: string;
  protocol_digest?: string | null;
  payload?: string | null;
  expires?: number | null;
  nonce?: number | null;
  signature?: string | null;
}

export interface ChatProtocolBaseContent {
  type: string;
  [key: string]: unknown;
}

export interface ChatProtocolTextContent extends ChatProtocolBaseContent {
  type: "text";
  text: string;
}

export interface ChatProtocolMetadataContent extends ChatProtocolBaseContent {
  type: "metadata";
  metadata?: Record<string, unknown>;
}

export type ChatProtocolContent =
  | ChatProtocolTextContent
  | ChatProtocolMetadataContent
  | ChatProtocolBaseContent;

export interface ChatProtocolMessage {
  timestamp?: string | null;
  msg_id?: string | null;
  content?: ChatProtocolContent[] | null;
}

