const DEFAULT_PREFERENCES = {
  theme: "system",
  fontScale: "standard",
  density: "comfortable",
  reduceMotion: false,
  defaultGraphId: "builtin-malware",
};

function preferenceKey(userId) {
  return `kg_preferences:${userId || "anonymous"}`;
}

export function getPreferences(userId) {
  try {
    const raw = localStorage.getItem(preferenceKey(userId));
    const parsed = raw ? JSON.parse(raw) : {};
    return { ...DEFAULT_PREFERENCES, ...(parsed && typeof parsed === "object" ? parsed : {}) };
  } catch {
    localStorage.removeItem(preferenceKey(userId));
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(userId, next) {
  const preferences = { ...getPreferences(userId), ...next };
  try {
    localStorage.setItem(preferenceKey(userId), JSON.stringify(preferences));
  } catch {
    // 浏览器禁用或空间不足时，偏好仍会在本次运行内生效。
  }
  applyPreferences(preferences);
  return preferences;
}

function resolveTheme(theme) {
  if (theme !== "system") return theme;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyPreferences(preferences) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const next = { ...DEFAULT_PREFERENCES, ...(preferences || {}) };
  const resolvedTheme = resolveTheme(next.theme);
  root.dataset.theme = resolvedTheme;
  root.dataset.themePreference = next.theme;
  root.dataset.fontScale = next.fontScale;
  root.dataset.density = next.density;
  root.dataset.reduceMotion = next.reduceMotion ? "true" : "false";
  root.style.colorScheme = resolvedTheme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    resolvedTheme === "dark" ? "#171717" : "#F2F2F2"
  );
  document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", resolvedTheme);
  window.dispatchEvent(new CustomEvent("kg-preferences-changed", { detail: next }));
}

export { DEFAULT_PREFERENCES };
