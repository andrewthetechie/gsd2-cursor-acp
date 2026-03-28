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

/**
 * Thrown by {@link registerCursorAcpProvider} when the cursor-agent binary is not found.
 * Includes an actionable message with installation instructions.
 * @throws When ENOENT is returned by the binary check (cursor-agent not on PATH).
 */
export class CursorCliNotFoundError extends TransportError {
  constructor() {
    super(
      'cursor-agent not found. Install Cursor from https://cursor.com and ' +
        'ensure cursor-agent is on your PATH, then run `cursor-agent login`.',
    );
    this.name = 'CursorCliNotFoundError';
  }
}

/**
 * Thrown by {@link AcpSessionPool} when ACP authentication fails (expired token or missing login).
 * The original error is preserved in `cause` for inspection.
 * After this error, the session pool resets and allows a retry.
 * @throws During the `authenticate` phase of ACP initialization.
 */
export class CursorAuthError extends TransportError {
  constructor(
    message: string,
    public readonly cause: unknown,
  ) {
    super(message);
    this.name = 'CursorAuthError';
  }
}

/**
 * Thrown when an ACP `session/new` or `session/prompt` request fails.
 * Mapped to a GSD-2 `error` event by the provider's catch block.
 * The error name ("CursorSessionError") appears in the `errorMessage` field of the error event.
 */
export class CursorSessionError extends TransportError {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'CursorSessionError';
  }
}
