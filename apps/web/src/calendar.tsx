import { labels, timeLabel } from "./event-format";
import { CalendarSkeleton, ReleaseSkeleton } from "./loading";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, addMonths, format, parseISO, endOfMonth } from "date-fns";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Film,
  List,
  Search as SearchIcon,
  Tv,
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
import { stringifyCalendarSearch } from "./search";

const loadMonthCalendar = () => import("./month-calendar");
const MonthCalendar = lazy(loadMonthCalendar);

async function json(path: string) {
  const response = await fetch(path, {
    cache: "default",
    credentials: "omit",
  });
  if (!response.ok) throw new Error("Calendar unavailable");
  return response.json() as Promise<unknown>;
}
function useCalendarQuery() {
  return useQuery({
    queryKey: ["calendar"],
    queryFn: async () =>
      snapshotSchema.parse(await json("/data/calendar.json")),
  });
}
export function CalendarApp() {
  const search = Route.useSearch();
  useEffect(() => {
    if (search.view === "month") void loadMonthCalendar().catch(() => {});
  }, [search.view]);
  const configQuery = useQuery({
    queryKey: ["config"],
    queryFn: async () => publicConfigSchema.parse(await json("/config.json")),
  });
  const query = useCalendarQuery();
  if (configQuery.isPending) return <CalendarSkeleton />;
  if (!configQuery.data)
    return (
      <main className="loading load-error">
        <h1>Calendar unavailable</h1>
        <p>Public configuration could not be loaded.</p>
        <Button onClick={() => void configQuery.refetch()}>Try again</Button>
      </main>
    );
  if (query.isPending) return <CalendarSkeleton />;
  return (
    <Suspense fallback={<CalendarSkeleton />}>
      <CalendarContent config={configQuery.data} query={query} />
    </Suspense>
  );
}
function CalendarContent({
  config,
  query,
}: {
  config: PublicConfig;
  query: ReturnType<typeof useCalendarQuery>;
}) {
  const search = Route.useSearch(),
    navigate = Route.useNavigate();
  const initialView = "agenda";
  const [futureDays, setFutureDays] = useState(30);
  const [pastDays, setPastDays] = useState(0);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const focusReturn = useRef<HTMLElement | null>(null);
  const [monthReady, setMonthReady] = useState(false);
  const onMonthReady = useCallback(() => setMonthReady(true), []);
  const content = useRef<HTMLDivElement>(null);
  const [todayScrollRequest, setTodayScrollRequest] = useState(0);
  const handledScrollRequest = useRef(0);
  const todayDate =
    config.timezone === "UTC"
      ? new Date(clock).toISOString().slice(0, 10)
      : format(new Date(clock), "yyyy-MM-dd");
  const today = todayDate.slice(0, 7),
    month = search.month ?? today,
    view = search.view ?? initialView;
  const monthDate = parseISO(month + "-01");
  const update = (patch: Partial<Search>, replace = false) =>
    void navigate({
      search: (prev) => {
        const next = { ...prev, ...patch };
        return {
          ...next,
          month: next.month === today ? undefined : next.month,
          view: next.view === initialView ? undefined : next.view,
        };
      },
      replace,
      resetScroll: false,
    });
  useEffect(() => {
    const normalized = {
      ...search,
      month: search.month === today ? undefined : search.month,
      view: search.view === initialView ? undefined : search.view,
    };
    if (window.location.search !== stringifyCalendarSearch(normalized)) {
      void navigate({ search: normalized, replace: true, resetScroll: false });
    }
  }, [search, today, initialView, navigate]);
  useEffect(() => {
    document.title = config.title;
  }, [config.title]);

  const data = query.data;
  const rangeStart = format(
    addDays(parseISO(todayDate), -pastDays),
    "yyyy-MM-dd",
  );
  const rangeEnd = format(
    addDays(parseISO(todayDate), futureDays - 1),
    "yyyy-MM-dd",
  );
  const tomorrow = format(addDays(parseISO(todayDate), 1), "yyyy-MM-dd");
  useEffect(() => {
    if (view !== "month" || !monthReady) return;
    if (!data || handledScrollRequest.current === todayScrollRequest) return;
    // Leave explicit month links and restored scroll positions alone on load.
    if (month !== today) {
      if (todayScrollRequest === 0)
        handledScrollRequest.current = todayScrollRequest;
      return;
    }
    if (
      todayScrollRequest === 0 &&
      (window.scrollY > 0 || window.location.hash)
    ) {
      handledScrollRequest.current = todayScrollRequest;
      return;
    }
    const frame = requestAnimationFrame(() => {
      handledScrollRequest.current = todayScrollRequest;
      const target =
        view === "month"
          ? content.current?.querySelector<HTMLElement>(".fc-day-today")
          : content.current?.querySelector<HTMLElement>(
              `[data-day="${todayDate}"]`,
            );
      if (!target) return;
      const bounds = target.getBoundingClientRect();
      // Show the date and the start of its releases, even for a very tall day.
      const visibleHeight = Math.min(bounds.height, 160);
      const topInset = view === "month" && window.innerWidth > 700 ? 64 : 16;
      if (
        bounds.top < topInset ||
        bounds.top + visibleHeight > window.innerHeight - 16
      ) {
        target.scrollIntoView({
          block: "start",
          inline: "nearest",
          behavior: "instant",
        });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [data, month, today, todayDate, todayScrollRequest, view, monthReady]);
  const dates = useMemo(
    () =>
      new Map(
        (data?.events ?? []).map((event) => [
          event.id,
          dayOf(event, config.timezone),
        ]),
      ),
    [data, config.timezone],
  );
  const events = useMemo(() => {
    const text = search.q.toLowerCase();
    return (data?.events ?? []).filter(
      (e) =>
        (search.media === "all" || e.media === search.media) &&
        (e.media === "tv" || search.releases.includes(e.releaseType)) &&
        `${e.title} ${e.media === "tv" ? (e.episodeTitle ?? "") : ""}`
          .toLowerCase()
          .includes(text),
    );
  }, [data, search.media, search.releases, search.q]);
  const visible = useMemo(
    () =>
      events
        .filter((e) => {
          const day = dates.get(e.id)!;
          return view === "month"
            ? day.startsWith(month)
            : day >= rangeStart && day <= rangeEnd;
        })
        .sort(
          (a, b) =>
            dates.get(a.id)!.localeCompare(dates.get(b.id)!) ||
            (a.media === "tv" ? a.at : a.date).localeCompare(
              b.media === "tv" ? b.at : b.date,
            ) ||
            a.title.localeCompare(b.title),
        ),
    [events, dates, view, month, rangeStart, rangeEnd],
  );
  const groups = Map.groupBy(visible, (e) => dates.get(e.id)!);
  if (view === "agenda" && !groups.has(todayDate)) groups.set(todayDate, []);
  const orderedGroups = [...groups].sort(([a], [b]) => a.localeCompare(b));
  const canShowEarlier = !!data && rangeStart > data.coverage.start;
  const canShowMore = !!data && rangeEnd < data.coverage.end;
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
    view === "month" &&
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
    <div
      className={`app-shell${view === "month" ? " month-shell" : ""}`}
      ref={content}
    >
      <a className="skip-link" href="#calendar">
        Skip to calendar
      </a>
      <main>
        <h1 className="sr-only">{config.title}</h1>
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
              <h2 aria-live="polite" aria-atomic="true">
                {view === "month" ? (
                  <>
                    {format(monthDate, "MMMM")}{" "}
                    <span>{format(monthDate, "yyyy")}</span>
                  </>
                ) : (
                  "Upcoming"
                )}
              </h2>
              <span className="event-count">{visible.length} releases</span>
            </div>
            <div className="navigation">
              {view === "month" && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      update({ month: today });
                      setTodayScrollRequest((request) => request + 1);
                    }}
                  >
                    Today
                  </Button>
                  <div className="arrows">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Previous month"
                      title={format(addMonths(monthDate, -1), "MMMM yyyy")}
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
                      title={format(addMonths(monthDate, 1), "MMMM yyyy")}
                      onClick={() =>
                        update({
                          month: format(addMonths(monthDate, 1), "yyyy-MM"),
                        })
                      }
                    >
                      <ChevronRight size={19} />
                    </Button>
                  </div>
                </>
              )}
              <div className="segmented view-switch" aria-label="Calendar view">
                <Button
                  variant="ghost"
                  aria-pressed={view === "agenda"}
                  onClick={() => {
                    update({ view: "agenda", month: undefined });
                    setPastDays(0);
                    setFutureDays(30);
                  }}
                >
                  <List size={15} />
                  Upcoming
                </Button>
                <Button
                  variant="ghost"
                  aria-pressed={view === "month"}
                  onClick={() => update({ view: "month" })}
                >
                  <CalendarDays size={15} />
                  Month
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
            <ReleaseSkeleton />
          ) : (
            data && (
              <>
                {view === "month" ? (
                  <div className="month-grid">
                    <MonthCalendar
                      month={month}
                      events={events}
                      config={config}
                      openEvent={openEvent}
                      onReady={onMonthReady}
                    />
                  </div>
                ) : (
                  <div className="agenda">
                    <div className="feed-navigation">
                      <Button
                        variant="ghost"
                        disabled={!canShowEarlier}
                        onClick={() => setPastDays((days) => days + 30)}
                      >
                        View earlier releases
                      </Button>
                      {pastDays > 0 && (
                        <Button variant="ghost" onClick={() => setPastDays(0)}>
                          Back to upcoming
                        </Button>
                      )}
                      <span>
                        {format(parseISO(rangeStart), "MMM d, yyyy")} –{" "}
                        {format(parseISO(rangeEnd), "MMM d, yyyy")}
                      </span>
                    </div>
                    {orderedGroups.map(([day, list]) => (
                      <section className="agenda-day" key={day} data-day={day}>
                        <div className="agenda-date">
                          <strong
                            className={
                              day === todayDate ? "today-number" : undefined
                            }
                            aria-current={
                              day === todayDate ? "date" : undefined
                            }
                          >
                            {format(parseISO(day), "dd")}
                          </strong>
                          <span>{format(parseISO(day), "EEE")}</span>
                          <span className="agenda-month">
                            {format(parseISO(day), "MMM")}
                          </span>
                          {day === todayDate && (
                            <span className="today-label">Today</span>
                          )}
                        </div>
                        <div className="agenda-items">
                          <h3 className="agenda-group-heading">
                            {day === todayDate
                              ? "Today"
                              : day === tomorrow
                                ? "Tomorrow"
                                : format(parseISO(day), "EEEE, MMMM d, yyyy")}
                          </h3>
                          {list.length === 0 && (
                            <p className="day-empty">
                              {search.q ||
                              search.media !== "all" ||
                              search.releases.length !== 3
                                ? "No matching releases today."
                                : "No releases today."}
                            </p>
                          )}
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
                    <div className="feed-more">
                      {canShowMore ? (
                        <Button
                          variant="outline"
                          onClick={() => setFutureDays((days) => days + 30)}
                        >
                          Show more
                        </Button>
                      ) : (
                        <p>
                          You're caught up with the available release schedule.
                        </p>
                      )}
                      <small>
                        Dates available through{" "}
                        {format(parseISO(data.coverage.end), "MMMM d, yyyy")}
                      </small>
                    </div>
                  </div>
                )}
                {visible.length === 0 && view === "month" && (
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
            <span>Timezone: {timezone.replaceAll("_", " ")}</span>
            <span>Air & release dates · Not library availability</span>
            <span>
              {data
                ? `Export window: ${data.coverage.start} — ${data.coverage.end}`
                : "Waiting for a valid export"}
            </span>
            {config.requestUrl && (
              <a
                className="footer-request"
                href={config.requestUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {config.requestLabel}
                <ArrowUpRight size={14} />
              </a>
            )}
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
