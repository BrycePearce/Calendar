import { snapshotSchema, type CalendarEvent } from "@calendar/schema";
export function demoSnapshot(now = new Date(), monthsAhead = 0) {
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
  for (let offset = 1; offset <= monthsAhead; offset++) {
    const next = demoSnapshot(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)),
    );
    for (const event of next.events) {
      const [source, id, release] = event.id.split(":");
      events.push({
        ...event,
        id: `${source}:${Number(id) + offset * 100000}:${release}`,
      });
    }
    coverage.end = next.coverage.end;
  }
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
