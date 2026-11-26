import { describe, expect, test } from "vitest";
import { DriveApi } from "./driveApi";

type Seen = { url: string; method: string; auth: string | null; type: string | null; body: string };

/** A fetch that records each request and answers from a queue. */
function fakeFetch(answers: Response[]) {
  const seen: Seen[] = [];

  const fetcher: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);

    seen.push({ url: String(input), method: init?.method ?? "GET", auth: headers.get("Authorization"), type: headers.get("Content-Type"), body: String(init?.body ?? "") });

    const answer = answers.shift();

    if (answer === undefined) {
      throw new Error("no answer queued");
    }

    return answer;
  };

  return { seen, fetcher };
}

type DriveAnswer = { files?: { id?: string | number; name?: string; md5Checksum?: string }[]; nextPageToken?: string; id?: string; name?: string; md5Checksum?: string };

const json = (body: DriveAnswer, status = 200) => new Response(JSON.stringify(body), { status });

describe("DriveApi", () => {
  test("lists the appDataFolder oldest first, page by page, with the token", async () => {
    const { seen, fetcher } = fakeFetch([
      json({ files: [{ id: "1", name: "log-a.jsonl", md5Checksum: "m1" }], nextPageToken: "p2" }),
      json({ files: [{ id: "2", name: "snapshot.json", md5Checksum: "m2" }] }),
    ]);

    const files = await new DriveApi(async () => "tok", fetcher).list();

    expect(files).toEqual([{ id: "1", name: "log-a.jsonl", md5: "m1" }, { id: "2", name: "snapshot.json", md5: "m2" }]);
    expect(seen[0]?.url).toContain("spaces=appDataFolder");
    expect(seen[0]?.url).toContain("orderBy=createdTime");
    expect(seen[1]?.url).toContain("pageToken=p2");
    expect(seen[0]?.auth).toBe("Bearer tok");
  });

  test("creates a file in the appDataFolder with its content", async () => {
    const { seen, fetcher } = fakeFetch([json({ id: "9", name: "log-a.jsonl", md5Checksum: "m9" })]);

    expect(await new DriveApi(async () => "tok", fetcher).create("log-a.jsonl", "줄 하나\n")).toEqual({ id: "9", name: "log-a.jsonl", md5: "m9" });
    expect(seen[0]?.method).toBe("POST");
    expect(seen[0]?.url).toContain("uploadType=multipart");
    expect(seen[0]?.type).toMatch(/^multipart\/related; boundary=/);
    expect(seen[0]?.body).toContain('"parents":["appDataFolder"]');
    expect(seen[0]?.body).toContain("줄 하나\n");
  });

  test("updates and downloads by id", async () => {
    const { seen, fetcher } = fakeFetch([json({ id: "9", name: "log-a.jsonl", md5Checksum: "m10" }), new Response("본문")]);
    const api = new DriveApi(async () => "tok", fetcher);

    expect((await api.update("9", "새 본문")).md5).toBe("m10");
    expect(await api.download("9")).toBe("본문");
    expect([seen[0]?.method, seen[0]?.body]).toEqual(["PATCH", "새 본문"]);
    expect(seen[1]?.url).toContain("/files/9?alt=media");
  });

  test("an error status or a malformed answer throws instead of syncing garbage", async () => {
    await expect(new DriveApi(async () => "tok", fakeFetch([json({}, 401)]).fetcher).list()).rejects.toThrow("Drive HTTP 401");
    await expect(new DriveApi(async () => "tok", fakeFetch([json({ files: [{ id: 1 }] })]).fetcher).list()).rejects.toThrow();
  });
});
