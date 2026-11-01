import { useEffect, useRef, useState } from "react";
import { useUpdate } from "./update";

/** Right after start (the check itself takes about a second): if a newer version is out, ask once per launch. */
export function UpdateNotice() {
  const dialog = useRef<HTMLDialogElement>(null);
  const { state, find, install } = useUpdate();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    void find();
  }, [find]);

  const show = !dismissed && (state.phase === "available" || state.phase === "installing");

  useEffect(() => {
    if (show && dialog.current?.open === false) {
      dialog.current.showModal();
    }
  }, [show]);

  if (!show) {
    return null;
  }

  return (
    <dialog
      ref={dialog}
      className="settings first-run"
      aria-labelledby="update-title"
      onCancel={(event) => {
        event.preventDefault();

        if (state.phase !== "installing") {
          setDismissed(true);
        }
      }}
    >
      <header className="settings-head">
        <h2 id="update-title">{state.phase === "available" ? `새 버전 ${state.update.version}이 나왔습니다` : "업데이트 설치 중"}</h2>
      </header>
      {state.phase === "available" ? (
        <>
          <p>받아서 설치하면 malplan이 잠시 닫혔다가 다시 열립니다. 일정과 설정, AI 모델은 그대로 남습니다.</p>
          <footer className="confirm-foot">
            <button type="button" className="confirm-button" onClick={() => setDismissed(true)}>
              나중에
            </button>
            <button type="button" className="confirm-button is-primary" onClick={() => void install(state.update)}>
              지금 업데이트
            </button>
          </footer>
        </>
      ) : (
        <p role="status">{state.percent === undefined ? "받는 중…" : `받는 중… ${state.percent}%`}</p>
      )}
    </dialog>
  );
}
