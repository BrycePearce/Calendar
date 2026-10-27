import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  snapshotSchema,
  type CalendarEvent,
} from "../packages/calendar-schema/src/index";
export function demoSnapshot(now = new Date()) {
  const month = now.toISOString().slice(0, 7);
  const events: CalendarEvent[] = [];
  const series = [
    "The Quiet Orbit",
    "Harbor of Echoes",
    "Signal / North",
    "A World Apart",
    "The Glass Garden",
    "Midnight Bureau",
  ];
  for (let day = 1; day <= 28; day++) {
    if (day % 7 === 0) continue;
    const count = day === 15 ? 7 : day % 3 === 0 ? 3 : day % 2 === 0 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const id = day * 10 + i,
        date = `${month}-${String(day).padStart(2, "0")}`;
      if (i === 1 || day % 5 === 0)
        events.push({
          id: `radarr:${id}:digital`,
          media: "movie",
          title: [
            "Beyond the Blue",
            "The Last Observatory",
            "Paper Satellites",
            "A Thousand Tomorrows",
          ][day % 4],
          releaseType: "digital",
          date,
        });
      else
        events.push({
          id: `sonarr:${id}:air`,
          media: "tv",
          title: series[(day + i) % series.length],
          episodeTitle: [
            "A distant light",
            "The way home",
            "An unexpected visitor",
            "Nothing stays still",
          ][day % 4],
          season: 2,
          episode: day,
          releaseType: "air",
          at: `${date}T20:00:00Z`,
        });
    }
  }
  events.push(
    {
      id: "radarr:900:theatrical",
      media: "movie",
      title: "The Last Observatory",
      releaseType: "theatrical",
      date: `${month}-15`,
    },
    {
      id: "radarr:900:physical",
      media: "movie",
      title: "The Last Observatory",
      releaseType: "physical",
      date: `${month}-15`,
    },
  );
  const coverage = {
    start: `${month}-01`,
    end: `${month}-${new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate()}`,
  };
  return snapshotSchema.parse({
    version: 1,
    generatedAt: now.toISOString(),
    coverage,
    sources: {
      sonarr: { health: "healthy", lastSuccess: now.toISOString(), coverage },
      radarr: { health: "healthy", lastSuccess: now.toISOString(), coverage },
    },
    events,
  });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve("scripts/demo.ts")
) {
  const dir = "apps/web/public/data";
  await mkdir(dir, { recursive: true });
  await writeFile(
    `${dir}/calendar.json`,
    JSON.stringify(demoSnapshot(), null, 2),
  );
  console.log(
    "Fictional demo snapshot created. Production Docker context excludes it.",
  );
}
