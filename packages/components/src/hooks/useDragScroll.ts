'use client'

import * as React from "react";

const DRAG_THRESHOLD = 5;

type DragState = {
  active: boolean;
  dragging: boolean;
  pointerId: number;
  startX: number;
  startScrollLeft: number;
};

const IDLE: DragState = {
  active: false,
  dragging: false,
  pointerId: -1,
  startX: 0,
  startScrollLeft: 0,
};

export type DragScrollHandlers = {
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void;
  onClickCapture: (e: React.MouseEvent<HTMLElement>) => void;
};

export function useDragScroll<T extends HTMLElement>() {
  const ref = React.useRef<T>(null);
  const state = React.useRef<DragState>(IDLE);
  const suppressClick = React.useRef(false);
  const [dragging, setDragging] = React.useState(false);

  const onPointerDown = React.useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const track = ref.current;
    if (!track) return;
    state.current = {
      active: true,
      dragging: false,
      pointerId: e.pointerId,
      startX: e.clientX,
      startScrollLeft: track.scrollLeft,
    };
  }, []);

  const onPointerMove = React.useCallback((e: React.PointerEvent<HTMLElement>) => {
    const s = state.current;
    const track = ref.current;
    if (!s.active || !track) return;
    e.preventDefault();
    const delta = e.clientX - s.startX;
    if (!s.dragging) {
      if (Math.abs(delta) < DRAG_THRESHOLD) return;
      s.dragging = true;
      track.setPointerCapture(s.pointerId);
      setDragging(true);
    }
    track.scrollLeft = s.startScrollLeft - delta;
  }, []);

  const endDrag = React.useCallback((e: React.PointerEvent<HTMLElement>) => {
    const s = state.current;
    const track = ref.current;
    if (!s.active) return;
    if (s.dragging) {
      setDragging(false);
      if (track?.hasPointerCapture(s.pointerId)) {
        track.releasePointerCapture(s.pointerId);
      }
      suppressClick.current = true;
    }
    state.current = IDLE;
  }, []);

  const onClickCapture = React.useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handlers: DragScrollHandlers = React.useMemo(
    () => ({
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onClickCapture,
    }),
    [onPointerDown, onPointerMove, endDrag, onClickCapture]
  );

  return { ref, dragging, handlers };
}
