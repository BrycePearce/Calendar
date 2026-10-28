import type { Density } from "./density-preference";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import type {
  DayCellContentArg,
  EventClickArg,
  EventContentArg,
} from "@fullcalendar/core";
import type { PublicConfig } from "@calendar/schema";
import {
  type DisplayEvent,
  groupedEpisodeLabel,
  groupedEpisodeTitle,
} from "./episode-groups";
import { labels, timeLabel } from "./event-format";
const plugins = [dayGridPlugin];
const views = {
  rolling: { type: "dayGrid", duration: { weeks: 5 }, dateAlignment: "week" },
};
function renderDay(info: DayCellContentArg) {
  const number = document.createElement("span");
  number.textContent = info.dayNumberText;
  if (!info.isToday) return { domNodes: [number] };
  number.className = "today-number";
  number.setAttribute("aria-current", "date");
  const label = document.createElement("span");
  label.className = "today-label";
  label.textContent = "Today";
  return { domNodes: [number, label] };
}
export default memo(function MonthCalendar({
  week,
  standardMonth = false,
  density = "standard",
  events,
  config,
  openEvent,
  onReady,
}: {
  week: string;
  standardMonth?: boolean;
  density?: Density;
  events: DisplayEvent[];
  config: PublicConfig;
  openEvent: (event: DisplayEvent) => void;
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
    const api = calendar.current?.getApi();
    const view = standardMonth ? "dayGridMonth" : "rolling";
    if (
      api &&
      (api.view.type !== view ||
        api.getDate().toISOString().slice(0, 10) !== week)
    ) {
      api.changeView(view, week);
    }
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
  // Native event nodes avoid a React portal per release during FullCalendar's
  // synchronous height/overflow recalculations. textContent keeps titles inert.
  const renderEvent = useCallback(
    (info: EventContentArg) => {
      const event = info.event.extendedProps.record as DisplayEvent;
      const card = document.createElement("div");
      card.className = "event-content";
      const meta = document.createElement("span");
      meta.className = "event-meta";
      meta.textContent =
        event.media === "tv"
          ? `${timeLabel(event, config)} · ${groupedEpisodeLabel(event)}`
          : labels[event.releaseType];
      const title = document.createElement("strong");
      const icon = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      for (const [name, value] of Object.entries({
        width: "10",
        height: "10",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "2",
        "aria-hidden": "true",
      }))
        icon.setAttribute(name, value);
      // Static icon paths only; event data is assigned through textContent.
      icon.innerHTML =
        event.media === "tv"
          ? '<path d="m17 2-5 5-5-5"/><rect width="20" height="15" x="2" y="7" rx="2"/>'
          : '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18M17 3v18M3 12h18M3 7.5h4M3 16.5h4M17 7.5h4M17 16.5h4"/>';
      meta.prepend(icon);
      title.textContent = event.title;
      card.append(meta, title);
      if (event.media === "tv" && groupedEpisodeTitle(event)) {
        const episode = document.createElement("span");
        episode.className = "episode-title";
        episode.textContent = groupedEpisodeTitle(event) ?? "";
        card.append(episode);
      }
      return { domNodes: [card] };
    },
    [config],
  );
  const handleEventClick = useCallback(
    (info: EventClickArg) =>
      openEvent(info.event.extendedProps.record as DisplayEvent),
    [openEvent],
  );
  return (
    <FullCalendar
      ref={calendar}
      plugins={plugins}
      initialView={standardMonth ? "dayGridMonth" : "rolling"}
      views={views}
      firstDay={0}
      initialDate={week}
      headerToolbar={false}
      height={density === "compact" && fitScreen ? "100%" : "auto"}
      expandRows={density === "compact" && fitScreen}
      stickyHeaderDates={true}
      fixedWeekCount={false}
      dayMaxEvents={
        density === "compact"
          ? fitScreen
            ? viewportHeight < 850
              ? true
              : cardLimit
            : 3
          : density === "standard"
            ? 3
            : false
      }
      eventOrderStrict={true}
      moreLinkClick="popover"
      eventInteractive={true}
      editable={false}
      selectable={false}
      timeZone={config.timezone}
      dayCellContent={renderDay}
      events={calendarEvents}
      eventClick={handleEventClick}
      eventContent={renderEvent}
    />
  );
});
