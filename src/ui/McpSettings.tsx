import { isTauri } from "@tauri-apps/api/core";
import { resolveResource } from "@tauri-apps/api/path";
import { useEffect, useState } from "react";
import { defaultSyncDir } from "../storage/backends";

type Paths = { server: string; dir: string };

/** Each client's own config format, filled with this PC's paths. */
function snippets({ server, dir }: Paths): [client: string, where: string, text: string][] {
  const json = JSON.stringify({ mcpServers: { malplan: { command: "node", args: [server, "--dir", dir] } } }, null, 2);

  return [
    ["Claude Code", "터미널에서 한 번 실행", `claude mcp add malplan -- node "${server}" --dir "${dir}"`],
    ["Claude Desktop", "설정 → 개발자 → 구성 편집 (claude_desktop_config.json)", json],
    ["Gemini CLI", "~/.gemini/settings.json", json],
    ["Antigravity", "에이전트 패널 … → MCP 서버 → 원본 구성 보기 (mcp_config.json)", json],
    ["Codex", "~/.codex/config.toml", `[mcp_servers.malplan]\ncommand = "node"\nargs = [${JSON.stringify(server)}, "--dir", ${JSON.stringify(dir)}]`],
  ];
}

/** Settings page "AI 도구 연결": how to let Claude, Gemini or Codex read and add schedules over MCP. */
export function McpSettings({ dir }: { dir: string | undefined }) {
  const [paths, setPaths] = useState<Paths>();
  const [copied, setCopied] = useState<string>();

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    void Promise.all([resolveResource("mcp/malplan-mcp.mjs"), dir === undefined ? defaultSyncDir() : Promise.resolve(dir)]).then(
      ([server, syncDir]) => setPaths({ server, dir: syncDir }),
      () => setPaths(undefined),
    );
  }, [dir]);

  return (
    <fieldset className="settings-section window-settings">
      <legend>MCP</legend>
      <p className="window-note">
        Claude, Gemini, Codex 같은 AI 도구에서 &quot;다음 주 일정 알려줘&quot;, &quot;금요일까지 보고서 제출 추가해줘&quot;처럼 malplan 일정을 보고 추가할 수
        있습니다. 날짜는 malplan이 직접 계산하고, 추가하기 전에 미리보기로 확인을 받습니다. Node.js가 설치되어 있어야 합니다.
      </p>
      {paths === undefined ? (
        <p className="window-note">데스크톱 앱에서만 설정 문구를 만들 수 있습니다.</p>
      ) : (
        snippets(paths).map(([client, where, text]) => (
          <div key={client} className="mcp-snippet">
            <span className="mcp-client">{client}</span>
            <span className="window-note">{where}</span>
            <pre>{text}</pre>
            <button
              type="button"
              className="text-button bordered"
              onClick={() => {
                void navigator.clipboard.writeText(text).then(() => setCopied(client));
              }}
            >
              {copied === client ? "복사했습니다" : "복사"}
            </button>
          </div>
        ))
      )}
    </fieldset>
  );
}
