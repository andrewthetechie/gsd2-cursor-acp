export class TransportError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = "TransportError";
  }
}

export class ProcessCrashError extends TransportError {
  constructor(
    message: string,
    public readonly exitCode: number | null,
    public readonly signal: string | null,
  ) {
    super(message);
    this.name = "ProcessCrashError";
  }
}

export class RequestTimeoutError extends TransportError {
  constructor(
    public readonly method: string,
    public readonly timeoutMs: number,
  ) {
    super(`Request "${method}" timed out after ${timeoutMs}ms`);
    this.name = "RequestTimeoutError";
  }
}

export class JsonRpcError extends TransportError {
  constructor(
    message: string,
    code: number,
    data?: unknown,
  ) {
    super(message, code, data);
    this.name = "JsonRpcError";
  }
}
