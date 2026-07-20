const PREFIX = 'invdash';

export function storageKey(name: string, version = 1): string {
  return `${PREFIX}:${name}:v${version}`;
}

export function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveToStorage<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage unavailable (private mode / quota) - fail silently, in-memory state still works
  }
}
