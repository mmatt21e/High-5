export const LEGACY_INVITE_CODE_LENGTH = 5;
export const INVITE_CODE_LENGTH = 8;

export function isSupportedInviteCodeLength(length: number): boolean {
  return length === LEGACY_INVITE_CODE_LENGTH || length === INVITE_CODE_LENGTH;
}
