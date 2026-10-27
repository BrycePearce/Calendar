import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import { addMonths, format, parseISO, endOfMonth } from "date-fns";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Film,
  List,
  Search as SearchIcon,
  Tv,
  Radio,
  X,
} from "lucide-react";
import {
  publicConfigSchema,
  snapshotSchema,
  releaseTypes,
  type CalendarEvent,
  type Search,
  type PublicConfig,
} from "@calendar/schema";
import { Route } from "./routes/index";
import { Button } from "./components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./components/ui/dialog";
import { dayOf, episodeLabel } from "./lib";

async function json(path: string) {
  const response = await fetch(path, {
    cache: "no-cache",
    credentials: "omit",
  });
  if (!response.ok) throw new Error("Calendar unavailable");
  return response.json() as Promise<unknown>;
}
const labels = {
  air: "TV episode",
  theatrical: "Theatrical",
  digital: "Digital",
  physical: "Physical",
};
function timeLabel(e: CalendarEvent, config: PublicConfig) {
  return e.media === "tv"
    ? new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
        ...(config.timezone === "UTC" ? { timeZone: "UTC" } : {}),
      }).format(new Date(e.at))
    : "Date only";
}
export function CalendarApp() {
  const configQuery = useQuery({
    queryKey: ["config"],
    queryFn: async () => publicConfigSchema.parse(await json("/config.json")),
  });
  if (configQuery.isPending)
    return (
      <main className="loading" role="status">
        Loading your calendar…
      </main>
    );
  if (!configQuery.data)
    return (
      <main className="loading">
        <h1>Calendar unavailable</h1>
        <p>Public configuration could not be loaded.</p>
        <Button onClick={() => void configQuery.refetch()}>Try again</Button>
      </main>
    );
  return <CalendarContent config={configQuery.data} />;
}
function CalendarContent({ config }: { config: PublicConfig }) {
  const search = Route.useSearch(),
    navigate = Route.useNavigate();
  const [initialView] = useState<"agenda" | "month">(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 700px)").matches
      ? "agenda"
      : "month",
  );
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const focusReturn = useRef<HTMLElement | null>(null);
  const calendar = useRef<FullCalendar>(null);
  const today = format(new Date(), "yyyy-MM"),
    month = search.month ?? today,
    view = search.view ?? initialView;
  const monthDate = parseISO(month + "-01");
  const query = useQuery({
    queryKey: ["calendar"],
    queryFn: async () =>
      snapshotSchema.parse(await json("/data/calendar.json")),
  });
  const update = (patch: Partial<Search>, replace = false) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace });
  useEffect(() => {
    document.title = config.title;
  }, [config.title]);
  useEffect(() => {
    calendar.current?.getApi().gotoDate(month + "-01");
  }, [month, view]);
  const data = query.data;
  const events = (data?.events ?? []).filter(
    (e) =>
      (search.media === "all" || e.media === search.media) &&
      (e.media === "tv" || search.releases.includes(e.releaseType)) &&
      `${e.title} ${e.media === "tv" ? (e.episodeTitle ?? "") : ""}`
        .toLowerCase()
        .includes(search.q.toLowerCase()),
  );
  const visible = events
    .filter((e) => dayOf(e, config.timezone).startsWith(month))
    .sort(
      (a, b) =>
        dayOf(a, config.timezone).localeCompare(dayOf(b, config.timezone)) ||
        (a.media === "tv" ? a.at : a.date).localeCompare(
          b.media === "tv" ? b.at : b.date,
        ) ||
        a.title.localeCompare(b.title),
    );
  const groups = Map.groupBy(visible, (e) => dayOf(e, config.timezone));
  const timezone =
    config.timezone === "UTC"
      ? "UTC"
      : Intl.DateTimeFormat().resolvedOptions().timeZone;
  const relevantSources =
    search.media === "tv"
      ? (["sonarr"] as const)
      : search.media === "movie"
        ? (["radarr"] as const)
        : (["sonarr", "radarr"] as const);
  const outside =
    data &&
    relevantSources.some((source) => {
      const c = data.sources[source].coverage;
      return (
        c &&
        (month + "-01" < c.start ||
          format(endOfMonth(monthDate), "yyyy-MM-dd") > c.end)
      );
    });
  function openEvent(e: CalendarEvent) {
    focusReturn.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setSelected(e);
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#calendar">
        Skip to calendar
      </a>
      <header className="site-header">
        <a href="/" className="brand">
          <span className="brand-mark">{config.brandMark}</span>
          <span>
            {config.title}
            <small>THE RELEASE GUIDE</small>
          </span>
        </a>
        <div className="header-end">
          <span className="read-only">
            <Radio size={13} /> Read-only calendar
          </span>
          {config.requestUrl && (
            <Button asChild variant="outline">
              <a
                href={config.requestUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {config.requestLabel}
                <ArrowUpRight size={15} />
              </a>
            </Button>
          )}
        </div>
      </header>
      <main>
        <section className="intro">
          <div>
            <div className="eyebrow">COMING TO A SCREEN NEAR YOU</div>
            <h1>
              Good things are coming<span>.</span>
            </h1>
            <p>{config.tagline}</p>
          </div>
          <div className="timezone">
            <Clock3 size={15} />
            <span>
              YOUR TIMEZONE<strong>{timezone.replaceAll("_", " ")}</strong>
            </span>
          </div>
        </section>
        <section
          className="calendar-panel"
          id="calendar"
          aria-label="Release calendar"
        >
          <div className="toolbar">
            <div className="segmented" aria-label="Media filter">
              {(["all", "tv", "movie"] as const).map((m, i) => (
                <Button
                  key={m}
                  variant="ghost"
                  aria-pressed={search.media === m}
                  onClick={() => update({ media: m })}
                >
                  {i === 1 ? (
                    <Tv size={15} />
                  ) : i === 2 ? (
                    <Film size={15} />
                  ) : (
                    <CalendarDays size={15} />
                  )}{" "}
                  {["All releases", "TV", "Movies"][i]}
                </Button>
              ))}
            </div>
            <label className="search">
              <SearchIcon size={16} />
              <input
                aria-label="Search titles"
                placeholder="Find your next watch…"
                value={search.q}
                onChange={(e) => update({ q: e.target.value }, true)}
              />
              {search.q && (
                <button
                  aria-label="Clear search"
                  onClick={() => update({ q: "" }, true)}
                >
                  <X size={14} />
                </button>
              )}
            </label>
          </div>
          <div className="calendar-heading">
            <div className="month-title">
              <h2>
                {format(monthDate, "MMMM")}{" "}
                <span>{format(monthDate, "yyyy")}</span>
              </h2>
              <span className="event-count">{visible.length} releases</span>
            </div>
            <div className="navigation">
              <Button
                variant="outline"
                onClick={() => update({ month: today })}
              >
                Today
              </Button>
              <div className="arrows">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Previous month"
                  onClick={() =>
                    update({
                      month: format(addMonths(monthDate, -1), "yyyy-MM"),
                    })
                  }
                >
                  <ChevronLeft size={19} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Next month"
                  onClick={() =>
                    update({
                      month: format(addMonths(monthDate, 1), "yyyy-MM"),
                    })
                  }
                >
                  <ChevronRight size={19} />
                </Button>
              </div>
              <div className="segmented view-switch" aria-label="Calendar view">
                <Button
                  variant="ghost"
                  aria-pressed={view === "month"}
                  onClick={() => update({ view: "month" })}
                >
                  <CalendarDays size={15} />
                  Month
                </Button>
                <Button
                  variant="ghost"
                  aria-pressed={view === "agenda"}
                  onClick={() => update({ view: "agenda" })}
                >
                  <List size={15} />
                  Agenda
                </Button>
              </div>
            </div>
          </div>
          <div className="legend-row">
            <div className="legend">
              <span>
                <i className="dot tv" />
                TV episodes
              </span>
              <span>
                <i className="dot movie" />
                Movie releases
              </span>
            </div>
            <fieldset
              className="release-filters"
              disabled={search.media === "tv"}
            >
              <legend className="sr-only">Movie release types</legend>
              {releaseTypes.map((type) => (
                <label key={type}>
                  <input
                    type="checkbox"
                    checked={search.releases.includes(type)}
                    onChange={() =>
                      update({
                        releases: search.releases.includes(type)
                          ? search.releases.filter((t) => t !== type)
                          : [...search.releases, type],
                      })
                    }
                  />
                  {labels[type]}
                </label>
              ))}
            </fieldset>
          </div>
          {outside && (
            <div className="notice" role="status">
              This month extends beyond the exported coverage. Some dates may
              have no data.
            </div>
          )}
          {query.isError && (
            <div className="notice" role="alert">
              {data
                ? "Refresh failed. Showing the last valid calendar."
                : "Calendar unavailable. The public snapshot could not be loaded."}
              <Button variant="ghost" onClick={() => void query.refetch()}>
                Retry
              </Button>
            </div>
          )}
          {query.isPending ? (
            <div className="loading" role="status">
              Loading releases…
            </div>
          ) : (
            data && (
              <>
                {view === "month" ? (
                  <div className="month-grid">
                    <FullCalendar
                      ref={calendar}
                      plugins={[dayGridPlugin]}
                      initialView="dayGridMonth"
                      initialDate={month + "-01"}
                      headerToolbar={false}
                      height="auto"
                      fixedWeekCount={false}
                      dayMaxEvents={3}
                      moreLinkClick="popover"
                      eventInteractive={true}
                      editable={false}
                      selectable={false}
                      timeZone={config.timezone}
                      events={events.map((e) => ({
                        id: e.id,
                        title: e.title,
                        start: e.media === "tv" ? e.at : e.date,
                        allDay: e.media === "movie",
                        classNames: [e.media],
                        extendedProps: { record: e },
                      }))}
                      eventClick={(info) =>
                        openEvent(
                          info.event.extendedProps.record as CalendarEvent,
                        )
                      }
                      eventContent={(info) => {
                        const e = info.event.extendedProps
                          .record as CalendarEvent;
                        return (
                          <div className="event-content">
                            <span className="event-meta">
                              {e.media === "tv" ? (
                                <Tv size={10} />
                              ) : (
                                <Film size={10} />
                              )}{" "}
                              {e.media === "tv"
                                ? `${timeLabel(e, config)} · ${episodeLabel(e)}`
                                : labels[e.releaseType]}
                            </span>
                            <strong>{e.title}</strong>
                            {e.media === "tv" && e.episodeTitle && (
                              <span className="episode-title">
                                {e.episodeTitle}
                              </span>
                            )}
                          </div>
                        );
                      }}
                    />
                  </div>
                ) : (
                  <div className="agenda">
                    {[...groups].map(([day, list]) => (
                      <section className="agenda-day" key={day}>
                        <div className="agenda-date">
                          <strong>{format(parseISO(day), "dd")}</strong>
                          <span>{format(parseISO(day), "EEE")}</span>
                        </div>
                        <div className="agenda-items">
                          {list.map((e) => (
                            <button
                              key={e.id}
                              className={`agenda-event ${e.media}`}
                              onClick={() => openEvent(e)}
                            >
                              <span className="agenda-icon">
                                {e.media === "tv" ? (
                                  <Tv size={20} />
                                ) : (
                                  <Film size={20} />
                                )}
                              </span>
                              <span className="agenda-title">
                                <strong>{e.title}</strong>
                                <small>
                                  {e.media === "tv"
                                    ? `${episodeLabel(e)}${e.episodeTitle ? " · " + e.episodeTitle : ""}`
                                    : "Movie release"}
                                </small>
                              </span>
                              <span className="release-badge">
                                {labels[e.releaseType]}
                              </span>
                              <span className="event-time">
                                {timeLabel(e, config)}
                              </span>
                              <ChevronRight size={15} />
                            </button>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
                {visible.length === 0 && (
                  <div className="empty">
                    <CalendarDays size={30} />
                    <h3>No releases to show</h3>
                    <p>
                      {outside
                        ? "Choose a month within the export window."
                        : "Try another month, title, or release filter."}
                    </p>
                  </div>
                )}
              </>
            )
          )}
          <footer className="panel-footer">
            <span>Air & release dates · Not library availability</span>
            <span>
              {data
                ? `Export window: ${data.coverage.start} — ${data.coverage.end}`
                : "Waiting for a valid export"}
            </span>
          </footer>
        </section>
        <section className="source-status" aria-label="Source refresh status">
          {(["sonarr", "radarr"] as const).map((source) => {
            const s = data?.sources[source];
            const aged =
              s?.lastSuccess &&
              clock - Date.parse(s.lastSuccess) >
                config.staleAfterMinutes * 60000;
            const health = s
              ? s.health === "healthy" && aged
                ? "stale"
                : s.health
              : "unavailable";
            return (
              <div key={source}>
                <span className={`status-dot ${health}`} />
                <strong>{source === "sonarr" ? "TV" : "Movies"}</strong>
                <span>
                  {health === "healthy"
                    ? "Up to date"
                    : health === "stale"
                      ? "Stale data"
                      : "Unavailable"}
                </span>
                <small>
                  {s?.lastSuccess
                    ? `Last success ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", ...(config.timezone === "UTC" ? { timeZone: "UTC" } : {}) }).format(new Date(s.lastSuccess))}`
                    : "No successful refresh yet"}
                </small>
              </div>
            );
          })}
          <span className="source-note">
            Dates can change. Check back for the latest.
          </span>
        </section>
      </main>
      <footer className="site-footer">
        <span>{config.title}</span>
        <span>A little anticipation goes a long way.</span>
      </footer>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        {selected && (
          <DialogContent onClose={() => focusReturn.current?.focus()}>
            <div className={`detail-icon ${selected.media}`}>
              {selected.media === "tv" ? <Tv size={26} /> : <Film size={26} />}
            </div>
            <span className={`detail-type ${selected.media}`}>
              {labels[selected.releaseType]}
            </span>
            <DialogTitle>{selected.title}</DialogTitle>
            <DialogDescription>
              {selected.media === "tv"
                ? `${episodeLabel(selected)}${selected.episodeTitle ? " · " + selected.episodeTitle : ""}`
                : "An upcoming movie release."}
            </DialogDescription>
            <div className="detail-date">
              <CalendarDays size={18} />
              <span>
                {format(
                  parseISO(dayOf(selected, config.timezone)),
                  "EEEE, MMMM d, yyyy",
                )}
                <small>
                  {selected.media === "tv"
                    ? `${timeLabel(selected, config)} · ${timezone}`
                    : "Calendar date · No timezone conversion"}
                </small>
              </span>
            </div>
            <p className="detail-note">
              This is an {selected.media === "tv" ? "air" : "announced release"}{" "}
              date, not a confirmation of availability in your library.
            </p>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
