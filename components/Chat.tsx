"use client";

import { useEffect, useRef, useState } from "react";
import Car from "./Car";
import { PAINTS } from "@/lib/cars";
import { ChatMsg, MAX_CHAT } from "@/lib/race";

const QUICK = ["👍", "😂", "🔥", "😮", "🏁", "GG"];
const EMOJIS = [
  "😀", "😂", "🤣", "😅", "😎", "🤩", "😍", "🥳", "😜", "🤪", "😇", "🙃",
  "🤔", "😏", "😬", "😱", "😭", "😤", "😡", "🥶", "🤯", "😴", "🤝", "👏",
  "🙌", "👍", "👎", "✌️", "🤞", "💪", "🙏", "👀", "🔥", "💯", "⚡", "💥",
  "🚀", "🏎️", "🏁", "🏆", "🥇", "🥈", "🥉", "🎉", "🎯", "⌨️", "❤️", "💔",
  "😈", "👻", "💀", "🤡", "🐢", "🐇", "🦄", "🍕", "☕", "🌟", "✨", "🎮",
];

// One or a few emoji and nothing else: shown big, like on phones.
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s){1,12}$/u;
const isBigEmoji = (t: string) => EMOJI_ONLY.test(t) && /\p{Extended_Pictographic}/u.test(t) && [...t.replace(/\s/g, "")].length <= 8;

const timeOf = (at: number) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function Chat({
  messages,
  myId,
  secure,
  onSend,
  onClose,
}: {
  messages: ChatMsg[];
  myId: string;
  secure: boolean;
  onSend: (text: string) => void;
  onClose?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [picker, setPicker] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the newest message in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const send = (text: string) => {
    if (!text.trim()) return;
    onSend(text);
    setDraft("");
    setPicker(false);
  };

  return (
    <section className="chat" aria-label="Room chat">
      <header className="chat-head">
        <span className="chat-title">
          <b>Room chat</b>
          <small className="chat-lock">🔒 {secure ? "End-to-end encrypted · only players can read" : "Private to this room's players"}</small>
        </span>
        {onClose && (
          <button className="nav-btn" onClick={onClose} aria-label="Close chat">
            ×
          </button>
        )}
      </header>

      <div className="chat-list" ref={listRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <span aria-hidden>💬</span>
            Say hi to the other racers!
          </div>
        )}
        {messages.map((m, i) => {
          if (m.system) {
            return (
              <div key={m.id} className="chat-note">
                {m.text}
              </div>
            );
          }
          const mine = m.from === myId;
          const prev = messages[i - 1];
          const first = !prev || prev.system || prev.from !== m.from;
          const big = m.text !== null && isBigEmoji(m.text);
          const color = m.car ? (PAINTS[m.car.c]?.hex ?? "#1f6feb") : "#1f6feb";
          return (
            <div key={m.id} className={`chat-row ${mine ? "mine" : ""} ${first ? "first" : ""}`}>
              {!mine && (
                <span className="chat-avatar" aria-hidden>
                  {first && m.car && <Car look={m.car} />}
                </span>
              )}
              <div className={`bubble ${big ? "big" : ""} ${m.text === null ? "locked" : ""}`}>
                {!mine && first && (
                  <span className="bubble-name" style={{ color: color === "#f2f4f7" ? undefined : color }}>
                    {m.name}
                  </span>
                )}
                <span className="bubble-text">{m.text ?? "🔒 This message couldn't be opened here"}</span>
                <time>{timeOf(m.at)}</time>
              </div>
            </div>
          );
        })}
      </div>

      <div className="chat-quick">
        {QUICK.map((q) => (
          <button key={q} className="quick" onClick={() => send(q)}>
            {q}
          </button>
        ))}
      </div>

      {picker && (
        <div className="emoji-grid" role="listbox" aria-label="Emoji">
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => {
                setDraft((d) => (d + e).slice(0, MAX_CHAT));
                inputRef.current?.focus();
              }}
            >
              {e}
            </button>
          ))}
        </div>
      )}

      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <button type="button" className={`emoji-btn ${picker ? "on" : ""}`} onClick={() => setPicker((p) => !p)} aria-label="Emoji">
          😊
        </button>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_CHAT}
          placeholder="Message…"
          enterKeyHint="send"
          aria-label="Message"
        />
        <button type="submit" className="send-btn" disabled={!draft.trim()} aria-label="Send">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
            <path d="M3.4 20.4l17.5-7.5a1 1 0 0 0 0-1.8L3.4 3.6a1 1 0 0 0-1.4 1.2L4.4 12l-2.4 7.2a1 1 0 0 0 1.4 1.2z" />
          </svg>
        </button>
      </form>
    </section>
  );
}
