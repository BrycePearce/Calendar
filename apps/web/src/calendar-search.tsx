import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

// Keep keystrokes local: filtering and calendar layout run only after a pause.
export function CalendarSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const composing = useRef(false);

  useEffect(() => {
    clearTimeout(timer.current);
    setDraft(value);
    return () => clearTimeout(timer.current);
  }, [value]);

  function commit(text: string, immediate = false) {
    clearTimeout(timer.current);
    if (immediate) onChange(text);
    else timer.current = setTimeout(() => onChange(text), 200);
  }

  return (
    <div className="search" role="search">
      <Search size={16} aria-hidden="true" />
      <input
        ref={input}
        aria-label="Search titles"
        placeholder="Search titles…"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          if (!composing.current) commit(event.target.value);
        }}
        onCompositionStart={() => {
          composing.current = true;
          clearTimeout(timer.current);
        }}
        onCompositionEnd={(event) => {
          composing.current = false;
          commit(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !composing.current) commit(draft, true);
        }}
      />
      {draft && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setDraft("");
            commit("", true);
            input.current?.focus();
          }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
