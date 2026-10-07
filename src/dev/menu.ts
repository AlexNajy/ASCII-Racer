import type { CitySettings } from '../game/city.ts';

export const RenderMode = {
  Glyphs: 0,
  Brightness: 1,
  Scene: 2,
  FullResolution: 3,
} as const;
export type RenderMode = (typeof RenderMode)[keyof typeof RenderMode];

export interface DevSettings {
  fovDegrees: number;
  cellWidth: number; // in CSS pixels; the height follows from the character shape
  viewDistance: number;
  renderMode: RenderMode;
}

type NumberSetting = 'fovDegrees' | 'cellWidth' | 'viewDistance';

export interface DevMenu {
  setInfo(text: string): void;
}

export function createDevMenu(
  settings: DevSettings,
  citySettings: CitySettings,
  onChange: (setting: keyof DevSettings) => void,
  onCityChange: () => void,
): DevMenu {
  const panel = document.createElement('div');
  panel.id = 'dev-menu';
  panel.hidden = true;
  document.body.append(panel);

  const title = document.createElement('div');
  title.textContent = 'dev menu  ( ` to close )';
  panel.append(title);

  const info = document.createElement('div');
  panel.append(info);

  // Each page is a div; the page dropdown shows one and hides the rest.
  const pageRow = document.createElement('label');
  const pageText = document.createElement('span');
  pageText.textContent = 'Page';
  const pageSelect = document.createElement('select');
  pageRow.append(pageText, pageSelect);
  panel.append(pageRow);
  const pages: HTMLDivElement[] = [];

  function page(name: string): HTMLDivElement {
    const div = document.createElement('div');
    div.className = 'page';
    div.hidden = pages.length > 0;
    const option = document.createElement('option');
    option.textContent = name;
    option.value = String(pages.length);
    pageSelect.append(option);
    pages.push(div);
    panel.append(div);
    return div;
  }

  pageSelect.addEventListener('change', () => {
    pages.forEach((div, index) => (div.hidden = index !== Number(pageSelect.value)));
    // Release keyboard focus so flying keys don't pick options by their first letter.
    pageSelect.blur();
  });

  function slider(
    parent: HTMLElement,
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onInput: (value: number) => void,
  ) {
    const row = document.createElement('label');
    const text = document.createElement('span');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    text.textContent = `${label}: ${value}`;
    input.addEventListener('input', () => {
      text.textContent = `${label}: ${input.value}`;
      onInput(Number(input.value));
    });
    row.append(text, input);
    parent.append(row);
  }

  function settingSlider(label: string, key: NumberSetting, min: number, max: number, step: number) {
    slider(viewPage, label, settings[key], min, max, step, (value) => {
      settings[key] = value;
      onChange(key);
    });
  }

  function citySlider(
    parent: HTMLElement,
    label: string,
    key: keyof CitySettings,
    min: number,
    max: number,
    step: number,
  ) {
    slider(parent, label, citySettings[key], min, max, step, (value) => {
      citySettings[key] = value;
      onCityChange();
    });
  }

  const viewPage = page('View');
  const cityPage = page('City');
  const buildingsPage = page('Buildings');

  settingSlider('FOV', 'fovDegrees', 30, 120, 1);
  settingSlider('Cell width', 'cellWidth', 4, 16, 1);
  settingSlider('View distance', 'viewDistance', 5, 1000, 1);

  const modeRow = document.createElement('label');
  const modeText = document.createElement('span');
  modeText.textContent = 'Render mode';
  const select = document.createElement('select');
  for (const [name, value] of Object.entries(RenderMode)) {
    const option = document.createElement('option');
    option.textContent = name;
    option.value = String(value);
    option.selected = value === settings.renderMode;
    select.append(option);
  }
  select.addEventListener('change', () => {
    settings.renderMode = Number(select.value) as RenderMode;
    onChange('renderMode');
    // Release keyboard focus so flying keys don't pick options by their first letter.
    select.blur();
  });
  modeRow.append(modeText, select);
  viewPage.append(modeRow);

  citySlider(cityPage, 'Seed', 'seed', 1, 1000, 1);
  citySlider(cityPage, 'Blocks per side', 'blocksPerSide', 3, 14, 1);
  citySlider(cityPage, 'Block size (m)', 'blockSize', 40, 100, 1);
  citySlider(cityPage, 'Road width (m)', 'roadWidth', 8, 20, 1);
  citySlider(cityPage, 'Centre density', 'centreDensityChance', 0, 1, 0.05);
  citySlider(cityPage, 'Edge density', 'edgeDensityChance', 0, 1, 0.05);
  citySlider(buildingsPage, 'Wall height ×', 'wallHeight', 0.1, 3, 0.1);
  citySlider(buildingsPage, 'Houses height ×', 'housesHeight', 0.1, 3, 0.1);
  citySlider(buildingsPage, 'Low density height ×', 'lowDensityHeight', 0.1, 3, 0.1);
  citySlider(buildingsPage, 'Mid density height ×', 'midDensityHeight', 0.1, 3, 0.1);
  citySlider(buildingsPage, 'High-rise height ×', 'highRiseHeight', 0.1, 3, 0.1);
  citySlider(buildingsPage, 'Supermarket height ×', 'supermarketHeight', 0.1, 3, 0.1);
  citySlider(buildingsPage, 'Mid alley chance', 'midDensityAlleyChance', 0, 1, 0.025);
  citySlider(buildingsPage, 'Low empty lot chance', 'lowDensityEmptyChance', 0, 1, 0.025);
  citySlider(buildingsPage, 'Low merge chance', 'lowDensityMergeChance', 0, 1, 0.025);
  citySlider(buildingsPage, 'Low strip mall chance', 'lowDensityStripMallChance', 0, 1, 0.025);

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Backquote') return;
    panel.hidden = !panel.hidden;
    event.preventDefault();
  });

  return {
    setInfo(text) {
      if (!panel.hidden) info.textContent = text;
    },
  };
}
