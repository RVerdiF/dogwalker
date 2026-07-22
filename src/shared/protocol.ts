// Wire protocol shared by the broker (main) and the CLI shim.
// Framing: one JSON object per line (newline-delimited). One request →
// exactly one response line, though for `ask` the response arrives later
// (when the peer replies) on the same held connection.

export interface AskReq {
  cmd: 'ask';
  from: string;
  target: string;
  body: string;
}
export interface ReplyReq {
  cmd: 'reply';
  from: string;
  msgId: string;
  body: string;
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

export type BrokerRequest =
  | AskReq
  | ReplyReq
  | CheckReq
  | ListReq
  | ConnectReq;

export interface BrokerResponse {
  ok: boolean;
  error?: string;
  data?: unknown;
}

export function encode(msg: BrokerRequest | BrokerResponse): string {
  return JSON.stringify(msg) + '\n';
}
