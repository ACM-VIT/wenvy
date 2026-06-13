export interface SingleUseTokenState {
  readonly tokenHash: string;
  readonly expiresAt: string;
  readonly usedAt?: string;
  readonly browserFingerprintHash?: string;
  readonly issuedIp?: string;
}

export interface ConsumeTokenInput {
  readonly token: SingleUseTokenState;
  readonly now: Date;
  readonly browserFingerprintHash?: string;
  readonly ipAddress?: string;
}

export type ConsumeTokenResult =
  | { readonly status: "consumed"; readonly consumedAt: string }
  | { readonly status: "expired" }
  | { readonly status: "already-used" }
  | { readonly status: "browser-mismatch" }
  | { readonly status: "ip-mismatch" };

export function consumeSingleUseToken(input: ConsumeTokenInput): ConsumeTokenResult {
  if (Date.parse(input.token.expiresAt) <= input.now.getTime()) {
    return { status: "expired" };
  }

  if (input.token.usedAt !== undefined) {
    return { status: "already-used" };
  }

  if (
    input.token.browserFingerprintHash !== undefined &&
    input.token.browserFingerprintHash !== input.browserFingerprintHash
  ) {
    return { status: "browser-mismatch" };
  }

  if (input.token.issuedIp !== undefined && input.token.issuedIp !== input.ipAddress) {
    return { status: "ip-mismatch" };
  }

  return { status: "consumed", consumedAt: input.now.toISOString() };
}
