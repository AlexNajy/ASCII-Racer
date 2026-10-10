import type { CarSettings } from '../game/car.ts';
import type { ChaseCameraSettings } from '../game/chaseCamera.ts';
import type { CitySettings } from '../game/city.ts';

export const RenderMode = {
  Glyphs: 0,
  Brightness: 1,
  Scene: 2,
  FullResolution: 3,
  Normals: 4,
  NormalTexture: 5,
  CrtScene: 6,
  CrtGlyphs: 7,
} as const;
export type RenderMode = (typeof RenderMode)[keyof typeof RenderMode];

// What the movement keys and mouse control.
export const Movement = {
  FlyCamera: 0,
  Car: 1,
} as const;
export type Movement = (typeof Movement)[keyof typeof Movement];

export interface DevSettings {
  fovDegrees: number;
  cellWidth: number; // in CSS pixels; the height follows from the character shape
  viewDistance: number; // fog is complete here, and the far plane
  fogStart: number; // fog begins here
  renderMode: RenderMode;
  movement: Movement;
  noclip: boolean; 
  ambient: number; // light every surface gets, from 0 (black) to 1
  lightIntensity: number; // strength of the directional light
  glyphShade: number; // how much of the cell's shade goes into the glyph colour, 0 to 1
}

type NumberSetting = 'fovDegrees' | 'cellWidth' | 'viewDistance' | 'fogStart' | 'ambient' | 'lightIntensity' | 'glyphShade';

export interface DevMenu {
  setInfo(text: string): void;
}

