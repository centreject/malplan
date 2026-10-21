import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

/** What ships inside the app, with its license. The AI model is downloaded separately but runs here. */
const NOTICES: [name: string, license: string, use: string][] = [
  ["Qwen3-4B (Alibaba Cloud)", "Apache-2.0", "AI 변환 모델 (받은 경우)"],
  ["llama.cpp", "MIT", "AI 모델 실행"],
  ["Tauri", "MIT / Apache-2.0", "데스크톱 앱 틀"],
  ["React", "MIT", "화면"],
  ["valibot", "MIT", "데이터 검사"],
  ["Lucide", "ISC", "아이콘"],
  ["Anthropic TypeScript SDK", "MIT", "Claude API 연결 (키를 넣은 경우)"],
];

/** Settings page "정보": the version and the open-source notices. */
export function AboutSettings() {
  const [version, setVersion] = useState<string>();

  useEffect(() => {
    if (isTauri()) {
      getVersion().then(setVersion, () => setVersion(undefined));
    }
  }, []);

  return (
    <fieldset className="settings-section window-settings">
      <legend>malplan</legend>
      <p className="window-note">버전 {version ?? "개발판"}</p>
      <table className="about-notices">
        <caption>함께 쓰는 오픈소스</caption>
        <thead>
          <tr>
            <th scope="col">이름</th>
            <th scope="col">라이선스</th>
            <th scope="col">쓰는 곳</th>
          </tr>
        </thead>
        <tbody>
          {NOTICES.map(([name, license, use]) => (
            <tr key={name}>
              <td>{name}</td>
              <td>{license}</td>
              <td>{use}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="window-note">공휴일 정보: 한국천문연구원 특일 정보 (공공데이터포털, 키를 넣은 경우)</p>
    </fieldset>
  );
}
