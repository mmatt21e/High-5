/** bcrypt only uses the first 72 bytes of a password. */
export const BCRYPT_MAX_PASSWORD_BYTES = 72;

export function fitsBcryptPasswordLimit(password: string): boolean {
  return (
    new TextEncoder().encode(password).byteLength <= BCRYPT_MAX_PASSWORD_BYTES
  );
}
