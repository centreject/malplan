import { useState } from "react";
import type { SpecialDaysStatus } from "./specialDays";

type HolidaySettingsProps = {
  apiKey: string;
  status: SpecialDaysStatus;
  onSave: (key: string) => void;
};

/** "공휴일": optional data.go.kr key that adds announced holidays (임시공휴일, 선거일). */
export function HolidaySettings({ apiKey, status, onSave }: HolidaySettingsProps) {
  const [draft, setDraft] = useState(apiKey);

  return (
    <fieldset className="settings-section window-settings">
      <legend>공휴일</legend>
      <p className="window-note">
        설날·추석·대체공휴일까지는 자동으로 계산합니다. 임시공휴일과 선거일도 표시하려면 공공데이터포털 API 키를 넣으세요.
      </p>
      <label className="window-option holiday-key">
        API 키
        <input
          type="password"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="일반 인증키 (Encoding 또는 Decoding)"
          autoComplete="off"
        />
      </label>
      <div className="storage-actions">
        <button type="button" className="text-button bordered" onClick={() => onSave(draft)}>
          저장
        </button>
        {apiKey !== "" && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setDraft("");
              onSave("");
            }}
          >
            키 지우기
          </button>
        )}
      </div>
      <StatusLine status={status} />
      <details className="holiday-guide">
        <summary>API 키 받는 방법</summary>
        <ol>
          <li>공공데이터포털(data.go.kr)에 회원가입하고 로그인합니다.</li>
          <li>"한국천문연구원_특일 정보"를 검색해 활용신청을 누릅니다. 개발계정은 보통 바로 승인됩니다.</li>
          <li>마이페이지 → 개발계정에서 "일반 인증키"를 복사해 위에 붙여넣습니다. Encoding·Decoding 어느 쪽이든 됩니다.</li>
          <li>승인 직후 1시간 정도는 키가 동작하지 않을 수 있습니다.</li>
          <li>개발계정은 약 2년마다 연장 신청이 필요합니다. 만료되면 이 화면에 경고가 뜹니다.</li>
        </ol>
      </details>
    </fieldset>
  );
}

function StatusLine({ status }: { status: SpecialDaysStatus }) {
  switch (status.kind) {
    case "off":
      return null;
    case "loading":
      return <p className="window-note" role="status">공휴일 정보를 받는 중…</p>;
    case "ok":
      return <p className="window-note" role="status">마지막 갱신: {new Date(status.fetchedAt).toLocaleDateString("ko-KR")}</p>;
    case "error":
      return (
        <p className="window-error" role="status">
          갱신 실패: {status.message}
          {status.fetchedAt !== undefined && ` (이전 정보 사용 중: ${new Date(status.fetchedAt).toLocaleDateString("ko-KR")})`}
        </p>
      );
  }
}
