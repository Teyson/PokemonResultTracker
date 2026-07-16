export type ThemePreference = 'auto' | 'light' | 'dark';

const STORAGE_KEY = 'theme';

function systemPrefersLight(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches;
}

function effectiveTheme(pref: ThemePreference): 'light' | 'dark' {
  return pref === 'auto' ? (systemPrefersLight() ? 'light' : 'dark') : pref;
}

function loadPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'auto';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'auto' ? stored : 'auto';
}

export const themeState = $state<{ preference: ThemePreference }>({ preference: loadPreference() });

function apply() {
  document.documentElement.setAttribute('data-theme', effectiveTheme(themeState.preference));
}

export function setTheme(pref: ThemePreference) {
  themeState.preference = pref;
  window.localStorage.setItem(STORAGE_KEY, pref);
  apply();
}

if (typeof window !== 'undefined') {
  // The inline pre-paint script in app.html already set the initial attribute;
  // this just keeps it in sync and reacts to live OS-theme changes in auto mode.
  apply();
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (themeState.preference === 'auto') apply();
  });
}
