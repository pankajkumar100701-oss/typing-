"use client";

import { useEffect, useRef, useState } from "react";
import { hexToHsv, hsvToHex } from "@/lib/cars";

/**
 * A colour wheel: the hue goes round the ring, the colour gets paler towards the middle, and the
 * slider below makes it darker. The car is repainted while dragging (a few times a second).
 */
export default function ColourRing({ value, onPick, onDone }: { value: string | null; onPick: (hex: string) => void; onDone: () => void }) {
  const [hsv, setHsv] = useState(() => (value ? hexToHsv(value) : { h: 210, s: 0.85, v: 0.92 }));
  const wheelRef = useRef<HTMLDivElement>(null);
  const lastSent = useRef(0);
  const hex = hsvToHex(hsv.h, hsv.s, hsv.v);
  const panelRef = useRef<HTMLDivElement>(null);

  // Opened below the swatches: bring it into view.
  useEffect(() => {
    panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  const send = (next: { h: number; s: number; v: number }, now = false) => {
    setHsv(next);
    const t = performance.now();
    if (now || t - lastSent.current > 160) {
      lastSent.current = t;
      onPick(hsvToHex(next.h, next.s, next.v));
    }
  };

  const fromPointer = (e: React.PointerEvent, now = false) => {
    const box = wheelRef.current!.getBoundingClientRect();
    const r = box.width / 2;
    const dx = e.clientX - box.left - r;
    const dy = e.clientY - box.top - r;
    const h = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    const s = Math.min(1, Math.hypot(dx, dy) / r);
    // Picking from the wheel brings back a bright colour if the slider was all the way down.
    send({ h, s, v: Math.max(hsv.v, 0.25) }, now);
  };

  const rad = (hsv.h * Math.PI) / 180;
  return (
    <div className="ring-panel" ref={panelRef}>
      <div
        ref={wheelRef}
        className="ring"
        style={{ "--dark": 1 - hsv.v } as React.CSSProperties}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e);
        }}
        onPointerUp={(e) => fromPointer(e, true)}
        role="slider"
        aria-label="Colour"
        aria-valuenow={Math.round(hsv.h)}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuetext={hex}
      >
        <span
          className="ring-dot"
          style={{ left: `${50 + 50 * hsv.s * Math.sin(rad)}%`, top: `${50 - 50 * hsv.s * Math.cos(rad)}%`, background: hex }}
        />
      </div>
      <div className="ring-side">
        <span className="ring-preview" style={{ background: hex }} />
        <code>{hex.toUpperCase()}</code>
        <label className="ring-light">
          <span>Dark ↔ Bright</span>
          <input
            type="range"
            min={5}
            max={100}
            value={Math.round(hsv.v * 100)}
            style={{ "--full": hsvToHex(hsv.h, hsv.s, 1) } as React.CSSProperties}
            onChange={(e) => send({ ...hsv, v: Number(e.target.value) / 100 })}
            onPointerUp={() => onPick(hex)}
            onKeyUp={() => onPick(hex)}
            aria-label="Brightness"
          />
        </label>
        <button
          className="btn primary"
          onClick={() => {
            onPick(hex);
            onDone();
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}
