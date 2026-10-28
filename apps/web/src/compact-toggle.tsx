import { useEffect, useRef, useState } from "react";
import { saveCompactPreference } from "./compact-preference";

export function CompactToggle({ value }: { value: boolean }) {
  const [checked, setChecked] = useState(value);
  const frame = useRef<number | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    setChecked(value);
  }, [value]);
  useEffect(
    () => () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
      clearTimeout(timer.current);
    },
    [],
  );
  return (
    <label
      className="compact-toggle"
      title="Fit the calendar on screen with smaller cards"
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          const next = event.target.checked;
          setChecked(next);
          if (frame.current !== undefined) cancelAnimationFrame(frame.current);
          clearTimeout(timer.current);
          // Paint the control first, then run the calendar's synchronous layout.
          // Rapid clicks replace pending work rather than queuing old layouts.
          frame.current = requestAnimationFrame(() => {
            timer.current = setTimeout(() => saveCompactPreference(next), 0);
          });
        }}
      />
      Compact
    </label>
  );
}
