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
import { CLAUDE_MODELS, DEFAULT_MODELS, PROVIDERS, type LlmSettings, type ProviderId } from "../llm/providers";

type AiSettingsProps = { settings: LlmSettings; onChange: (settings: LlmSettings) => void };

const NOTES: Record<ProviderId, string> = {
  local: "입력한 문장이 이 PC 밖으로 나가지 않습니다. 모델을 받기 전까지는 규칙 기반으로만 정리합니다.",
  gemini: "aistudio.google.com에서 무료 API 키를 받을 수 있습니다. 무료 등급에서는 입력 내용이 Google 제품 개선에 쓰일 수 있습니다.",
  anthropic: "console.anthropic.com에서 API 키를 만들고 크레딧을 충전해야 합니다. Claude Pro 구독과는 별개입니다.",
  openrouter: "openrouter.ai에서 키를 받고, 사용할 모델 이름을 입력하세요. 무료 모델(:free)은 응답이 불안정할 수 있습니다.",
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
                  await localServer?.stop();
                  await deleteModel();
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

/** "AI 변환": local by default; an API key is the opt-in alternative. */
export function AiSettings({ settings, onChange }: AiSettingsProps) {
  const [key, setKey] = useState(settings.apiKey);
  const [cleared, setCleared] = useState(false);
  const needsKey = settings.provider === "gemini" || settings.provider === "anthropic" || settings.provider === "openrouter";

  return (
    <fieldset className="settings-section window-settings">
      <legend>AI 변환</legend>
      <label className="window-option">
        처리 방식
        <select
          value={settings.provider}
          onChange={(event) => {
            const provider = PROVIDERS.find((p) => p.id === event.target.value)?.id ?? "local";

            onChange({ ...settings, provider, model: DEFAULT_MODELS[provider] });
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

      {needsKey && (
        <>
          <label className="window-option holiday-key">
            API 키
            <input type="password" value={key} onChange={(event) => setKey(event.target.value)} autoComplete="off" />
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
                value={settings.model}
                placeholder={settings.provider === "openrouter" ? "예: google/gemini-2.5-flash-lite" : DEFAULT_MODELS[settings.provider]}
                onChange={(event) => onChange({ ...settings, model: event.target.value.trim() })}
              />
            </label>
          )}
          <div className="storage-actions">
            <button type="button" className="text-button bordered" onClick={() => onChange({ ...settings, apiKey: key.trim() })}>
              키 저장
            </button>
          </div>
          <p className="window-note">키는 이 기기에만 저장되며 다른 기기와 동기화되지 않습니다.</p>
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
