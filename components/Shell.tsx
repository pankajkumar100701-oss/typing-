"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { CAR_MODELS, bestSpeed, tierReached } from "@/lib/cars";
import { subscribe as subscribeProgress } from "@/lib/progress";

// Shared by the lessons page and the car race: full screen, the first-launch prompt and the rotate prompt.

const fsSubscribe = (cb: () => void) => {
  document.addEventListener("fullscreenchange", cb);
  return () => document.removeEventListener("fullscreenchange", cb);
};
const isFullscreen = () => document.fullscreenElement !== null;
const canFullscreen = () => document.fullscreenEnabled === true;
const no = () => false;

/** Fullscreen on/off. Works held upright or sideways — the layout follows the phone. */
export async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({ navigationUI: "hide" });
  } catch {
    // iOS Safari has no fullscreen for pages
  }
}

/** Fullscreen and turn sideways; iOS Safari and desktop can't lock, so the user rotates by hand. */
async function goLandscape() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await orientation.lock?.("landscape");
  } catch {
    // can't lock here — the prompt stays until the phone is turned or dismissed
  }
}

// The prompts show once per visit, across both pages.
const prompts = { launch: false, rotate: false };
const promptListeners = new Set<() => void>();
const SEEN_KEY = "typefast:prompts";

function readPrompts() {
  try {
    Object.assign(prompts, JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "{}"));
  } catch {
    // storage blocked — the prompts may show again on the next page
  }
}
let promptsRead = false;
const subscribePrompts = (cb: () => void) => {
  promptListeners.add(cb);
  return () => promptListeners.delete(cb);
};
function dismiss(which: keyof typeof prompts) {
  prompts[which] = true;
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(prompts));
  } catch {
    // storage blocked
  }
  promptListeners.forEach((l) => l());
}
const seen = (which: keyof typeof prompts) => () => {
  if (!promptsRead) {
    promptsRead = true;
    readPrompts();
  }
  return prompts[which];
};
const seenLaunch = seen("launch");
const seenRotate = seen("rotate");
const yes = () => true;

export function useFullscreen() {
  const on = useSyncExternalStore(fsSubscribe, isFullscreen, no);
  const supported = useSyncExternalStore(fsSubscribe, canFullscreen, no);
  return { on, supported };
}

export function FullscreenButton() {
  const { on, supported } = useFullscreen();
  if (!supported) return null;
  return (
    <button className={`fs-btn ${on ? "on" : ""}`} onClick={toggleFullscreen} aria-label={on ? "Exit full screen" : "Full screen"}>
      <FullscreenIcon on={on} />
      <span>{on ? "Exit" : "Full screen"}</span>
    </button>
  );
}

/**
 * Right after launch: offer full screen with a big button (browsers only allow it after a tap).
 * A phone held upright is first asked to turn sideways.
 */
export function LaunchPrompt() {
  const { on, supported } = useFullscreen();
  const launchSeen = useSyncExternalStore(subscribePrompts, seenLaunch, yes);
  const rotateSeen = useSyncExternalStore(subscribePrompts, seenRotate, yes);

  return (
    <>
      {supported && !on && !launchSeen && (
        <div className="launch-overlay">
          <div className="launch-card">
            <span className="launch-icon" aria-hidden>
              <FullscreenIcon on={false} />
            </span>
            <h2>
              type<b>fast</b>
            </h2>
            <p>Play in full screen — no browser bars, more room for the text and the keyboard.</p>
            <button
              className="btn primary big"
              onClick={() => {
                dismiss("launch");
                void toggleFullscreen();
              }}
            >
              Go full screen
            </button>
            <button className="btn ghost" onClick={() => dismiss("launch")}>
              Not now
            </button>
          </div>
        </div>
      )}
      {!rotateSeen && (
        <div className="rotate-overlay">
          <div className="rotate-phone" aria-hidden />
          <h2>Rotate your phone</h2>
          <p>TypeFast works best in landscape.</p>
          <p className="kbd-tip">
            ⌨ For real typing practice, please connect a keyboard with an <b>OTG cable</b> or <b>Bluetooth</b>. Held upright,
            your phone&apos;s own keyboard works too.
          </p>
          <button
            className="btn primary"
            onClick={() => {
              dismiss("launch");
              void goLandscape();
            }}
          >
            Go landscape
          </button>
          <button className="btn ghost" onClick={() => dismiss("rotate")}>
            Continue in portrait
          </button>
        </div>
      )}
    </>
  );
}

export function FullscreenIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {on ? (
        <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
      ) : (
        <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      )}
    </svg>
  );
}

export function KeyboardIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M6.5 14h11" />
    </svg>
  );
}

// ---------- new cars unlocked ----------

const SEEN_TIER_KEY = "typefast:tier-seen";
let seenTier: number | null = null;
const tierListeners = new Set<() => void>();
const subscribeTier = (cb: () => void) => {
  tierListeners.add(cb);
  return () => tierListeners.delete(cb);
};
function getSeenTier() {
  if (seenTier === null) {
    try {
      seenTier = Number(localStorage.getItem(SEEN_TIER_KEY)) || 0;
    } catch {
      seenTier = 0;
    }
  }
  return seenTier;
}
function markTierSeen(tier: number) {
  seenTier = tier;
  try {
    localStorage.setItem(SEEN_TIER_KEY, String(tier));
  } catch {
    // storage blocked — the note may show again next visit
  }
  tierListeners.forEach((l) => l());
}
const zero = () => 0;
const big = () => Infinity;

/** A note when the player's speed has opened a new tier of cars. */
export function UnlockToast() {
  const best = useSyncExternalStore(subscribeProgress, bestSpeed, zero);
  const seen = useSyncExternalStore(subscribeTier, getSeenTier, big);
  const tier = tierReached(best);
  const fresh = CAR_MODELS.filter((m) => m.tier > seen && m.tier <= tier);
  if (tier <= seen || fresh.length === 0) return null;
  return (
    <div className="unlock-toast" role="status">
      <span className="unlock-icon" aria-hidden>
        🔓
      </span>
      <span className="unlock-text">
        <b>New cars unlocked!</b>
        <small>
          You reached {tier} wpm — {fresh.length} new {fresh.length === 1 ? "car" : "cars"} in the garage.
        </small>
      </span>
      <Link className="btn primary" href="/race" onClick={() => markTierSeen(tier)}>
        See cars
      </Link>
      <button className="nav-btn" onClick={() => markTierSeen(tier)} aria-label="Close">
        ×
      </button>
    </div>
  );
}
