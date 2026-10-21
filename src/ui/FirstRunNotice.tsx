import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { modelStatus } from "../llm/localModel";
import { readStored, writeStored } from "../storage/localStore";

const SHOWN_KEY = "malplan.firstRunNotice";

type FirstRunNoticeProps = {
  /** Only the local AI needs the model. */
  localAi: boolean;
  /** 지금 받기: the AI settings page, where the license and size are shown before downloading. */
  onDownload: () => void;
};

/** Once, on the first desktop run without the model: what the download is for, with 지금 받기 / 나중에. */
export function FirstRunNotice({ localAi, onDownload }: FirstRunNoticeProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isTauri() || !localAi || readStored(SHOWN_KEY) !== null) {
      return;
    }

    void modelStatus().then((status) => setShow(status.size === null && !status.downloading), () => undefined);
  }, [localAi]);

  useEffect(() => {
    if (show) {
      dialog.current?.showModal();
    }
  }, [show]);

  const close = () => {
    writeStored(SHOWN_KEY, "1");
    setShow(false);
  };

  if (!show) {
    return null;
  }

  return (
    <dialog
      ref={dialog}
      className="settings first-run"
      aria-labelledby="first-run-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header className="settings-head">
        <h2 id="first-run-title">문장으로 입력하려면 AI 모델이 필요합니다</h2>
      </header>
      <p>
        제목·분류·장소를 문장에서 정리하는 AI 모델(약 2.5GB)을 이 PC에 한 번 받아 둡니다. 받은 뒤에는 인터넷 없이 이 PC 안에서만
        동작하고, 입력한 일정은 밖으로 나가지 않습니다.
      </p>
      <p className="first-run-sub">받지 않아도 날짜·시간은 규칙으로 읽습니다. 나중에 마이페이지 → AI 변환에서 받을 수 있습니다.</p>
      <footer className="confirm-foot">
        <button type="button" className="confirm-button" onClick={close}>
          나중에
        </button>
        <button
          type="button"
          className="confirm-button is-primary"
          onClick={() => {
            close();
            onDownload();
          }}
        >
          지금 받기
        </button>
      </footer>
    </dialog>
  );
}
