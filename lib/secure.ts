// Room password → the room's address and its chat key.
//
// The password never leaves the players' browsers: the PeerJS server only sees a hash of it,
// and the invite link keeps it after "#", which browsers never send to any server.
// Chat is AES-GCM encrypted with a key made from the password (PBKDF2), so only people who
// know the password — the players — can read it. The WebRTC link itself is encrypted too.

const LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ"; // no I, L or O — easy to read out
export const CODE_LEN = 6;

export function newCode() {
  const pick = new Uint32Array(CODE_LEN);
  crypto.getRandomValues(pick);
  return Array.from(pick, (n) => LETTERS[n % LETTERS.length]).join("");
}

/** Typed or pasted passwords: letters only, upper case. */
export function cleanCode(raw: string) {
  return raw
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 7);
}

export const isCode = (code: string) => code.length >= CODE_LEN && code.length <= 7;

/** A stable 64-bit-ish hash (cyrb53, twice) so the room address doesn't show the password. */
export function roomId(code: string) {
  const h = (seed: number) => {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    const s = `typefast-room:${code}`;
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  };
  return `${h(1)}${h(2)}`;
}

/** Encrypted text, or plain text when this browser has no WebCrypto (a plain-http page). */
export type Sealed = { iv: string; ct: string } | { plain: string };

const toB64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function chatKey(code: string): Promise<CryptoKey | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  try {
    const base = await subtle.importKey("raw", new TextEncoder().encode(code), "PBKDF2", false, ["deriveKey"]);
    return await subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode("typefast-chat-v1"), iterations: 150_000 },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } catch {
    return null;
  }
}

export async function seal(key: CryptoKey | null, text: string): Promise<Sealed> {
  if (!key) return { plain: text };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
  return { iv: toB64(iv), ct: toB64(ct) };
}

/** The text, or null when it can't be read (wrong key, tampered, or no WebCrypto here). */
export async function unseal(key: CryptoKey | null, sealed: Sealed): Promise<string | null> {
  if ("plain" in sealed) return typeof sealed.plain === "string" ? sealed.plain : null;
  if (!key || typeof sealed.iv !== "string" || typeof sealed.ct !== "string" || sealed.ct.length > 4000) return null;
  try {
    const out = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(sealed.iv) }, key, fromB64(sealed.ct));
    return new TextDecoder().decode(out);
  } catch {
    return null;
  }
}
