// Identifiants d'une partie en ligne, tirés au hasard (crypto du runtime) : celui de la salle, qui fait le lien
// d'invitation, et le jeton secret de chaque joueur.

/** Lettres et chiffres sans ceux qu'on confond (0 et o, 1 et l) : 12 de suite, environ 60 bits. */
const ROOM_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
export const ROOM_ID_LENGTH = 12;

export function newRoomId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(ROOM_ID_LENGTH)), (byte) => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]).join('');
}

/** Jeton secret d'une place : 128 bits en hexadécimal. */
export function newToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const isRoomId = (id: string): boolean => id.length === ROOM_ID_LENGTH && [...id].every((c) => ROOM_ALPHABET.includes(c));
