// Wire protocol shared by the broker (main) and the CLI shim.
// Framing: one JSON object per line (newline-delimited). One request →
// exactly one response line, though for `ask` the response arrives later
// (when the peer replies) on the same held connection.

export interface AskReq {
  cmd: 'ask';
  from: string;
  target?: string;
  /** Explicit connected terminals; a single target remains backward compatible. */
  targets?: string[];
  /** Every directly connected terminal (never notes or portals). */
  all?: boolean;
  exclude?: string[];
  /** Request a stable JSON envelope from the CLI shim. */
  json?: boolean;
  /** When set, contract rules apply: loop-until-valid against its JSON Schema. */
  contract?: string;
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

/** Manage the workspace's local contracts (shared config, not graph-gated). */
export interface ContractReq {
  cmd: 'contract';
  from: string;
  op: 'list' | 'inspect' | 'create' | 'edit' | 'delete';
  /** Contract name: the target for inspect/edit/delete, the new name for create. */
  target?: string;
  /** edit: rename the contract to this. */
  name?: string;
  /** create/edit: JSON Schema as a raw JSON string (the broker parses/validates). */
  schema?: string;
  /** create/edit: retry budget. */
  attempts?: number;
  /** create/edit: per-attempt timeout in ms. */
  timeoutMs?: number;
  /** create/edit: prompt re-sent to the peer after a failed attempt. */
  rejectionPrompt?: string;
  /** create/edit: fallback value as a raw JSON string (the broker parses). */
  fallback?: string;
}

/** Walker (manager agent) verbs, PRODUCT.md §5.4. Only Walker terminals may. */
export interface WalkerReq {
  cmd: 'recruit' | 'dismiss' | 'assign';
  from: string;
  /** recruit: preset to spawn. */
  agent?: string;
  /** recruit/assign: the recruit's role (its label). */
  role?: string;
  /** recruit: floor to place the recruit on (unused for now → Walker's layer). */
  floor?: string;
  /** dismiss/assign: the recruit node (id or name). */
  target?: string;
}

export type BrokerRequest =
  | AskReq
  | CheckReq
  | ListReq
  | ConnectReq
  | NoteReq
  | PortalReq
  | ContractReq
  | WalkerReq;

export interface BrokerResponse {
  ok: boolean;
  error?: string;
  data?: unknown;
}

export function encode(msg: BrokerRequest | BrokerResponse): string {
  return JSON.stringify(msg) + '\n';
}
