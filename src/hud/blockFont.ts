// Big characters drawn with '#' cells, 5 rows tall, for the HUD's numbers and banners.
export const BLOCK_HEIGHT = 5;
export const BLOCK_GAP = 1; // blank columns between characters
export const FILLED = '#';

const GLYPHS: Record<string, string[]> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '###', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '..#', '..#', '..#'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
  // Blank columns either side keep the groups of digits apart.
  ':': ['...', '.#.', '...', '.#.', '...'],
  '.': ['...', '...', '...', '...', '.#.'],
  ' ': ['...', '...', '...', '...', '...'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['###', '#..', '#.#', '#.#', '###'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['###', '#.#', '#.#', '#.#', '###'],
  S: ['###', '#..', '###', '..#', '###'],
};

function glyph(char: string): string[] {
  const rows = GLYPHS[char];
  if (!rows) throw new Error(`no block glyph for "${char}"`);
  return rows;
}

export function blockWidth(text: string, scale = 1): number {
  if (text.length === 0) return 0;
  let width = 0;
  for (const char of text) width += glyph(char)[0].length;
  return (width + (text.length - 1) * BLOCK_GAP) * scale;
}

// `text` as rows of '#' and ' ', each cell `scale` × `scale`.
export function blockRows(text: string, scale = 1): string[] {
  const rows: string[] = [];
  for (let y = 0; y < BLOCK_HEIGHT; y++) {
    const row = [...text].map((char) => glyph(char)[y].replaceAll('.', ' ')).join(' '.repeat(BLOCK_GAP));
    const wide = [...row].map((cell) => cell.repeat(scale)).join('');
    for (let i = 0; i < scale; i++) rows.push(wide);
  }
  return rows;
}
