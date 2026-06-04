import { useRef, useState } from "react";
import { SendIcon, StopIcon } from "./icons";

interface Props {
  disabled?: boolean;
  streaming?: boolean;
  onSend: (text: string) => void;
  onStop?: () => void;
}

export function Composer({ disabled, streaming, onSend, onStop }: Props) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    if (ref.current) ref.current.style.height = "auto";
  }

  return (
    <div className="border-t border-border bg-bg px-4 py-3">
      <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-border bg-surface px-3 py-2 focus-within:border-accent">
        <textarea
          ref={ref}
          value={text}
          rows={1}
          placeholder="Message LgNc..."
          disabled={disabled}
          onChange={(e) => {
            setText(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className="max-h-48 flex-1 resize-none bg-transparent py-1.5 text-[15px] outline-none placeholder:text-muted disabled:opacity-50"
        />
        {streaming ? (
          <button
            onClick={onStop}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-elevated text-fg transition hover:bg-border"
            title="Stop"
          >
            <StopIcon className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={disabled || !text.trim()}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-fg transition hover:opacity-90 disabled:opacity-40"
            title="Send"
          >
            <SendIcon className="h-4 w-4" />
          </button>
        )}
      </div>
      <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-muted">
        Runs on your machine. Memories are stored locally and never leave your device.
      </p>
    </div>
  );
}
