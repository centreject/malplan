// Drive v3 REST calls on the appDataFolder, for driveSync. Every response is validated before use.
import * as v from "valibot";
import type { DriveFiles, RemoteFile } from "./driveSync";

const API = "https://www.googleapis.com/drive/v3/files";

const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

const FIELDS = "id,name,md5Checksum";

const FileSchema = v.object({ id: v.string(), name: v.string(), md5Checksum: v.string() });

const ListSchema = v.object({ files: v.array(FileSchema), nextPageToken: v.optional(v.string()) });

/** Called before each request: a valid access token, refreshed when needed. */
export type TokenSource = () => Promise<string>;

function remote(file: v.InferOutput<typeof FileSchema>): RemoteFile {
  return { id: file.id, name: file.name, md5: file.md5Checksum };
}

export class DriveApi implements DriveFiles {
  readonly #token: TokenSource;
  readonly #fetch: typeof fetch;
  readonly #onUnauthorized: (() => void) | undefined;

  constructor(token: TokenSource, fetcher: typeof fetch, onUnauthorized?: () => void) {
    this.#token = token;
    this.#fetch = fetcher;
    this.#onUnauthorized = onUnauthorized;
  }

  /** Oldest first, so every device picks the same one of two files with one name. */
  async list(): Promise<RemoteFile[]> {
    const files: RemoteFile[] = [];
    let page: string | undefined;

    do {
      const query = new URLSearchParams({
        spaces: "appDataFolder",
        q: "trashed = false",
        orderBy: "createdTime",
        pageSize: "1000",
        fields: `files(${FIELDS}),nextPageToken`,
      });

      if (page !== undefined) {
        query.set("pageToken", page);
      }

      const parsed = v.parse(ListSchema, await (await this.#request(`${API}?${query}`, { method: "GET" })).json());

      files.push(...parsed.files.map(remote));
      page = parsed.nextPageToken;
    } while (page !== undefined);

    return files;
  }

  async download(id: string): Promise<string> {
    return (await this.#request(`${API}/${encodeURIComponent(id)}?alt=media`, { method: "GET" })).text();
  }

  async create(name: string, content: string): Promise<RemoteFile> {
    const boundary = `malplan-${crypto.randomUUID()}`;

    const body = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify({ name, parents: ["appDataFolder"] }),
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "",
      content,
      `--${boundary}--`,
      "",
    ].join("\r\n");

    const response = await this.#request(`${UPLOAD}?uploadType=multipart&fields=${FIELDS}`, {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });

    return remote(v.parse(FileSchema, await response.json()));
  }

  async update(id: string, content: string): Promise<RemoteFile> {
    const response = await this.#request(`${UPLOAD}/${encodeURIComponent(id)}?uploadType=media&fields=${FIELDS}`, {
      method: "PATCH",
      headers: { "Content-Type": "text/plain; charset=UTF-8" },
      body: content,
    });

    return remote(v.parse(FileSchema, await response.json()));
  }

  async #request(url: string, init: RequestInit): Promise<Response> {
    const send = async () => {
      const headers = new Headers(init.headers);

      headers.set("Authorization", `Bearer ${await this.#token()}`);

      return this.#fetch(url, { ...init, headers, signal: AbortSignal.timeout(30_000) });
    };

    const response = await send();

    // Cached access token rejected early: invalidate and retry once with a refreshed token.
    if (response.status === 401 && this.#onUnauthorized !== undefined) {
      this.#onUnauthorized();

      const retried = await send();

      if (!retried.ok) {
        throw new Error(`Drive HTTP ${retried.status}`);
      }

      return retried;
    }

    if (!response.ok) {
      throw new Error(`Drive HTTP ${response.status}`);
    }

    return response;
  }
}
