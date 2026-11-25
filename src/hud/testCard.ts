import { FIRST_PRINTABLE, LAST_PRINTABLE, type TextGrid } from './textGrid.ts';

// `?hud=test`: every printable character, anchored and clipped strings at the edges, a solid panel and a
// transparent string, to check the text layer by eye.
const PANEL_WIDTH = 38;
const SET_ROW_LENGTH = 32;

export function drawTestCard(grid: TextGrid): void {
  grid.clear();
  const { columns, rows } = grid;

  grid.write(0, 0, 'TL top left', { color: 0xff4040 });
  grid.write(-1, 0, 'top right TR', { color: 0x40ff40, align: 'right' });
  grid.write(0, -1, 'BL bottom left', { color: 0x4080ff });
  grid.write(-1, -1, 'bottom right BR', { color: 0xff40ff, align: 'right' });
  grid.write(-4, 1, 'clipped at the right edge', { color: 0xffff40 });
  grid.write(3, 2, 'clipped at the left edge', { color: 0x40ffff, align: 'right' });
  grid.write(Math.floor(columns / 2), 0, 'centre', { color: 0xffffff, align: 'center' });

  grid.box(2, 4, PANEL_WIDTH, 8, 0xffd040);
  grid.write(4, 5, 'TEXT LAYER', { color: 0xffffff, background: true });
  const colors = [0xffffff, 0xff8080, 0x80ff80];
  for (let code = FIRST_PRINTABLE, line = 0; code <= LAST_PRINTABLE; code += SET_ROW_LENGTH, line++) {
    let text = '';
    for (let c = code; c < code + SET_ROW_LENGTH && c <= LAST_PRINTABLE; c++) text += String.fromCharCode(c);
    grid.write(4, 7 + line, text, { color: colors[line], background: true });
  }

  let all = '';
  for (let c = FIRST_PRINTABLE; c <= LAST_PRINTABLE; c++) all += String.fromCharCode(c);
  grid.write(2, 13, all, { color: 0xffa040, background: true });

  grid.write(Math.floor(columns / 2), Math.floor(rows / 2), 'transparent: the scene shows around these letters', {
    color: 0x80ffff,
    align: 'center',
  });

  // Half off the bottom edge, so its frame is clipped.
  grid.box(-45, -4, 20, 8, 0x80ff80);
  grid.write(-43, -3, 'clipped box', { color: 0x80ff80, background: true });
}
