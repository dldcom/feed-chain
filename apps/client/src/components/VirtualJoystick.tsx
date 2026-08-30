import { useRef, useState } from "react";
import { useGameStore } from "../store/gameStore";

export function VirtualJoystick(): JSX.Element {
  const baseRef = useRef<HTMLDivElement>(null);
  const pointerId = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const setInput = useGameStore((state) => state.setInput);

  const update = (clientX: number, clientY: number): void => {
    const rect = baseRef.current?.getBoundingClientRect();
    if (!rect) return;
    const radius = rect.width * 0.34;
    let x = clientX - (rect.left + rect.width / 2);
    let y = clientY - (rect.top + rect.height / 2);
    const length = Math.hypot(x, y);
    if (length > radius) {
      x = (x / length) * radius;
      y = (y / length) * radius;
    }
    setKnob({ x, y });
    setInput(x / radius, y / radius);
  };

  const stop = (): void => {
    pointerId.current = null;
    setKnob({ x: 0, y: 0 });
    setInput(0, 0);
  };

  return (
    <div
      ref={baseRef}
      className="joystick"
      onPointerDown={(event) => {
        pointerId.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        update(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (pointerId.current === event.pointerId) update(event.clientX, event.clientY);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      aria-label="이동 조이스틱"
    >
      <div className="joystick-ring" />
      <div className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