export function createDevMenu(
  settings: DevSettings,
  citySettings: CitySettings,
  carSettings: CarSettings,
  chaseSettings: ChaseCameraSettings,
  onChange: (setting: keyof DevSettings) => void,
  onCityChange: () => void,
  onToggle: (open: boolean) => void,
): DevMenu {
  const panel = document.createElement('div');
  panel.id = 'dev-menu';
  panel.hidden = true;
  document.body.append(panel);

  const title = document.createElement('div');
  title.textContent = 'dev menu  ( ` to close )';
  panel.append(title);

  const info = document.createElement('div');
  info.style.whiteSpace = 'pre-line';
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

  function settingSlider(
    parent: HTMLElement,
    label: string,
    key: NumberSetting,
    min: number,
    max: number,
    step: number,
  ) {
    slider(parent, label, settings[key], min, max, step, (value) => {
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

  // Read by the car every tick, so no callback is needed.
  function carSlider(
    parent: HTMLElement,
    label: string,
    key: keyof CarSettings,
    min: number,
    max: number,
    step: number,
  ) {
    slider(parent, label, carSettings[key], min, max, step, (value) => (carSettings[key] = value));
  }

  // Read by the chase camera every frame, so no callback is needed.
  function chaseSlider(
    parent: HTMLElement,
    label: string,
    key: keyof ChaseCameraSettings,
    min: number,
    max: number,
    step: number,
  ) {
    slider(parent, label, chaseSettings[key], min, max, step, (value) => (chaseSettings[key] = value));
  }

  const viewPage = page('View');
  const cityPage = page('City');
  const buildingsPage = page('Buildings');
  const lightingPage = page('Lighting');
  const carPage = page('Car');
  const cameraPage = page('Camera');

  settingSlider(viewPage, 'FOV', 'fovDegrees', 30, 120, 1);
  settingSlider(viewPage, 'Cell width', 'cellWidth', 4, 16, 1);
  settingSlider(viewPage, 'View distance', 'viewDistance', 5, 1000, 1);
  settingSlider(viewPage, 'Fog start', 'fogStart', 0, 1000, 1);
  settingSlider(lightingPage, 'Ambient', 'ambient', 0, 1, 0.01);
  settingSlider(lightingPage, 'Directional light', 'lightIntensity', 0, 1, 0.01);
  settingSlider(lightingPage, 'Glyph shade', 'glyphShade', 0, 1, 0.01);
  carSlider(carPage, 'Acceleration (m/s²)', 'acceleration', 0, 20, 0.5);
  carSlider(carPage, 'Top speed (m/s)', 'topSpeed', 5, 60, 0.5);
  carSlider(carPage, 'Coast decel (m/s²)', 'coastDecel', 0, 10, 0.1);
  carSlider(carPage, 'Turn speed (rad/s)', 'turnSpeed', 0.05, 3, 0.05);
  carSlider(carPage, 'Drift turn speed (rad/s)', 'driftTurnSpeed', 0.1, 6, 0.1);
  carSlider(carPage, 'Drift follow (/s)', 'driftFollow', 0.1, 10, 0.1);
  carSlider(carPage, 'Grip follow (/s)', 'gripFollow', 1, 60, 1);
  carSlider(carPage, 'Traction time (s)', 'tractionTime', 0.05, 2, 0.05);
  carSlider(carPage, 'Regrip speed (m/s)', 'regripSpeed', 0.1, 10, 0.1);
  carSlider(carPage, 'Slip decel (m/s²)', 'slipDecel', 0, 40, 0.5);
  carSlider(carPage, 'Full turn speed (m/s)', 'fullTurnSpeed', 0.5, 20, 0.5);
  carSlider(carPage, 'Wall bounce', 'wallBounce', 0, 1, 0.05);
  chaseSlider(cameraPage, 'Distance (m)', 'distance', 2, 15, 0.1);
  chaseSlider(cameraPage, 'Height (m)', 'height', 0.5, 8, 0.1);
  chaseSlider(cameraPage, 'Look height (m)', 'lookHeight', 0, 3, 0.1);
  chaseSlider(cameraPage, 'Yaw follow (/s)', 'yawFollow', 0.5, 20, 0.5);
  chaseSlider(cameraPage, 'Speed pull back (m)', 'speedPullBack', 0, 6, 0.1);
  chaseSlider(cameraPage, 'Speed FOV boost (°)', 'speedFovBoost', 0, 40, 1);
  chaseSlider(cameraPage, 'Drift travel blend', 'driftTravelBlend', 0, 1, 0.05);

  function dropdown<K extends 'renderMode' | 'movement'>(
    parent: HTMLElement,
    label: string,
    key: K,
    values: Record<string, DevSettings[K]>,
  ): HTMLSelectElement {
    const row = document.createElement('label');
    const text = document.createElement('span');
    text.textContent = label;
    const select = document.createElement('select');
    for (const [name, value] of Object.entries(values)) {
      const option = document.createElement('option');
      option.textContent = name;
      option.value = String(value);
      option.selected = value === settings[key];
      select.append(option);
    }
    select.addEventListener('change', () => {
      settings[key] = Number(select.value) as DevSettings[K];
      onChange(key);
      // Release keyboard focus so flying keys don't pick options by their first letter.
      select.blur();
    });
    row.append(text, select);
    parent.append(row);
    return select;
  }

  dropdown(viewPage, 'Render mode', 'renderMode', RenderMode);
  const movementSelect = dropdown(viewPage, 'Movement', 'movement', Movement);
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'KeyC') return;
    settings.movement = settings.movement === Movement.FlyCamera ? Movement.Car : Movement.FlyCamera;
    movementSelect.value = String(settings.movement);
    onChange('movement');
  });

  const noclipRow = document.createElement('label');
  noclipRow.className = 'checkbox';
  const noclipText = document.createElement('span');
  noclipText.textContent = 'Noclip';
  const noclip = document.createElement('input');
  noclip.type = 'checkbox';
  noclip.checked = settings.noclip;
  noclip.addEventListener('change', () => {
    settings.noclip = noclip.checked;
    onChange('noclip');
    // Release keyboard focus so Space flies up instead of toggling the box.
    noclip.blur();
  });
  noclipRow.append(noclip, noclipText);
  viewPage.append(noclipRow);

  citySlider(cityPage, 'Seed', 'seed', 1, 1000, 1);
  citySlider(cityPage, 'Blocks per side', 'blocksPerSide', 3, 14, 1);
  citySlider(cityPage, 'Block size (m)', 'blockSize', 40, 100, 1);
  citySlider(cityPage, 'Road width (m)', 'roadWidth', 8, 20, 1);
  citySlider(cityPage, 'Avenue width (m)', 'avenueWidth', 8, 40, 1);
  citySlider(cityPage, 'Avenue density', 'avenueDensity', 0, 1, 0.05);
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
  citySlider(lightingPage, 'Street light spacing (m)', 'streetLightSpacing', 10, 60, 1);

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Backquote') return;
    panel.hidden = !panel.hidden;
    onToggle(!panel.hidden);
    event.preventDefault();
  });

  return {
    setInfo(text) {
      if (!panel.hidden) info.textContent = text;
    },
  };
}
