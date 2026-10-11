import { useState } from "react";
import { clearCorrections } from "../llm/corrections";
import { CLAUDE_MODELS, DEFAULT_MODELS, PROVIDERS, type LlmSettings, type ProviderId } from "../llm/providers";

type AiSettingsProps = { settings: LlmSettings; onChange: (settings: LlmSettings) => void };

const NOTES: Record<ProviderId, string> = {
  local: "입력한 문장이 이 PC 밖으로 나가지 않습니다. 모델을 받기 전까지는 규칙 기반으로만 정리합니다.",
  gemini: "aistudio.google.com에서 무료 API 키를 받을 수 있습니다. 무료 등급에서는 입력 내용이 Google 제품 개선에 쓰일 수 있습니다.",
  anthropic: "console.anthropic.com에서 API 키를 만들고 크레딧을 충전해야 합니다. Claude Pro 구독과는 별개입니다.",
  openrouter: "openrouter.ai에서 키를 받고, 사용할 모델 이름을 입력하세요. 무료 모델(:free)은 응답이 불안정할 수 있습니다.",
  off: "날짜·시간은 그대로 계산하고, 제목·분류는 간단한 규칙으로만 정합니다.",
};

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
