// "Google로 로그인" for Drive sync: the desktop-app flow (system browser, loopback redirect, PKCE S256). The refresh
// token is kept in the Windows Credential Manager; access tokens live in memory only.
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import * as v from "valibot";
import { deleteSecret, readSecret, saveSecret } from "./secrets";

/** The app's own hidden Drive folder, nothing else: a non-sensitive scope in Google's terms. */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

/** Name of the refresh token in the Credential Manager. */
export const REFRESH_SECRET = "google-refresh-token";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

/** A desktop client's id and secret. Google treats installed apps as public clients: the secret is not one. */
export type GoogleClient = { id: string; secret: string };

const id = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

const secret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET ?? "";

/** Undefined in a build without the client (a fork, a local build): Drive sync is then not offered. */
export const GOOGLE_CLIENT: GoogleClient | undefined = id !== "" && secret !== "" ? { id, secret } : undefined;

export function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** PKCE: a random verifier and its S256 challenge. `random` fills the bytes (tests pass fixed ones). */
export async function pkcePair(random: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer> = (bytes) => crypto.getRandomValues(bytes)) {
  const verifier = base64Url(random(new Uint8Array(32)));
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));

  return { verifier, challenge };
}

export function authorizationUrl(client: GoogleClient, redirect: string, challenge: string, state: string): string {
  const query = new URLSearchParams({
    client_id: client.id,
    redirect_uri: redirect,
    response_type: "code",
    scope: DRIVE_SCOPE,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    // A refresh token on every sign-in, so signing in again after a revoke works.
    access_type: "offline",
    prompt: "consent",
  });

  return `${AUTH_URL}?${query}`;
}

/** The redirect's query: the code, or why there is none. A foreign state is refused. */
export function readRedirect(query: string, state: string): { code: string } | { error: string } {
  const params = new URLSearchParams(query);

  if (params.get("state") !== state) {
    return { error: "state-mismatch" };
  }

  const code = params.get("code");

  return code === null || code === "" ? { error: params.get("error") ?? "no-code" } : { code };
}

const TokenSchema = v.object({
  access_token: v.pipe(v.string(), v.minLength(1)),
  expires_in: v.pipe(v.number(), v.minValue(1)),
  refresh_token: v.optional(v.string()),
  scope: v.optional(v.string()),
});

export type Tokens = { access: string; expiresAt: number; refresh: string | undefined };

async function tokenRequest(fields: Record<string, string>, fetcher: typeof fetch, now: number): Promise<Tokens> {
  const response = await fetcher(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Google token HTTP ${response.status}`);
  }

  const parsed = v.parse(TokenSchema, await response.json());

  return { access: parsed.access_token, expiresAt: now + parsed.expires_in * 1000, refresh: parsed.refresh_token };
}

export function exchangeCode(client: GoogleClient, code: string, verifier: string, redirect: string, fetcher: typeof fetch, now: number): Promise<Tokens> {
  return tokenRequest(
    { client_id: client.id, client_secret: client.secret, code, code_verifier: verifier, redirect_uri: redirect, grant_type: "authorization_code" },
    fetcher,
    now,
  );
}

/** Access tokens for Drive calls, refreshed a minute before they expire. `now` is the clock seam. */
export class GoogleSession {
  readonly #client: GoogleClient;
  readonly #refresh: string;
  readonly #fetch: typeof fetch;
  readonly #now: () => number;
  #access: { token: string; expiresAt: number } | undefined;

  constructor(client: GoogleClient, refresh: string, fetcher: typeof fetch, now: () => number) {
    this.#client = client;
    this.#refresh = refresh;
    this.#fetch = fetcher;
    this.#now = now;
  }

  async token(): Promise<string> {
    if (this.#access === undefined || this.#now() >= this.#access.expiresAt - 60_000) {
      const tokens = await tokenRequest(
        { client_id: this.#client.id, client_secret: this.#client.secret, refresh_token: this.#refresh, grant_type: "refresh_token" },
        this.#fetch,
        this.#now(),
      );

      this.#access = { token: tokens.access, expiresAt: tokens.expiresAt };
    }

    return this.#access.token;
  }
}

/** The browser round trip; keeps the refresh token in the Credential Manager and returns it. */
export async function signIn(client: GoogleClient, fetcher: typeof fetch): Promise<string> {
  const port = await invoke<number>("oauth_listen");
  const redirect = `http://127.0.0.1:${port}`;
  const { verifier, challenge } = await pkcePair();
  const state = base64Url(crypto.getRandomValues(new Uint8Array(16)));

  await openUrl(authorizationUrl(client, redirect, challenge, state));

  const result = readRedirect(await invoke<string>("oauth_wait"), state);

  if ("error" in result) {
    throw new Error(result.error === "access_denied" ? "로그인을 취소했습니다." : `로그인하지 못했습니다. (${result.error})`);
  }

  const tokens = await exchangeCode(client, result.code, verifier, redirect, fetcher, Date.now());

  if (tokens.refresh === undefined) {
    throw new Error("Google이 로그인 유지 토큰을 주지 않았습니다. 다시 로그인해 주세요.");
  }

  await saveSecret(REFRESH_SECRET, tokens.refresh);

  return tokens.refresh;
}

export function savedRefreshToken(): Promise<string | undefined> {
  return readSecret(REFRESH_SECRET);
}

/** Revokes the grant at Google (best effort: offline still signs out here) and forgets the token. */
export async function signOut(fetcher: typeof fetch): Promise<void> {
  const refresh = await readSecret(REFRESH_SECRET);

  if (refresh !== undefined) {
    await fetcher(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refresh }).toString(),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => undefined);
  }

  await deleteSecret(REFRESH_SECRET);
}
