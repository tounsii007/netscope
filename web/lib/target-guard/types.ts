export type GuardResult =
  | { ok: true }
  | { ok: false; reasonKey: GuardReasonKey };

export type GuardReasonKey =
  | "blocked_localhost"
  | "blocked_private"
  | "blocked_link_local"
  | "blocked_metadata"
  | "blocked_reserved_tld"
  | "invalid_target";
