export type FimFailureKind =
  | "aborted"
  | "timeout"
  | "network"
  | "http"
  | "invalid";

export class FimRequestError extends Error {
  readonly kind: FimFailureKind;
  readonly status: number | undefined;

  constructor(message: string, kind: FimFailureKind, status?: number) {
    super(message);
    this.name = "FimRequestError";
    this.kind = kind;
    this.status = status;
  }
}
