import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { gigabytes, modelStatus } from "../llm/localModel";
import { readStored, writeStored } from "../storage/localStore";

const SHOWN_KEY = "malplan.firstRunNotice";

/** Kept across restarts after an old model is deleted until the user answers this prompt. */
const REPLACED_PENDING = "replaced";

type Notice = { total: number; name: string; replaced: boolean };

type FirstRunNoticeProps = {
  /** Only the local AI needs the model. */
  localAi: boolean;
  /** 지금 받기: the AI settings page, where the license and size are shown before downloading. */
  onDownload: () => void;
};

/**
 * Once on the first desktop run without the model, and again when an update removes a previously installed model:
 * what the download is for, with 지금 받기 / 나중에.
 */
export function FirstRunNotice({ localAi, onDownload }: FirstRunNoticeProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  /** The notice details while due; undefined hides it. */
  const [notice, setNotice] = useState<Notice>();
  const show = notice !== undefined;

  useEffect(() => {
    if (!isTauri() || !localAi) {
      return;
    }

    const shown = readStored(SHOWN_KEY);

    void modelStatus().then(
      (status) => {
        if (status.size !== null) {
          if (shown === REPLACED_PENDING) {
            writeStored(SHOWN_KEY, status.name);
          }

          setNotice(undefined);

          return;
        }

        if (status.downloading) {
          setNotice(undefined);

          return;
        }

        const replaced = (status.replaced && shown !== status.name) || shown === REPLACED_PENDING;

        if (replaced) {
          // Persist until the user answers: the old model file is already deleted on the next launch.
          writeStored(SHOWN_KEY, REPLACED_PENDING);
          setNotice({ total: status.total, name: status.name, replaced: true });

          return;
        }

        setNotice(shown === null ? { total: status.total, name: status.name, replaced: false } : undefined);
      },
      () => undefined,
    );
  }, [localAi]);

  useEffect(() => {
    if (show) {
      dialog.current?.showModal();
    }
  }, [show]);

  const close = () => {
    writeStored(SHOWN_KEY, notice?.name ?? "1");
    setNotice(undefined);
  };

  if (notice === undefined) {
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
        <h2 id="first-run-title">
          {notice.replaced ? "AI 모델이 새 버전으로 바뀌었습니다" : "문장으로 입력하려면 AI 모델이 필요합니다"}
        </h2>
      </header>
      <p>
        {notice.replaced
          ? `이전 모델을 정리하고 ${notice.name}(약 ${gigabytes(notice.total)})으로 바뀌었습니다. 새 모델을 한 번 받아 두면 인터넷 없이 이 PC 안에서만 동작하고, 입력한 일정은 밖으로 나가지 않습니다.`
          : `제목·분류·장소를 문장에서 정리하는 AI 모델(약 ${gigabytes(notice.total)})을 이 PC에 한 번 받아 둡니다. 받은 뒤에는 인터넷 없이 이 PC 안에서만 동작하고, 입력한 일정은 밖으로 나가지 않습니다.`}
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
