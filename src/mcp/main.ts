// malplan MCP server (stdio): lets Claude, Gemini CLI / Antigravity and Codex read, add, change and delete schedules.
// It opens the same sync folder as the app and appends only to its own log, so the app picks the
// changes up on its next refresh. Usage: node malplan-mcp.mjs [--dir <sync folder>]
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { homedir, hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import * as v from "valibot";
import { isRealDate, type IsoDate } from "../domain/date";
import { SyncStore, type Backend } from "../storage/store";
import { addSchedule, completeTask, deleteSchedule, editSchedule, findSchedule, listSchedule, loadBoard, previewSchedule, uncompleteTask } from "./tools";

/** The sync folder on disk, written the same way as the app's Rust side: append + fsync, replace via rename. */
/**
 * Only a missing file or folder reads as empty. A locked or unreadable one (OneDrive, an open handle) fails the call,
 * so a tool never writes over data it could not read.
 */
function missing<T>(error: NodeJS.ErrnoException, empty: T): T {
  if (error.code === "ENOENT") {
    return empty;
  }

  throw error;
}

class NodeFolder implements Backend {
  readonly #dir: string;

  constructor(dir: string) {
    this.#dir = dir;
  }

  async list() {
    return readdir(this.#dir).catch((error: NodeJS.ErrnoException) => missing(error, []));
  }

  async read(name: string) {
    return readFile(join(this.#dir, name), "utf8").catch((error: NodeJS.ErrnoException) => missing(error, undefined));
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

/** Minutes after midnight now, for "10분 후". */
function localMinutes(): number {
  const now = new Date();

  return now.getHours() * 60 + now.getMinutes();
}

const IsoDateSchema = v.pipe(v.string(), v.check(isRealDate, "없는 날짜입니다. YYYY-MM-DD로 실제 있는 날짜를 주세요."));

const Sentence = v.pipe(v.string(), v.trim(), v.minLength(1));

const Id = v.pipe(v.string(), v.minLength(1));

/** A tools/call request, parsed at the boundary: each tool name with its own arguments. */
const ToolCallSchema = v.variant("name", [
  v.object({
    name: v.literal("list_schedule"),
    arguments: v.optional(v.object({ from: v.optional(IsoDateSchema), days: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(31)), 7) }), {}),
  }),
  v.object({ name: v.literal("find_schedule"), arguments: v.object({ query: Sentence }) }),
  v.object({ name: v.literal("preview_schedule"), arguments: v.object({ sentence: Sentence }) }),
  v.object({ name: v.literal("add_schedule"), arguments: v.object({ sentence: Sentence }) }),
  v.object({ name: v.literal("complete_task"), arguments: v.object({ id: Id, date: v.optional(IsoDateSchema) }) }),
  v.object({ name: v.literal("uncomplete_task"), arguments: v.object({ id: Id, date: v.optional(IsoDateSchema) }) }),
  v.object({
    name: v.literal("edit_schedule"),
    arguments: v.object({ id: Id, request: Sentence, date: v.optional(IsoDateSchema), save: v.optional(v.boolean(), false) }),
  }),
  v.object({
    name: v.literal("delete_schedule"),
    arguments: v.object({ id: Id, date: v.optional(IsoDateSchema), scope: v.optional(v.picklist(["this", "future", "all"])) }),
  }),
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
    description: "제목·메모·장소로 일정을 찾는다. 결과의 id는 complete_task, edit_schedule, delete_schedule에 쓴다.",
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
  {
    name: "uncomplete_task",
    description: "할 일의 완료 표시를 취소한다. 반복 할 일은 그 회차의 date(YYYY-MM-DD)가 필요하다.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, date: { type: "string" } }, required: ["id"] },
  },
  {
    name: "edit_schedule",
    description:
      "항목 하나를 한국어 요청으로 고친다(앱의 '말로 고치기'): \"3시로 바꿔\", \"하루 미뤄\", \"금요일로\", \"장소는 강남역으로\", \"제목은 주간 회의로\". 날짜·시각은 앱이 계산하니 요청을 그대로 넘길 것. save 없이 먼저 호출해 바뀔 내용을 사용자에게 확인받고, 확인되면 save=true로 다시 호출. 반복 일정에서 날짜를 옮길 때는 그 회차의 date가 필요하고 그 회차만 옮겨진다. 다른 변경은 반복 전체에 적용된다.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, request: { type: "string" }, date: { type: "string", description: "반복 일정의 회차, YYYY-MM-DD" }, save: { type: "boolean" } },
      required: ["id", "request"],
    },
  },
  {
    name: "delete_schedule",
    description: "항목을 삭제한다. 되돌릴 수 없으니 사용자에게 먼저 확인받을 것. 반복 일정은 scope(this: 그 회차만, future: 그 회차부터, all: 전체)가 필요하고, all이 아니면 그 회차의 date도 필요하다.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, date: { type: "string" }, scope: { type: "string", enum: ["this", "future", "all"] } },
      required: ["id"],
    },
  },
];

const dir = syncDir(process.argv);

const store = new SyncStore(new NodeFolder(dir), `mcp-${hostname().replace(/[^\w-]/g, "_")}`, () => Date.now());

async function call(request: ToolCall): Promise<string> {
  const today = localToday();
  const board = await loadBoard(store);

  switch (request.name) {
    case "list_schedule":
      return listSchedule(board, request.arguments.from ?? today, request.arguments.days);
    case "find_schedule":
      return findSchedule(board, request.arguments.query, today);
    case "preview_schedule":
      return previewSchedule(board, request.arguments.sentence, today, localMinutes());
    case "add_schedule":
      return (await addSchedule(store, board, request.arguments.sentence, today, randomUUID, localMinutes())).text;
    case "complete_task":
      return (await completeTask(store, board, request.arguments.id, request.arguments.date)).text;
    case "uncomplete_task":
      return (await uncompleteTask(store, board, request.arguments.id, request.arguments.date)).text;
    case "edit_schedule": {
      const { id, request: text, date, save } = request.arguments;

      return (await editSchedule(store, board, { id, text, date, save }, today, randomUUID)).text;
    }

    case "delete_schedule":
      return (await deleteSchedule(store, board, { id: request.arguments.id, date: request.arguments.date, scope: request.arguments.scope })).text;
  }
}

const server = new Server({ name: "malplan", version: "0.2.13" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: TOOLS }));

/**
 * Every MCP server on this PC (Claude Desktop and each Claude Code session start their own) writes the same log, as
 * the same device. A lock file in the temp folder makes their calls take turns: otherwise one prunes the log while
 * another appends to it, or both date a change the same millisecond, and one of the two changes is lost.
 */
const LOCK = join(tmpdir(), `malplan-mcp-${createHash("sha256").update(dir).digest("hex").slice(0, 16)}.lock`);

/** A lock older than this was left by a process that died holding it. */
const STALE_LOCK_MS = 30_000;

async function onThisPcAtATime<T>(task: () => Promise<T>): Promise<T> {
  for (let waited = 0; ; waited += 50) {
    const handle = await open(LOCK, "wx").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "EEXIST") {
        return undefined;
      }

      throw error;
    });

    if (handle !== undefined) {
      await handle.close();
      break;
    }

    const held = await stat(LOCK).then((info) => Date.now() - info.mtimeMs, () => 0);

    if (held > STALE_LOCK_MS) {
      await unlink(LOCK).catch(() => undefined);
    } else if (waited > STALE_LOCK_MS) {
      throw new Error("다른 malplan 도구 호출이 끝나지 않았습니다. 잠시 뒤 다시 시도하세요.");
    } else {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  try {
    return await task();
  } finally {
    await unlink(LOCK).catch(() => undefined);
  }
}

/**
 * Tool calls run one at a time. A client may send several at once ("mark Mon, Tue and Wed done"); each reads the board
 * and then writes a whole field, so overlapping calls would overwrite each other while all reporting success.
 */
let queue: Promise<unknown> = Promise.resolve();

function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);

  queue = run.catch(() => undefined);

  return run;
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    return { content: [{ type: "text", text: await oneAtATime(() => onThisPcAtATime(() => call(v.parse(ToolCallSchema, request.params)))) }] };
  } catch (error) {
    const message = v.isValiError(error) ? `입력이 올바르지 않습니다: ${error.issues.map((issue) => issue.message).join(", ")}` : String(error);

    return { content: [{ type: "text", text: message }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
