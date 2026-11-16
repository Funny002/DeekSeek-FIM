import { FimRequestError } from "./errors";

/** Retry only errors where another attempt can reasonably succeed. */
export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof FimRequestError)) {
    return false;
  }
  if (error.kind === "timeout" || error.kind === "network") {
    return true;
  }
  if (error.kind !== "http" || error.status === undefined) {
    return false;
  }
  return error.status === 429 || error.status >= 500;
}

export function retryDelay(baseDelayMs: number, attempt: number): number {
  return Math.max(0, Math.floor(baseDelayMs)) * Math.max(1, attempt);
}
