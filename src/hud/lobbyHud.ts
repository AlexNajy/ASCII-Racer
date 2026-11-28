import { MAX_PLAYERS } from '../game/lobbySettings.ts';
import { FRAME_COLOR } from './raceHud.ts';
import type { TextGrid } from './textGrid.ts';

// The lobby's small panel, top left: the code to tell others and how many are in. A fixed rectangle that writes
// every cell once per call.
export interface LobbyHudValues {
  code: string;
  players: number;
}

const CODE_COLOR = 0xffd070;
const PLAYERS_COLOR = 0x909090;
const PADDING = 1;
const CODE_LABEL = 'LOBBY ';

export function lobbyLines({ code, players }: LobbyHudValues): [string, string] {
  return [`${CODE_LABEL}${code}`, `${Math.min(players, MAX_PLAYERS)}/${MAX_PLAYERS} players`];
}

export function lobbyPanelSize(values: LobbyHudValues): { width: number; height: number } {
  return { width: Math.max(...lobbyLines(values).map((line) => line.length)) + 2 * PADDING + 2, height: 4 };
}

export function drawLobbyPanel(grid: TextGrid, left: number, top: number, values: LobbyHudValues): void {
  const { width, height } = lobbyPanelSize(values);
  const inner = width - 2;
  const frame = `+${'-'.repeat(inner)}+`;
  grid.write(left, top, frame, { color: FRAME_COLOR, background: true });
  grid.write(left, top + height - 1, frame, { color: FRAME_COLOR, background: true });
  lobbyLines(values).forEach((line, i) => {
    const row = top + 1 + i;
    grid.put(left, row, '|', FRAME_COLOR, true);
    grid.write(left + 1, row, ' '.repeat(PADDING) + line.padEnd(inner - PADDING, ' '), { color: i === 0 ? CODE_COLOR : PLAYERS_COLOR, background: true });
    grid.put(left + width - 1, row, '|', FRAME_COLOR, true);
  });
}
