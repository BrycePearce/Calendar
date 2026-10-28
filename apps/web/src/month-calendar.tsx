import { useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import { Film, Tv } from "lucide-react";
import type { CalendarEvent, PublicConfig } from "@calendar/schema";
import { episodeLabel } from "./lib";
import { labels, timeLabel } from "./event-format";
export default function MonthCalendar({
  week,
  standardMonth = false,
  events,
  config,
  openEvent,
  onReady,
}: {
  week: string;
  standardMonth?: boolean;
  events: CalendarEvent[];
  config: PublicConfig;
  openEvent: (event: CalendarEvent) => void;
  onReady: () => void;
}) {
  const calendar = useRef<FullCalendar>(null);
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === "undefined" ? 900 : window.innerHeight,
  );
  const [fitScreen, setFitScreen] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 951px) and (min-height: 700px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia(
      "(min-width: 951px) and (min-height: 700px)",
    );
    const update = () => {
      setFitScreen(media.matches);
      setViewportHeight(window.innerHeight);
    };
    media.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  useEffect(() => {
    calendar.current
      ?.getApi()
      .changeView(standardMonth ? "dayGridMonth" : "rolling", week);
    onReady();
  }, [week, standardMonth, onReady]);
  const calendarEvents = useMemo(
    () =>
      events.map((e) => ({
        id: e.id,
        title: e.title,
        start: e.media === "tv" ? e.at : e.date,
        allDay: e.media === "movie",
        classNames: [e.media],
        extendedProps: { record: e },
      })),
    [events],
  );
  // Reserve room for controls, date labels and overflow links. Explicit limits
  // avoid FullCalendar hiding all detailed cards on otherwise roomy desktops.
  const cardLimit = Math.max(
    1,
    Math.floor(
      ((viewportHeight - 380) / (standardMonth ? 6 : 5) - 54) /
        (viewportHeight >= 1050 ? 50 : 34),
    ),
  );
  return (
    <FullCalendar
      ref={calendar}
      plugins={[dayGridPlugin]}
      initialView={standardMonth ? "dayGridMonth" : "rolling"}
      views={{
        rolling: {
          type: "dayGrid",
          duration: { weeks: 5 },
          dateAlignment: "week",
        },
      }}
      firstDay={0}
      initialDate={week}
      headerToolbar={false}
      height={fitScreen ? "100%" : "auto"}
      expandRows={fitScreen}
      stickyHeaderDates={true}
      fixedWeekCount={false}
      dayMaxEvents={fitScreen ? (viewportHeight < 850 ? true : cardLimit) : 3}
      eventOrderStrict={true}
      moreLinkClick="popover"
      eventInteractive={true}
      editable={false}
      selectable={false}
      timeZone={config.timezone}
      dayCellContent={(info) => (
        <>
          <span
            className={info.isToday ? "today-number" : undefined}
            aria-current={info.isToday ? "date" : undefined}
          >
            {info.dayNumberText}
          </span>
          {info.isToday && <span className="today-label">Today</span>}
        </>
      )}
      events={calendarEvents}
      eventClick={(info) =>
        openEvent(info.event.extendedProps.record as CalendarEvent)
      }
      eventContent={(info) => {
        const e = info.event.extendedProps.record as CalendarEvent;
        return (
          <div className="event-content">
            <span className="event-meta">
              {e.media === "tv" ? <Tv size={10} /> : <Film size={10} />}{" "}
              {e.media === "tv"
                ? `${timeLabel(e, config)} · ${episodeLabel(e)}`
                : labels[e.releaseType]}
            </span>
            <strong>{e.title}</strong>
            {e.media === "tv" && e.episodeTitle && (
              <span className="episode-title">{e.episodeTitle}</span>
            )}
          </div>
        );
      }}
    />
  );
}
