// API keys live in the Windows Credential Manager, not in the settings kept in app storage. In the browser preview
// there is no Credential Manager: keys stay in the settings, as before.
import { isTauri } from "@tauri-apps/api/core";
import { deleteSecret, readSecret, saveSecret } from "../storage/secrets";
import { loadLlmSettings, PROVIDERS, saveSettingsJson, type LlmSettings, type ProviderId } from "./providers";

/** Providers that take a key. */
const KEYED = PROVIDERS.map((p) => p.id).filter((id) => id !== "local" && id !== "off");

const secretName = (provider: ProviderId) => `api-key-${provider}`;

/** Each provider's key, from the one in use and the ones put away. */
export function keysOf(settings: LlmSettings): Map<ProviderId, string> {
  const keys = new Map<ProviderId, string>();

  for (const provider of KEYED) {
    const key = provider === settings.provider ? settings.apiKey : (settings.saved[provider]?.apiKey ?? "");

    keys.set(provider, key);
  }

  return keys;
}

/** The settings with every key blanked: what goes to app storage. */
export function withoutKeys(settings: LlmSettings): LlmSettings {
  const saved = Object.fromEntries(Object.entries(settings.saved).map(([provider, entry]) => [provider, { ...entry, apiKey: "" }]));

  return { ...settings, apiKey: "", saved };
}

/** Keys filled in where the settings have none (one typed meanwhile wins). */
export function withKeys(settings: LlmSettings, keys: ReadonlyMap<ProviderId, string>): LlmSettings {
  const saved = { ...settings.saved };

  for (const [provider, key] of keys) {
    if (key === "" || provider === settings.provider) {
      continue;
    }

    const entry = saved[provider] ?? { apiKey: "", model: "" };

    saved[provider] = { ...entry, apiKey: entry.apiKey === "" ? key : entry.apiKey };
  }

  const own = keys.get(settings.provider) ?? "";

  return { ...settings, apiKey: settings.apiKey === "" ? own : settings.apiKey, saved };
}

/** Saves run one after another: a key typed letter by letter must end as its last letter left it. */
let saving: Promise<void> = Promise.resolve();

/** Settings to app storage, keys to the Credential Manager (an emptied key is removed there). */
export function saveLlmSettings(settings: LlmSettings): Promise<void> {
  if (!isTauri()) {
    saveSettingsJson(settings);

    return Promise.resolve();
  }

  saveSettingsJson(withoutKeys(settings));

  const run = saving.then(async () => {
    for (const [provider, key] of keysOf(settings)) {
      await (key === "" ? deleteSecret(secretName(provider)) : saveSecret(secretName(provider), key));
    }
  });

  saving = run.catch(() => undefined);

  return run;
}

/**
 * The keys this device keeps. Keys an older version left in app storage are moved to the Credential Manager first
 * and blanked there.
 */
export async function loadLlmKeys(): Promise<Map<ProviderId, string>> {
  if (!isTauri()) {
    return new Map();
  }

  const stored = loadLlmSettings();

  if ([...keysOf(stored).values()].some((key) => key !== "")) {
    await saveLlmSettings(stored);
  }

  const keys = new Map<ProviderId, string>();

  for (const provider of KEYED) {
    keys.set(provider, (await readSecret(secretName(provider))) ?? "");
  }

  return keys;
}
