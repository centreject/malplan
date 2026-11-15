import { createContext, useEffect, useRef, type KeyboardEvent, type MouseEvent } from "react";
import type { IsoDate } from "../domain/date";
import type { Item } from "../domain/item";

export type MenuAction = { label: string; run: () => void };

/** Where the pointer was, in viewport pixels, and what the menu offers. */
export type MenuRequest = { x: number; y: number; actions: MenuAction[] };

type OpenItemMenu = (event: MouseEvent, item: Item, date?: IsoDate) => void;

const noMenu: OpenItemMenu = () => undefined;

/** Right-click on an item anywhere on the board: App supplies what the menu does. */
export const ItemMenu = createContext<OpenItemMenu>(noMenu);

const ROW_PX = 34;

const WIDTH_PX = 168;

/** Up and down arrows walk the menu's entries, wrapping at the ends. */
function moveFocus(event: KeyboardEvent<HTMLDivElement>): void {
  const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
  const buttons = [...event.currentTarget.querySelectorAll("button")];

  if (step !== 0 && buttons.length > 0) {
    event.preventDefault();
    buttons[(buttons.findIndex((button) => button === document.activeElement) + step + buttons.length) % buttons.length]?.focus();
  }
}

/**
 * The app's own right-click menu. A popover: a click elsewhere or Escape closes it.
 * Rendered with a key per request, so each request is a fresh menu.
 */
export function ContextMenu({ request, onClose }: { request: MenuRequest; onClose: () => void }) {
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    menu.current?.showPopover();
    menu.current?.querySelector("button")?.focus();
  }, []);

  // 글자 크기 zooms the page, and a fixed position is in zoomed pixels.
  const zoom = Number(getComputedStyle(document.documentElement).zoom) || 1;
  const left = Math.max(0, Math.min(request.x, window.innerWidth - WIDTH_PX * zoom - 8)) / zoom;
  const top = Math.max(0, Math.min(request.y, window.innerHeight - (request.actions.length * ROW_PX + 12) * zoom - 8)) / zoom;

  return (
    <div
      ref={menu}
      className="context-menu"
      popover="auto"
      role="menu"
      style={{ left, top, width: WIDTH_PX }}
      onKeyDown={moveFocus}
      onToggle={(event) => {
        if (event.newState === "closed") {
          onClose();
        }
      }}
    >
      {request.actions.map((action) => (
        <button
          key={action.label}
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            action.run();
          }}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
