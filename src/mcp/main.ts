// malplan MCP server (stdio): lets Claude, Gemini CLI / Antigravity and Codex read and add schedules.
// It opens the same sync folder as the app and appends only to its own log, so the app picks the
// changes up on its next refresh. Usage: node malplan-mcp.mjs [--dir <sync folder>]
import { randomUUID } from "node:crypto";
import { mkdir, open, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import * as v from "valibot";
import type { IsoDate } from "../domain/date";
import { SyncStore, type Backend } from "../storage/store";
import { addSchedule, completeTask, findSchedule, listSchedule, loadBoard, previewSchedule } from "./tools";

/** The sync folder on disk, written the same way as the app's Rust side: append + fsync, replace via rename. */
class NodeFolder implements Backend {
  readonly #dir: string;

  constructor(dir: string) {
    this.#dir = dir;
  }

  async list() {
    try {
      return await readdir(this.#dir);
    } catch {
      return [];
    }
  }

  async read(name: string) {
    try {
      return await readFile(join(this.#dir, name), "utf8");
    } catch {
      return undefined;
    }
  }

  async write(name: string, content: string) {
    await mkdir(this.#dir, { recursive: true });
    await writeFile(join(this.#dir, `${name}.tmp`), content, "utf8");
    await rename(join(this.#dir, `${name}.tmp`), join(this.#dir, name));
  }

  async append(name: string, line: string) {
    await mkdir(this.#dir, { recursive: true });
    const file = await open(join(this.#dir, name), "a");

    try {
      await file.appendFile(line, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
  }
}

/** The app's default folder (Tauri app data + "sync"); --dir overrides it for a chosen folder. */
function syncDir(args: string[]): string {
  const index = args.indexOf("--dir");
  const given = index === -1 ? undefined : args[index + 1];

  if (given !== undefined) {
    return given;
  }

  const base = process.env["APPDATA"] ?? join(homedir(), process.platform === "darwin" ? "Library/Application Support" : ".config");

  return join(base, "com.centreject.malplan", "sync");
}

function localToday(): IsoDate {
  const now = new Date();

  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}

const IsoDateSchema = v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/));

const Sentence = v.pipe(v.string(), v.trim(), v.minLength(1));

/** A tools/call request, parsed at the boundary: each tool name with its own arguments. */
const ToolCallSchema = v.variant("name", [
  v.object({
    name: v.literal("list_schedule"),
    arguments: v.optional(v.object({ from: v.optional(IsoDateSchema), days: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(31)), 7) }), {}),
  }),
  v.object({ name: v.literal("find_schedule"), arguments: v.object({ query: Sentence }) }),
  v.object({ name: v.literal("preview_schedule"), arguments: v.object({ sentence: Sentence }) }),
  v.object({ name: v.literal("add_schedule"), arguments: v.object({ sentence: Sentence }) }),
  v.object({ name: v.literal("complete_task"), arguments: v.object({ id: v.pipe(v.string(), v.minLength(1)), date: v.optional(IsoDateSchema) }) }),
]);

type ToolCall = v.InferOutput<typeof ToolCallSchema>;

const SENTENCE = { type: "string", description: "한국어 문장 그대로. 예: \"다음 주 화요일 오후 3시 치과\". 날짜는 앱이 직접 계산하니 바꾸거나 계산하지 말 것." };

const TOOLS = [
  {
    name: "list_schedule",
    description: "malplan 일정·할 일을 날짜별로 보여 준다 (기본: 오늘부터 7일).",
    inputSchema: { type: "object", properties: { from: { type: "string", description: "YYYY-MM-DD, 기본 오늘" }, days: { type: "integer", minimum: 1, maximum: 31 } } },
  },
  {
    name: "find_schedule",
    description: "제목·메모·장소로 일정을 찾는다. 결과의 id는 complete_task에 쓴다.",
    inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "preview_schedule",
    description: "문장을 저장하면 어떻게 들어갈지 보여 준다 (저장 안 함). add_schedule 전에 먼저 호출해 사용자에게 확인받을 것.",
    inputSchema: { type: "object", properties: { sentence: SENTENCE }, required: ["sentence"] },
  },
  {
    name: "add_schedule",
    description: "문장을 일정으로 저장한다. 사용자가 preview_schedule 결과를 확인한 뒤에만 호출.",
    inputSchema: { type: "object", properties: { sentence: SENTENCE }, required: ["sentence"] },
  },
  {
    name: "complete_task",
    description: "할 일을 완료로 표시한다. 반복 할 일은 그 회차의 date(YYYY-MM-DD)가 필요하다.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, date: { type: "string" } }, required: ["id"] },
  },
];

const store = new SyncStore(new NodeFolder(syncDir(process.argv)), `mcp-${hostname().replace(/[^\w-]/g, "_")}`, () => Date.now());

async function call(request: ToolCall): Promise<string> {
  const today = localToday();
  const board = await loadBoard(store);

  switch (request.name) {
    case "list_schedule":
      return listSchedule(board, request.arguments.from ?? today, request.arguments.days);
    case "find_schedule":
      return findSchedule(board, request.arguments.query, today);
    case "preview_schedule":
      return previewSchedule(board, request.arguments.sentence, today);
    case "add_schedule":
      return (await addSchedule(store, board, request.arguments.sentence, today, randomUUID)).text;
    case "complete_task":
      return (await completeTask(store, board, request.arguments.id, request.arguments.date)).text;
  }
}

const server = new Server({ name: "malplan", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    return { content: [{ type: "text", text: await call(v.parse(ToolCallSchema, request.params)) }] };
  } catch (error) {
    const message = v.isValiError(error) ? `입력이 올바르지 않습니다: ${error.issues.map((issue) => issue.message).join(", ")}` : String(error);

    return { content: [{ type: "text", text: message }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
