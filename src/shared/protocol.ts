// Wire protocol shared by the broker (main) and the CLI shim.
// Framing: one JSON object per line (newline-delimited). One request →
// exactly one response line, though for `ask` the response arrives later
// (when the peer replies) on the same held connection.

export interface AskReq {
  cmd: 'ask';
  from: string;
  target: string;
  body: string;
  /** How long to wait for the target's answer, in ms (clamped by the broker). */
  timeoutMs?: number;
}
export interface CheckReq {
  cmd: 'check';
  from: string;
  target: string;
}
export interface ListReq {
  cmd: 'list';
  from: string;
}
export interface ConnectReq {
  cmd: 'connect' | 'disconnect';
  from: string;
  target: string;
}
export interface NoteReq {
  cmd: 'note';
  from: string;
  op: 'read' | 'append' | 'write';
  target: string;
  body?: string;
  /** read only: follow note↔note leashes and concatenate the whole chain. */
  chain?: boolean;
}

export interface PortalReq {
  cmd: 'portal';
  from: string;
  op:
    | 'new'
    | 'navigate'
    | 'click'
    | 'type'
    | 'scroll'
    | 'screenshot'
    | 'js'
    | 'dom'
    | 'console';
  /** The target portal (unused for `new`, which creates one wired to the caller). */
  target: string;
  /** url (navigate) · selector (click/type/dom) · code (js). */
  arg?: string;
  /** text to type. */
  value?: string;
  /** scroll deltas. */
  x?: number;
  y?: number;
}

export type BrokerRequest =
  | AskReq
  | CheckReq
  | ListReq
  | ConnectReq
  | NoteReq
  | PortalReq;

export interface BrokerResponse {
  ok: boolean;
  error?: string;
  data?: unknown;
}

export function encode(msg: BrokerRequest | BrokerResponse): string {
  return JSON.stringify(msg) + '\n';
}
