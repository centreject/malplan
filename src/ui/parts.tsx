import { ChevronLeft, ChevronRight, Square, SquareCheck } from "lucide-react";
import type { ReactNode } from "react";
import type { Category } from "../domain/item";

export function CategoryTag({ category }: { category: Category | undefined }) {
  if (category === undefined) {
    return null;
  }

  return <span className={`cat-tag cat-${category.colorSlot}`}>{category.name}</span>;
}

export function CategoryDot({ category }: { category: Category | undefined }) {
  return <span className={`cat-dot cat-${category?.colorSlot ?? 0}`} aria-hidden="true" />;
}

/** Calendar-cell marker: a checkbox for tasks, a dot for events, in the category colour. */
export function ItemMark({ category, task, done }: { category: Category | undefined; task: boolean; done: boolean }) {
  if (!task) {
    return <CategoryDot category={category} />;
  }

  const Icon = done ? SquareCheck : Square;

  return (
    <Icon
      className={`task-mark cat-${category?.colorSlot ?? 0}`}
      size={12}
      strokeWidth={2.5}
      aria-label={done ? "완료한 할 일" : "할 일"}
    />
  );
}

type PaneHeaderProps = {
  title: ReactNode;
  /** "날", "주", "달" — used in the prev/next labels. */
  unit: string;
  /** Shown as "<resetLabel>로" when the pane is away from the current period. */
  resetLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onReset: (() => void) | undefined;
  children?: ReactNode;
};

/** Pane title with previous / next / back-to-current navigation. */
export function PaneHeader({ title, unit, resetLabel, onPrev, onNext, onReset, children }: PaneHeaderProps) {
  return (
    <header className="pane-head">
      <h2 className="pane-title">{title}</h2>
      {children}
      <nav className="pane-nav" aria-label={`${resetLabel} 이동`}>
        {onReset !== undefined && (
          <button type="button" className="text-button" onClick={onReset}>
            {resetLabel}로
          </button>
        )}
        <button type="button" className="icon-button" onClick={onPrev} aria-label={`이전 ${unit}`}>
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <button type="button" className="icon-button" onClick={onNext} aria-label={`다음 ${unit}`}>
          <ChevronRight size={18} strokeWidth={2} />
        </button>
      </nav>
    </header>
  );
}
