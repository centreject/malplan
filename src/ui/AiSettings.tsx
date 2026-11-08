import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useState, useSyncExternalStore } from "react";
import { clearCorrections } from "../llm/corrections";
import {
  deleteModel,
  downloadState,
  MODEL_NAME,
  modelStatus,
  pauseDownload,
  startDownload,
  subscribeDownload,
  type ModelStatus,
} from "../llm/localModel";
import { localServer, type LocalStatus } from "../llm/localServer";
import {
  CLAUDE_MODELS,
  customEndpoint,
  DEFAULT_MODELS,
  fetchModels,
  PROVIDERS,
  switchProvider,
  testConnection,
  type ConnectionResult,
  type LlmSettings,
  type ModelListResult,
  type ProviderId,
} from "../llm/providers";

type AiSettingsProps = { settings: LlmSettings; onChange: (settings: LlmSettings) => void };

const NOTES: Record<ProviderId, string> = {
  local: "입력한 문장이 이 PC 밖으로 나가지 않습니다. 모델을 받기 전까지는 규칙 기반으로만 정리합니다.",
  gemini: "aistudio.google.com에서 무료 API 키를 받을 수 있습니다. 무료 등급에서는 입력 내용이 Google 제품 개선에 쓰일 수 있습니다.",
  anthropic: "console.anthropic.com에서 API 키를 만들고 크레딧을 충전해야 합니다. Claude Pro 구독과는 별개입니다.",
  openrouter: "openrouter.ai에서 키를 받고, 사용할 모델 이름을 입력하세요. 무료 모델(:free)은 응답이 불안정할 수 있습니다.",
  custom: "Ollama, LM Studio, 자체 서버처럼 OpenAI 호환 API를 주는 곳에 연결합니다. 입력한 문장과 키가 이 주소로 전송됩니다. 키가 없는 서버는 비워 두세요.",
  off: "날짜·시간은 그대로 계산하고, 제목·분류는 간단한 규칙으로만 정합니다.",
};

const SERVER_TEXT: Record<LocalStatus, string> = {
  off: "꺼짐 (입력창을 누르면 켜집니다)",
  starting: "켜는 중…",
  ready: "준비됨",
  error: "오류 (다음 입력 때 다시 켭니다)",
  "no-model": "모델 없음",
};

function gigabytes(bytes: number): string {
  return `${(bytes / 1e9).toFixed(1)}GB`;
}

const noSubscribe = () => () => {};

