export interface ClipperSettings {
  apiUrl: string;
  apiToken: string;
}

const SETTINGS_KEYS = ['apiUrl', 'apiToken'];

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export async function loadSettings(): Promise<ClipperSettings> {
  const local = await chrome.storage.local.get(SETTINGS_KEYS);
  const localUrl = readString(local.apiUrl);
  const localToken = readString(local.apiToken);

  if (localUrl && localToken) {
    return { apiUrl: localUrl, apiToken: localToken };
  }

  const synced = await chrome.storage.sync.get(SETTINGS_KEYS);
  const apiUrl = localUrl || readString(synced.apiUrl);
  const apiToken = localToken || readString(synced.apiToken);

  if (apiUrl || apiToken) {
    await chrome.storage.local.set({ apiUrl, apiToken });
    await chrome.storage.sync.remove(SETTINGS_KEYS);
  }

  return { apiUrl, apiToken };
}

export async function saveSettings(settings: ClipperSettings): Promise<void> {
  await chrome.storage.local.set(settings);
  await chrome.storage.sync.remove(SETTINGS_KEYS);
}
