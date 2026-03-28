// JSON-RPC 2.0 error codes (from spec + reference adapter)
export const JsonRpcErrorCode = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

export type JsonRpcErrorCode =
  (typeof JsonRpcErrorCode)[keyof typeof JsonRpcErrorCode];

// JSON-RPC 2.0 message types
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: JsonRpcErrorObject;
}

/** Wire-format JSON-RPC 2.0 error object (not a thrown Error) */
export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

// Server-initiated request (has method AND id, needs response back)
export interface JsonRpcServerRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

// Union of all inbound message types
export type JsonRpcMessage =
  | JsonRpcResponse
  | JsonRpcNotification
  | JsonRpcServerRequest;

// Internal pending request tracker
export interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
  method: string;
}

// Transport configuration
export interface TransportOptions {
  /** Path to cursor-agent binary. Default: "cursor-agent" (from PATH) */
  binaryPath?: string;
  /** Arguments to pass after the binary name. Default: ["acp"] */
  binaryArgs?: string[];
  /** Request timeout in ms. Default: 60000 (60s) */
  requestTimeout?: number;
  /** Crash window in ms for D-03 restart logic. Default: 30000 (30s) */
  crashWindowMs?: number;
  /** Max restarts within crash window before fatal. Default: 1 */
  maxRestartsInWindow?: number;
  /** Graceful shutdown timeout in ms for D-04 SIGTERM->SIGKILL. Default: 5000 */
  shutdownTimeout?: number;
}

export const DEFAULT_TRANSPORT_OPTIONS: Required<TransportOptions> = {
  binaryPath: "cursor-agent",
  binaryArgs: ["acp"],
  requestTimeout: 60_000,
  crashWindowMs: 30_000,
  maxRestartsInWindow: 1,
  shutdownTimeout: 5_000,
};
