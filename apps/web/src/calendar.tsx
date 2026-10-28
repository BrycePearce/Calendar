import { DensitySelect } from "./density-select";
import { useDensityPreference } from "./density-preference";
import { CalendarSearch } from "./calendar-search";
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
import { createIsomorphicFn } from "@tanstack/react-start";
import {
  addDays,
  addMonths,
  endOfMonth,
  startOfWeek,
  format,
  parseISO,
} from "date-fns";
import {
  resolveView,
  readViewPreference,
  saveViewPreference,
  useViewPreference,
  type CalendarView,
} from "./view-preference";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Film,
  List,
  Tv,
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

// Discover the grid chunk as soon as the route module runs, before hydration.
// Keep agenda-only visits from downloading FullCalendar.
const preloadInitialView = createIsomorphicFn().client(() => {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");
  const search = {
    view:
      view === "month" || view === "monthly" || view === "agenda"
        ? view
        : undefined,
    week: params.get("week") ?? undefined,
    month: params.get("month") ?? undefined,
  } satisfies Partial<Search>;
  if (resolveView(search, readViewPreference()) !== "agenda")
    void loadMonthCalendar().catch(() => {});
});
preloadInitialView();

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
  const preferred = useViewPreference();
  const activeView = resolveView(search, preferred);
  useEffect(() => {
    if (preferred !== undefined && activeView !== "agenda")
      void loadMonthCalendar().catch(() => {});
  }, [activeView, preferred]);
  const configQuery = useQuery({
    queryKey: ["config"],
    queryFn: async () => publicConfigSchema.parse(await json("/config.json")),
  });
  const query = useCalendarQuery();
  if (configQuery.isPending || preferred === undefined)
    return <CalendarSkeleton />;
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
  const updateSearch = useCallback(
    (q: string) => {
      void navigate({
        search: (prev) => ({ ...prev, q }),
        replace: true,
        resetScroll: false,
      });
    },
    [navigate],
  );
  const density = useDensityPreference();
  const preferred = useViewPreference();
  const view = resolveView(search, preferred);
  const initialView = preferred === "month" ? "month" : undefined;
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
  const today = format(
    startOfWeek(parseISO(todayDate), { weekStartsOn: 0 }),
    "yyyy-MM-dd",
  );
  const monthKey = search.month ?? todayDate.slice(0, 7);
  const week =
    view === "monthly"
      ? monthKey + "-01"
      : format(
          startOfWeek(
            parseISO(
              search.week ?? (search.month ? search.month + "-01" : today),
            ),
            { weekStartsOn: 0 },
          ),
          "yyyy-MM-dd",
        );
  const gridEnd = format(
    view === "monthly"
      ? endOfMonth(parseISO(week))
      : addDays(parseISO(week), 34),
    "yyyy-MM-dd",
  );
  const update = (patch: Partial<Search>, replace = false) =>
    void navigate({
      search: (prev) => {
        const next = { ...prev, ...patch };
        const nextView = next.view ?? view;
        return {
          ...next,
          month: nextView === "monthly" ? (next.month ?? monthKey) : undefined,
          week:
            nextView === "monthly"
              ? undefined
              : (next.week ?? week) === today
                ? undefined
                : (next.week ?? week),
          view: next.view === initialView ? undefined : next.view,
        };
      },
      replace,
      resetScroll: false,
    });
  useEffect(() => {
    const normalized = {
      ...search,
      month: view === "monthly" ? monthKey : undefined,
      week: view === "monthly" ? undefined : week === today ? undefined : week,
      view:
        view === "month"
          ? search.view === initialView
            ? undefined
            : search.view
          : view,
    };
    if (window.location.search !== stringifyCalendarSearch(normalized)) {
      void navigate({ search: normalized, replace: true, resetScroll: false });
    }
  }, [search, today, week, monthKey, view, initialView, navigate]);
  function selectView(nextView: CalendarView) {
    saveViewPreference(nextView);
    void navigate({
      search: (prev) => ({
        ...prev,
        view: nextView,
        week: undefined,
        month: undefined,
      }),
      resetScroll: false,
    });
    setPastDays(0);
    setFutureDays(30);
  }
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
    if (view === "agenda" || !monthReady) return;
    if (!data || handledScrollRequest.current === todayScrollRequest) return;
    // Leave explicit month links and restored scroll positions alone on load.
    if (
      view === "monthly" ? monthKey !== todayDate.slice(0, 7) : week !== today
    ) {
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
        content.current?.querySelector<HTMLElement>(".fc-day-today");
      if (!target) return;
      const bounds = target.getBoundingClientRect();
      // Show the date and the start of its releases, even for a very tall day.
      const visibleHeight = Math.min(bounds.height, 160);
      const topInset = window.innerWidth > 700 ? 64 : 16;
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
  }, [
    data,
    week,
    monthKey,
    today,
    todayDate,
    todayScrollRequest,
    view,
    monthReady,
  ]);
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
          return view !== "agenda"
            ? day >= week && day <= gridEnd
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
    [events, dates, view, week, gridEnd, rangeStart, rangeEnd],
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
    view !== "agenda" &&
    data &&
    relevantSources.some((source) => {
      const c = data.sources[source].coverage;
      return c && (week < c.start || gridEnd > c.end);
    });
  const openEvent = useCallback((e: CalendarEvent) => {
    focusReturn.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setSelected(e);
  }, []);
  return (
    <div
      className={`app-shell${view !== "agenda" ? (density === "compact" ? " month-shell" : density === "expanded" ? " expanded-shell" : " standard-shell") : ""}`}
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
            <CalendarSearch value={search.q} onChange={updateSearch} />
          </div>
          <div className="calendar-heading">
            <div className="calendar-period">
              <div className="month-title">
                <h2 aria-live="polite" aria-atomic="true">
                  {view === "agenda"
                    ? "Upcoming"
                    : week.slice(0, 7) === gridEnd.slice(0, 7)
                      ? format(parseISO(week), "MMMM yyyy")
                      : `${format(parseISO(week), week.slice(0, 4) === gridEnd.slice(0, 4) ? "MMMM" : "MMMM yyyy")}–${format(parseISO(gridEnd), "MMMM yyyy")}`}
                </h2>
                <span className="event-count">{visible.length} releases</span>
              </div>
              {view !== "agenda" && (
                <p className="calendar-range">
                  {format(parseISO(week), "MMM d")} –{" "}
                  {format(parseISO(gridEnd), "MMM d, yyyy")}
                </p>
              )}
            </div>
            <div className="navigation">
              {view !== "agenda" && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      update(
                        view === "monthly"
                          ? { month: todayDate.slice(0, 7) }
                          : { week: today },
                      );
                      setTodayScrollRequest((request) => request + 1);
                    }}
                  >
                    Today
                  </Button>
                  <div className="arrows">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={
                        view === "monthly" ? "Previous month" : "Previous week"
                      }

                      onClick={() =>
                        update(
                          view === "monthly"
                            ? {
                                month: format(
                                  addMonths(parseISO(week), -1),
                                  "yyyy-MM",
                                ),
                              }
                            : {
                                week: format(
                                  addDays(parseISO(week), -7),
                                  "yyyy-MM-dd",
                                ),
                              },
                        )
                      }
                    >
                      <ChevronLeft size={19} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={
                        view === "monthly" ? "Next month" : "Next week"
                      }

                      onClick={() =>
                        update(
                          view === "monthly"
                            ? {
                                month: format(
                                  addMonths(parseISO(week), 1),
                                  "yyyy-MM",
                                ),
                              }
                            : {
                                week: format(
                                  addDays(parseISO(week), 7),
                                  "yyyy-MM-dd",
                                ),
                              },
                        )
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
                  onClick={() => selectView("agenda")}
                >
                  <List size={15} />
                  Upcoming
                </Button>
                <Button
                  variant="ghost"
                  aria-pressed={view === "month"}
                  onClick={() => selectView("month")}
                >
                  <CalendarDays size={15} />
                  Calendar
                </Button>
                <Button
                  variant="ghost"
                  aria-pressed={view === "monthly"}
                  onClick={() => selectView("monthly")}
                >
                  <CalendarDays size={15} /> Month
                </Button>
              </div>
              {view !== "agenda" && <DensitySelect value={density} />}
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
              This range extends beyond the exported coverage. Some dates may
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
                {view !== "agenda" ? (
                  <div className="month-grid">
                    <MonthCalendar
                      week={week}
                      density={density}
                      standardMonth={view === "monthly"}
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
                {visible.length === 0 && view !== "agenda" && (
                  <div className="empty">
                    <CalendarDays size={30} />
                    <h3>No releases to show</h3>
                    <p>
                      {outside
                        ? "Choose dates within the export window."
                        : "Try another date range, title, or release filter."}
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
