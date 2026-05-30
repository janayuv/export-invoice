export type UiDensity = "dense" | "comfortable";

export const UI_DENSITY_KEY = "ui_density";
export const DEFAULT_UI_DENSITY: UiDensity = "dense";

export function getStoredDensity(): UiDensity {
  try {
    const v = localStorage.getItem(UI_DENSITY_KEY);
    if (v === "dense" || v === "comfortable") return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_UI_DENSITY;
}

export function applyDensity(density: UiDensity): void {
  document.documentElement.setAttribute("data-density", density);
}

export function setStoredDensity(density: UiDensity): void {
  try {
    localStorage.setItem(UI_DENSITY_KEY, density);
  } catch {
    /* ignore */
  }
  applyDensity(density);
}

export function initUiDensity(): void {
  applyDensity(getStoredDensity());
}
