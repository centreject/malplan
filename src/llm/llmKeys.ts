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

export type KeyStorage = {
  readSecret: (name: string) => Promise<string | undefined>;
  saveSecret: (name: string, value: string) => Promise<void>;
  deleteSecret: (name: string) => Promise<void>;
  loadSettings: () => LlmSettings;
  saveSettings: (settings: LlmSettings) => void;
};

export type LlmKeyStore = {
  save: (settings: LlmSettings) => Promise<void>;
  load: () => Promise<Map<ProviderId, string>>;
};

/**
 * Serialized key persistence with a real storage seam (tests pass in-memory fakes).
 * Never deletes Credential Manager entries before the initial load has succeeded, and never strips
 * legacy keys from app storage until migrating them into the Credential Manager succeeds.
 */
export function createLlmKeyStore(io: KeyStorage): LlmKeyStore {
  /** Saves and initial migration run one after another, in order. */
  let saving: Promise<void> = Promise.resolve();
  /** True once `load()` has read the Credential Manager; before that, empty keys in state mean "not loaded". */
  let loaded = false;

  const save = (settings: LlmSettings): Promise<void> => {
    const allowDelete = loaded;

    const run = saving.then(async () => {
      for (const [provider, key] of keysOf(settings)) {
        if (key !== "") {
          await io.saveSecret(secretName(provider), key);
        } else if (allowDelete) {
          await io.deleteSecret(secretName(provider));
        }
      }

      io.saveSettings(withoutKeys(settings));
    });

    saving = run.catch(() => undefined);

    return run;
  };

  const load = (): Promise<Map<ProviderId, string>> => {
    const run = saving.then(async () => {
      const stored = io.loadSettings();

      if ([...keysOf(stored).values()].some((key) => key !== "")) {
        for (const [provider, key] of keysOf(stored)) {
          if (key !== "") {
            await io.saveSecret(secretName(provider), key);
          }
        }

        // Only blank app storage after every legacy key reached the Credential Manager.
        io.saveSettings(withoutKeys(stored));
      }

      const keys = new Map<ProviderId, string>();

      for (const provider of KEYED) {
        keys.set(provider, (await io.readSecret(secretName(provider))) ?? "");
      }

      loaded = true;

      return keys;
    });

    saving = run.then(
      () => undefined,
      () => undefined,
    );

    return run;
  };

  return { save, load };
}

const desktopStore = createLlmKeyStore({
  readSecret,
  saveSecret,
  deleteSecret,
  loadSettings: loadLlmSettings,
  saveSettings: saveSettingsJson,
});

/** Settings to app storage, keys to the Credential Manager (an emptied key is removed once keys have loaded). */
export function saveLlmSettings(settings: LlmSettings): Promise<void> {
  if (!isTauri()) {
    saveSettingsJson(settings);

    return Promise.resolve();
  }

  return desktopStore.save(settings);
}

/**
 * The keys this device keeps. Keys an older version left in app storage are moved to the Credential Manager first
 * and blanked there only after the write succeeds.
 */
export function loadLlmKeys(): Promise<Map<ProviderId, string>> {
  if (!isTauri()) {
    return Promise.resolve(new Map());
  }

  return desktopStore.load();
}
