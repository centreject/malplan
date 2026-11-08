import { useEffect, useRef, useState } from "react";
import { useUpdate } from "./update";

/** The app stays open for days in the tray: look again this often. */
const RECHECK_MS = 24 * 60 * 60_000;

/**
 * Right after start and once a day (the check itself takes about a second): if a newer version is out, ask once per
 * version. A failed install says so instead of closing silently.
 */
export function UpdateNotice() {
  const dialog = useRef<HTMLDialogElement>(null);
  const { state, find, install } = useUpdate();
  /** The version answered with 나중에, or "failed" once a failed install was acknowledged. */
  const [dismissed, setDismissed] = useState<string>();
  const [installing, setInstalling] = useState(false);

  /** While the dialog is up (asking, downloading, reporting a failure) the daily check waits. */
  const showing = useRef(false);

  useEffect(() => {
    void find();

    const timer = window.setInterval(() => {
      if (!showing.current) void find();
    }, RECHECK_MS);

    return () => window.clearInterval(timer);
  }, [find]);

  const show =
    (state.phase === "available" && dismissed !== state.update.version) ||
    state.phase === "installing" ||
    (state.phase === "failed" && installing);

  useEffect(() => {
    showing.current = show;
  }, [show]);

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

        if (state.phase === "available") {
          setDismissed(state.update.version);
        } else if (state.phase === "failed") {
          setInstalling(false);
        }
      }}
    >
      <header className="settings-head">
        <h2 id="update-title">
          {state.phase === "available" ? `새 버전 ${state.update.version}이 나왔습니다` : state.phase === "failed" ? "업데이트하지 못했습니다" : "업데이트 설치 중"}
        </h2>
      </header>
      {state.phase === "available" ? (
        <>
          <p>받아서 설치하면 malplan이 잠시 닫혔다가 다시 열립니다. 일정과 설정, AI 모델은 그대로 남습니다.</p>
          <footer className="confirm-foot">
            <button type="button" className="confirm-button" onClick={() => setDismissed(state.update.version)}>
              나중에
            </button>
            <button
              type="button"
              className="confirm-button is-primary"
              onClick={() => {
                setInstalling(true);
                void install(state.update);
              }}
            >
              지금 업데이트
            </button>
          </footer>
        </>
      ) : state.phase === "failed" ? (
        <>
          <p role="alert">{state.message} 마이페이지 → 정보의 업데이트 확인으로 다시 시도할 수 있습니다.</p>
          <footer className="confirm-foot">
            <button type="button" className="confirm-button is-primary" onClick={() => setInstalling(false)}>
              닫기
            </button>
          </footer>
        </>
      ) : (
        <p role="status">{state.percent === undefined ? "받는 중…" : `받는 중… ${state.percent}%`}</p>
      )}
    </dialog>
  );
}
