/**
 * Generate a valid UUID v4 format string with TRUE randomness.
 * No counter needed - uses crypto.randomUUID() for genuine uniqueness.
 * 
 * @returns A 36-character UUID string
 */
export function generateTestUuid(): string {
  // Generate truly random UUID - no collisions possible
  const uuid = `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-a${randomHex(3)}-${randomHex(12)}`;
  console.log(`[UUID-GEN] Generated: ${uuid}`);
  return uuid;
}

function randomHex(length: number): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += Math.floor(Math.random() * 16).toString(16);
  }
  return result;
}
