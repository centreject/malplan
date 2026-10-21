import { Component, type ErrorInfo, type ReactNode } from "react";

type CrashState = { error: Error | undefined };

/**
 * A render error shows this instead of a blank window. Saved items live in the sync files,
 * not in the screen, so reloading loses nothing but unsaved input.
 */
export class CrashScreen extends Component<{ children: ReactNode }, CrashState> {
  override state: CrashState = { error: undefined };

  static getDerivedStateFromError(error: Error): CrashState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("render error", error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;

    if (error === undefined) {
      return this.props.children;
    }

    return (
      <main className="crash" role="alert">
        <h1>화면을 그리다 문제가 생겼습니다</h1>
        <p>저장된 일정은 그대로 있습니다. 다시 불러오면 대부분 해결됩니다. 입력 중이던 내용은 사라질 수 있습니다.</p>
        <button type="button" className="confirm-button is-primary" onClick={() => window.location.reload()}>
          다시 불러오기
        </button>
        <details>
          <summary>오류 내용</summary>
          <pre>{`${error.name}: ${error.message}\n${error.stack ?? ""}`}</pre>
        </details>
      </main>
    );
  }
}
