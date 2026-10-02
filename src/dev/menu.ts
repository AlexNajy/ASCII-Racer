export const RenderMode = {
  Glyphs: 0,
  Brightness: 1,
  Scene: 2,
} as const;
export type RenderMode = (typeof RenderMode)[keyof typeof RenderMode];

export interface DevSettings {
  fovDegrees: number;
  cellWidth: number; // in CSS pixels; the height follows from the character shape
  viewDistance: number;
  renderMode: RenderMode;
}

type NumberSetting = 'fovDegrees' | 'cellWidth' | 'viewDistance';

export function createDevMenu(
  settings: DevSettings,
  onChange: (setting: keyof DevSettings) => void,
): void {
  const panel = document.createElement('div');
  panel.id = 'dev-menu';
  panel.hidden = true;
  document.body.append(panel);

  const title = document.createElement('div');
  title.textContent = 'dev menu  ( ` to close )';
  panel.append(title);

  function slider(label: string, key: NumberSetting, min: number, max: number, step: number) {
    const row = document.createElement('label');
    const text = document.createElement('span');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(settings[key]);
    text.textContent = `${label}: ${settings[key]}`;
    input.addEventListener('input', () => {
      settings[key] = Number(input.value);
      text.textContent = `${label}: ${settings[key]}`;
      onChange(key);
    });
    row.append(text, input);
    panel.append(row);
  }

  slider('FOV', 'fovDegrees', 30, 120, 1);
  slider('Cell width', 'cellWidth', 4, 16, 1);
  slider('View distance', 'viewDistance', 5, 100, 1);

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
  });
  modeRow.append(modeText, select);
  panel.append(modeRow);

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Backquote') return;
    panel.hidden = !panel.hidden;
    event.preventDefault();
  });
}
