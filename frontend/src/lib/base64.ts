/**
 * Browser-safe base64 <-> bytes helpers for the SSH terminal WebSocket.
 * (Node's `Buffer` is not available in the browser.)
 */

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export const base64ToBytes = (b64: string): Uint8Array =>
  Uint8Array.from(atob(b64), c => c.charCodeAt(0));

/** Encode a (possibly UTF-8) string to base64. */
export const stringToBase64 = (str: string): string => bytesToBase64(new TextEncoder().encode(str));
