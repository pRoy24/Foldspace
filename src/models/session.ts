import type { PaymentPayload, PaymentRequirements } from "./payment";
import type { T2VCreateVideoInput, T2VStatusResponse } from "./t2v";

export interface QuoteSummary {
  asset: string;
  network: PaymentRequirements["network"];
  totalCredits: number;
  durationSeconds: number;
  imageModel: string;
  videoModel: string;
  rateCreditsPerSecond: number;
  pricePerCreditMinorUnits: string;
  pricePerCreditUsdc: string;
  totalMinorUnits: string;
  totalUsdc: string;
}

export type SessionStatus =
  | "payment_pending"
  | "payment_confirmed"
  | "creation_pending"
  | "creation_in_progress"
  | "completed"
  | "failed";

export interface SessionHistoryEntry {
  status: SessionStatus;
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface SessionRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;
  input: T2VCreateVideoInput;
  quote: QuoteSummary;
  requirement: PaymentRequirements;
  history: SessionHistoryEntry[];
  samsarRequestId?: string;
  samsarStatus?: T2VStatusResponse;
  resultUrl?: string;
  failureReason?: string;
  lastPaymentPayload?: PaymentPayload;
}

export interface SessionUpdate {
  status?: SessionStatus;
  samsarRequestId?: string;
  samsarStatus?: T2VStatusResponse;
  resultUrl?: string;
  failureReason?: string;
  lastPaymentPayload?: PaymentPayload;
  requirement?: PaymentRequirements;
  historyEntry?: SessionHistoryEntry;
  metadata?: Record<string, unknown>;
}
