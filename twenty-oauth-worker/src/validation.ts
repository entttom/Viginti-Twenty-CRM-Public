// Strict input validation for public request parameters.
//
// All validators are deliberately conservative: they accept only the exact
// RFC-defined character sets and reject everything else. None of these values
// is ever logged.

const NUL = String.fromCharCode(0);

/** Provider IDs: 3-64 chars, lowercase letters, digits and hyphens only. */
const PROVIDER_ID_RE = /^[a-z0-9-]{3,64}$/;

/** OAuth `state`: 32-256 chars from the unreserved URL-safe set. */
const STATE_RE = /^[A-Za-z0-9\-._~]{32,256}$/;

/** PKCE S256 `code_challenge`: exactly 43 base64url chars (no padding). */
const CODE_CHALLENGE_RE = /^[A-Za-z0-9\-_]{43}$/;

/** PKCE `code_verifier`: 43-128 chars from the RFC 7636 unreserved set. */
const CODE_VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;

const ALLOWED_PROMPTS = new Set(['login', 'consent']);

export function isValidProviderId(value: unknown): value is string {
  return typeof value === 'string' && PROVIDER_ID_RE.test(value);
}

export function isValidState(value: unknown): value is string {
  return typeof value === 'string' && STATE_RE.test(value);
}

export function isValidCodeChallenge(value: unknown): value is string {
  return typeof value === 'string' && CODE_CHALLENGE_RE.test(value);
}

export function isValidCodeVerifier(value: unknown): value is string {
  return typeof value === 'string' && CODE_VERIFIER_RE.test(value);
}

export function isValidPrompt(value: unknown): value is string {
  return typeof value === 'string' && ALLOWED_PROMPTS.has(value);
}

/** Authorization code: non-empty string, <= 8192 chars, no NUL byte. */
export function isValidAuthorizationCode(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 8192 &&
    !value.includes(NUL)
  );
}

/** Refresh token: non-empty string, <= 16384 chars, no NUL byte. */
export function isValidRefreshToken(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 16384 &&
    !value.includes(NUL)
  );
}

/**
 * Ensure a parsed JSON object contains only the allowed keys. Used to reject
 * any attempt to inject issuer / endpoint / client_id / scope etc. into the
 * token and refresh routes.
 */
export function hasOnlyKeys(obj: Record<string, unknown>, allowed: string[]): boolean {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(obj)) {
    if (!allowedSet.has(key)) {
      return false;
    }
  }
  return true;
}
