// A lobby's short code, typed by the players who join. No look-alikes: no 0 O, 1 I L.
export const LOBBY_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const LOBBY_CODE_LENGTH = 6;

// App flow: `random` is a source of numbers in [0, 1) such as Math.random or crypto.getRandomValues scaled, never
// the simulation's generator.
export function randomLobbyCode(random: () => number): string {
  let code = '';
  for (let i = 0; i < LOBBY_CODE_LENGTH; i++) {
    const scaled = Math.floor(random() * LOBBY_CODE_ALPHABET.length);
    const index = Number.isFinite(scaled) ? Math.min(LOBBY_CODE_ALPHABET.length - 1, Math.max(0, scaled)) : 0;
    code += LOBBY_CODE_ALPHABET[index];
  }
  return code;
}

export function validLobbyCode(code: string): boolean {
  return code.length === LOBBY_CODE_LENGTH && [...code].every((char) => LOBBY_CODE_ALPHABET.includes(char));
}

// Upper case, with spaces and dashes taken out; null unless that is a valid code.
export function normaliseLobbyCode(text: string): string | null {
  const code = text.replace(/[\s-]/g, '').toUpperCase();
  return validLobbyCode(code) ? code : null;
}
