import { snapshotSchema, type CalendarEvent } from "@calendar/schema";
export function demoSnapshot(now = new Date(), monthsAhead = 0) {
  const month = now.toISOString().slice(0, 7);
  const events: CalendarEvent[] = [];
  // Fictional titles and schedules, with realistic weekly cadence and release density.
  const series = [
    "The Quiet Orbit",
    "Harbor of Echoes",
    "Signal / North",
    "A World Apart",
    "The Glass Garden",
    "Midnight Bureau",
    "The Last Frontier",
    "City of Strangers",
    "After the Storm",
    "The Long Way Home",
    "Station Eleven: New Horizons",
    "The Night Shift",
    "Wild Coast",
    "Second Chances",
    "The Kitchen Table",
    "Northern Lights",
    "The Missing Hour",
    "Beyond the Map",
    "Deep Water",
    "The Sunday Club",
    "Open Roads",
    "House of Secrets",
    "Small Town Stories",
    "The Other Side",
    "Summer in December",
    "The Final Chapter",
    "Parallel Lives",
    "The Great Bake-Off Challenge",
    "Inside the Observatory",
    "The Dispatch",
    "Blue Horizon",
    "The Art of Starting Over",
    "Under the Same Sky",
    "Lost & Found",
    "The Last Train",
    "The Weekend Report",
    "Hidden Worlds",
    "The Reunion",
    "First Responders",
    "The Academy",
    "Across the Divide",
    "The Late Show",
    "The Museum After Dark",
    "Tales from the Outer Rim",
  ];
  const movies = [
    "Beyond the Blue",
    "The Last Observatory",
    "Paper Satellites",
    "A Thousand Tomorrows",
    "The Silent Passenger",
    "Echoes of Yesterday",
    "The Winter House",
    "Chasing Daylight",
    "A Place to Begin",
    "The Last Expedition",
    "When the City Sleeps",
    "Wildflowers",
    "The Lighthouse Keeper",
    "An Unlikely Friendship",
    "The Far Side of Morning",
    "Underneath the Stars",
    "The Invisible Thread",
    "A Summer to Remember",
    "The Clockmaker",
    "Departure",
    "The Book of Small Wonders",
    "Northern Passage",
    "The Perfect Stranger",
    "The Lost Photograph",
    "Out of the Woods",
    "Homeward",
    "The Distance Between Us",
    "Nightfall",
    "The Secret of Blackwater Bay",
    "The Crossing",
  ];
  const episodes = [
    "A distant light",
    "The way home",
    "An unexpected visitor",
    "Nothing stays still",
    "The turning point",
    "Between two worlds",
    "No way back",
    "Everything we left behind",
    "The long goodbye",
    "A new beginning",
  ];
  const days = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const counts = [5, 6, 6, 5, 8, 8, 6];
  for (let day = 1; day <= days; day++) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const start = counts
      .slice(0, weekday)
      .reduce((sum, count) => sum + count, 0);
    for (let i = 0; i < counts[weekday]; i++) {
      const show = start + i;
      events.push({
        id: `sonarr:${day * 100 + i}:air`,
        media: "tv",
        title: series[show],
        episodeTitle: episodes[(show + Math.floor(day / 7)) % episodes.length],
        season: 1 + (show % 8),
        episode: 3 + Math.floor((day - 1) / 7),
        releaseType: "air",
        at: `${date}T${[7, 10, 17, 20, 21, 23, 8, 19][i]}:00:00Z`.replace(
          /T(\d):/,
          "T0$1:",
        ),
      });
    }
    // A streaming season drop creates a genuinely crowded day, not duplicate movies.
    if (day === 1 || day === 15) {
      for (let episode = 1; episode <= 10; episode++)
        events.push({
          id: `sonarr:${5000 + day * 100 + episode}:air`,
          media: "tv",
          title: day === 1 ? "The Archive" : "The Vanishing Coast",
          episodeTitle: episodes[episode - 1],
          season: 1,
          episode,
          releaseType: "air",
          at: `${date}T07:00:00Z`,
        });
    }
    const movieCount =
      weekday === 5 || weekday === 2
        ? 3
        : weekday === 0 || weekday === 3
          ? 0
          : 1;
    for (let i = 0; i < movieCount; i++) {
      const movie = (day + i * 9) % movies.length;
      const releaseType =
        weekday === 5 ? "theatrical" : weekday === 2 ? "physical" : "digital";
      events.push({
        id: `radarr:${day * 100 + i}:${releaseType}`,
        media: "movie",
        title: movies[movie],
        releaseType,
        date,
      });
    }
  }
  events.push({
    id: "radarr:90000:theatrical",
    media: "movie",
    title: "The Last Observatory",
    releaseType: "theatrical",
    date: `${month}-15`,
  });
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
