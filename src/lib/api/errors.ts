/** Shared API error contract used by both the server and the browser client. */

export type ErrorKind =
  | "unauthorized"
  | "auth"
  | "deviceUnreachable"
  | "timeout"
  | "commandFailed"
  | "validation"
  | "unknown";

export type ApiErrorBody = {
  kind: ErrorKind;
  message: string;
  detail?: string;
};

export type ApiEnvelope<T> = { data: T } | { error: ApiErrorBody };

/**
 * An anticipated failure raised by the device/service layer. Unlike a thrown
 * `Error` (which `mapError` reports as an opaque 500), the message of an
 * `AppError` is written for the operator and is forwarded verbatim to the UI.
 */
export class AppError extends Error {
  readonly status: number;
  readonly kind: ErrorKind;
  constructor(message: string, status = 400, kind: ErrorKind = "validation") {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.kind = kind;
  }
}

/** `AppError` for a command the device rejected or that exited non-zero. */
export class DeviceCommandError extends AppError {
  constructor(message: string) {
    super(message, 502, "commandFailed");
    this.name = "DeviceCommandError";
  }
}

/** Client-side error carrying the structured kind from the server. */
export class ApiError extends Error {
  readonly kind: ErrorKind | string;
  readonly status: number;
  readonly detail?: string;
  constructor(kind: ErrorKind | string, message: string, status: number, detail?: string) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.detail = detail;
  }
}
