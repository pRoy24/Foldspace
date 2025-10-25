export class HttpError extends Error {
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return typeof error === "object" && error !== null && "statusCode" in error;
}
