import { useEffect, useRef, useState } from "react";
import { saveDensityPreference, type Density } from "./density-preference";

export function DensitySelect({ value }: { value: Density }) {
  const [selected, setSelected] = useState(value);
  const frame = useRef<number | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    setSelected(value);
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
      className="density-select"
      title="Choose how much detail the calendar shows"
    >
      Density
      <select
        value={selected}
        onChange={(event) => {
          const next = event.target.value as Density;
          setSelected(next);
          if (frame.current !== undefined) cancelAnimationFrame(frame.current);
          clearTimeout(timer.current);
          // Paint the control first, then run the calendar's synchronous layout.
          // Rapid clicks replace pending work rather than queuing old layouts.
          frame.current = requestAnimationFrame(() => {
            timer.current = setTimeout(() => saveDensityPreference(next), 0);
          });
        }}
      >
        <option value="compact">Compact</option>
        <option value="standard">Standard</option>
        <option value="expanded">Expanded</option>
      </select>
    </label>
  );
}