/** Local model: consent and download when missing, size, server status and delete when present. */
function LocalModel() {
  const download = useSyncExternalStore(subscribeDownload, downloadState);
  const server = useSyncExternalStore(localServer?.subscribe ?? noSubscribe, () => localServer?.status() ?? "off");
  const [model, setModel] = useState<ModelStatus>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();
  const load = () => void modelStatus().then(setModel);

  // Read on open and again whenever a download finishes, pauses or fails.
  useEffect(() => {
    void modelStatus().then(setModel);

    return subscribeDownload(() => {
      if (downloadState().phase === "idle") {
        void modelStatus().then(setModel);
      }
    });
  }, []);

  if (model === undefined) {
    return null;
  }

  if (model.size !== null) {
    return (
      <>
        <p className="window-note">
          모델: {MODEL_NAME}, {gigabytes(model.size)} · 저장 위치 {model.dir}
        </p>
        <p className="window-note" role="status">로컬 AI: {SERVER_TEXT[server]}</p>
        <div className="storage-actions">
          {confirmDelete ? (
            <>
              <span className="window-note">모델을 지울까요? 다시 쓰려면 2.5GB를 새로 받아야 합니다.</span>
              <button
                type="button"
                className="text-button bordered"
                onClick={async () => {
                  setDeleteError(undefined);

                  try {
                    await localServer?.stop();
                    await deleteModel();
                  } catch (error) {
                    // A file still in use (the server not yet closed) stays; say so instead of nothing happening.
                    setDeleteError(`모델을 지우지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
                  }

                  setConfirmDelete(false);
                  load();
                }}
              >
                삭제
              </button>
              <button type="button" className="text-button" onClick={() => setConfirmDelete(false)}>
                취소
              </button>
            </>
          ) : (
            <button type="button" className="text-button" onClick={() => setConfirmDelete(true)}>
              모델 삭제 ({gigabytes(model.size)} 반환)
            </button>
          )}
        </div>
        {deleteError !== undefined && <p className="window-error" role="alert">{deleteError}</p>}
      </>
    );
  }

  return (
    <>
      <p className="window-note">
        AI 변환에 쓸 모델을 이 PC에 받습니다. 한 번 받으면 인터넷 없이 동작합니다.
      </p>
      <ul className="window-note">
        <li>모델: {MODEL_NAME} (Alibaba Qwen, Apache 2.0)</li>
        <li>실행기: llama.cpp (MIT), 앱에 포함</li>
        <li>크기: {gigabytes(model.total)}</li>
        <li>저장 위치: {model.dir}</li>
      </ul>
      {download.phase === "idle" && (
        <div className="storage-actions">
          <button type="button" className="text-button bordered" onClick={() => void startDownload()}>
            {model.partial > 0
              ? `이어받기 (${gigabytes(model.partial)} / ${gigabytes(model.total)})`
              : `동의하고 받기 (${gigabytes(model.total)})`}
          </button>
        </div>
      )}
      {download.phase === "downloading" && (
        <div className="storage-actions">
          <progress value={download.received} max={model.total} aria-label="모델 받는 중" />
          <span className="window-note" role="status">
            {gigabytes(download.received)} / {gigabytes(model.total)}
          </span>
          <button type="button" className="text-button bordered" onClick={() => void pauseDownload()}>
            일시정지
          </button>
        </div>
      )}
      {download.phase === "verifying" && (
        <p className="window-note" role="status">받은 파일 확인 중 (SHA256)…</p>
      )}
      {download.error !== undefined && <p className="window-error" role="alert">{download.error}</p>}
    </>
  );
}

/** What is stored now, so the user can see their input took. Only the key's end is shown. */
function savedSummary({ provider, apiKey, model, baseUrl }: LlmSettings): string {
  const key = apiKey === "" ? "키 없음" : apiKey.length > 8 ? `키 ••••${apiKey.slice(-4)}` : "키 입력됨";

  return [provider === "custom" ? baseUrl || "주소 없음" : undefined, key, model || "모델 지정 안 함"].filter((part) => part !== undefined).join(" · ");
}

/** "AI 변환": local by default; an API key is the opt-in alternative. */
export function AiSettings({ settings, onChange }: AiSettingsProps) {
  // A result belongs to the settings it tested: any edit hides it, and a late answer for old settings never shows.
  const [test, setTest] = useState<{ tested: LlmSettings; result?: ConnectionResult }>();
  const shownTest = test?.tested === settings ? test : undefined;
  // A list belongs to the server and key it came from; choosing a model from it must not hide it.
  const listSource = `${settings.provider} ${settings.baseUrl} ${settings.apiKey}`;
  const [list, setList] = useState<{ source: string; result?: ModelListResult }>();
  const shownList = list?.source === listSource ? list : undefined;
  const [cleared, setCleared] = useState(false);
  const needsKey = settings.provider === "gemini" || settings.provider === "anthropic" || settings.provider === "openrouter" || settings.provider === "custom";
  const endpoint = customEndpoint(settings.baseUrl);
  const addressError = settings.provider === "custom" && settings.baseUrl !== "" && "error" in endpoint ? endpoint.error : undefined;

  return (
    <fieldset className="settings-section window-settings">
      <legend>AI 변환</legend>
      <label className="window-option">
        처리 방식
        <select
          value={settings.provider}
          onChange={(event) => {
            const provider = PROVIDERS.find((p) => p.id === event.target.value)?.id ?? "local";

            onChange(switchProvider(settings, provider));
          }}
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <p className="window-note">{NOTES[settings.provider]}</p>
      {settings.provider === "local" && isTauri() && <LocalModel />}

      {settings.provider === "custom" && (
        <>
          <label className="window-option holiday-key">
            서버 주소
            <input
              value={settings.baseUrl}
              placeholder="예: http://127.0.0.1:11434/v1"
              onChange={(event) => onChange({ ...settings, baseUrl: event.target.value.trim() })}
            />
          </label>
          {addressError !== undefined && <p className="window-error" role="alert">{addressError}</p>}
        </>
      )}

      {needsKey && (
        <>
          <label className="window-option holiday-key">
            API 키
            <input
              type="password"
              value={settings.apiKey}
              onChange={(event) => onChange({ ...settings, apiKey: event.target.value.trim() })}
              autoComplete="off"
            />
          </label>
          {settings.provider === "anthropic" ? (
            <label className="window-option">
              모델
              <select value={settings.model} onChange={(event) => onChange({ ...settings, model: event.target.value })}>
                {CLAUDE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="window-option holiday-key">
              모델
              <input
                list="ai-model-list"
                value={settings.model}
                placeholder={settings.provider === "openrouter" ? "예: google/gemini-2.5-flash-lite" : settings.provider === "custom" ? "서버의 모델 이름 (예: qwen3:4b)" : DEFAULT_MODELS[settings.provider]}
                onChange={(event) => onChange({ ...settings, model: event.target.value.trim() })}
              />
            </label>
          )}
          {settings.provider !== "anthropic" && (
            <>
              <datalist id="ai-model-list">
                {shownList?.result?.ok === true && shownList.result.models.map((name) => <option key={name} value={name} />)}
              </datalist>
              <div className="storage-actions">
                <button
                  type="button"
                  className="text-button bordered"
                  disabled={shownList !== undefined && shownList.result === undefined}
                  onClick={() => {
                    setList({ source: listSource });
                    void fetchModels(settings).then((result) => setList({ source: listSource, result }));
                  }}
                >
                  모델 목록 받기
                </button>
                {shownList !== undefined && shownList.result === undefined && <span className="window-note" role="status">받는 중…</span>}
                {shownList?.result?.ok === true && (
                  <span className="window-note" role="status">
                    {shownList.result.models.length === 0 ? "서버에 모델이 없습니다." : `${shownList.result.models.length}개 · 모델 칸을 눌러 고르세요 (글자를 지우면 전체 목록)`}
                  </span>
                )}
              </div>
              {shownList?.result?.ok === false && shownList.result.message !== addressError && (
                <p className="window-error" role="alert">{shownList.result.message}</p>
              )}
            </>
          )}
          <p className="window-note" role="status">저장됨: {savedSummary(settings)}</p>
          <p className="window-note">입력하면 바로 이 기기에 저장되고, 다른 기기와 동기화되지 않습니다. 키는 처리 방식마다 따로 보관합니다.</p>
          <div className="storage-actions">
            <button
              type="button"
              className="text-button bordered"
              disabled={shownTest !== undefined && shownTest.result === undefined}
              onClick={() => {
                setTest({ tested: settings });
                void testConnection(settings).then((result) => setTest({ tested: settings, result }));
              }}
            >
              연결 테스트
            </button>
            {shownTest !== undefined && shownTest.result === undefined && <span className="window-note" role="status">확인 중…</span>}
            {shownTest?.result?.ok === true && (
              <span className="window-note" role="status">연결됨 · {(shownTest.result.ms / 1000).toFixed(1)}초</span>
            )}
          </div>
          {shownTest?.result?.ok === false && shownTest.result.message !== addressError && (
            <p className="window-error" role="alert">{shownTest.result.message}</p>
          )}
          <p className="window-note">테스트는 짧은 요청을 한 번 보냅니다. 유료 키라면 아주 적은 요금이 들 수 있습니다.</p>
        </>
      )}

      <div className="storage-actions">
        <button
          type="button"
          className="text-button"
          onClick={() => {
            clearCorrections();
            setCleared(true);
          }}
        >
          분류 학습 초기화
        </button>
        {cleared && <span className="window-note" role="status">초기화했습니다.</span>}
      </div>
    </fieldset>
  );
}
