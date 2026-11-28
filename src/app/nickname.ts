// The nickname rule, without anything of the browser, so the server checks runs with it too.

export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 12;

const NICKNAME_CHARACTER = /^[A-Za-z0-9 ]$/;

export function nicknameCharacter(char: string): boolean {
  return NICKNAME_CHARACTER.test(char);
}

// Spaces at the ends dropped, runs of spaces made one.
export function normaliseNickname(text: string): string {
  return text.trim().replace(/ +/g, ' ');
}

// Letters, digits and single spaces inside, 3 to 12 characters, as normaliseNickname leaves it.
export function validNickname(text: string): boolean {
  return (
    text === normaliseNickname(text) &&
    text.length >= NICKNAME_MIN &&
    text.length <= NICKNAME_MAX &&
    [...text].every(nicknameCharacter)
  );
}
