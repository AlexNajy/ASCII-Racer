import { RESULTS_OPTIONS } from '../app/gameState.ts';
import { drawListScreen, listScreenLayout, type ListScreen, type MenuLayout } from './menuScreen.ts';
import { timerText } from './raceHud.ts';
import type { TextGrid } from './textGrid.ts';

// Unlimited's finish screen: the time where the menu has its title, the options below it like the menu's entries.
const TIME_COLOR = 0xff99ff; // the finish banner's time

function finishScreen(ticks: number): ListScreen {
  const time = timerText(ticks);
  return {
    title: time,
    smallTitle: time,
    titleColor: TIME_COLOR,
    entries: RESULTS_OPTIONS.map((label) => ({ label, enabled: true })),
  };
}

export function finishLayout(columns: number, rows: number, ticks: number): MenuLayout | null {
  return listScreenLayout(finishScreen(ticks), columns, rows);
}

export function drawFinishScreen(grid: TextGrid, ticks: number, selected: number): void {
  drawListScreen(grid, finishScreen(ticks), selected);
}
