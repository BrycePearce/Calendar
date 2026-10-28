import { useDensityPreference } from "./density-preference";
import { useRouterState } from "@tanstack/react-router";
import { resolveView, useViewPreference } from "./view-preference";

export function ReleaseSkeleton() {
  return (
    <div
      className="release-skeleton"
      role="status"
      aria-label="Loading releases"
      aria-busy="true"
    >
      <div aria-hidden="true">
        {[0, 1, 2].map((day) => (
          <div className="skeleton-day" key={day}>
            <div className="skeleton-date skeleton-block" />
            <div className="skeleton-items">
              <div className="skeleton-label skeleton-block" />
              <div className="skeleton-card skeleton-block" />
              <div className="skeleton-card skeleton-block" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CalendarSkeleton() {
  const search = useRouterState({ select: (state) => state.location.search });
  const preferred = useViewPreference();
  const density = useDensityPreference();
  const month = resolveView(search, preferred) !== "agenda";
  return (
    <main
      className={`app-shell${month ? (density === "compact" ? " month-shell" : density === "expanded" ? " expanded-shell" : " standard-shell") : ""}`}
      aria-label="Release calendar"
    >
      <div className="calendar-panel">
        <div className="toolbar" aria-hidden="true">
          <div className="skeleton-block skeleton-filters" />
          <div className="skeleton-block skeleton-search" />
        </div>
        <div className="calendar-heading" aria-hidden="true">
          <div className="skeleton-block skeleton-title" />
          <div className="skeleton-block skeleton-switch" />
        </div>
        <div className="legend-row" aria-hidden="true">
          <div className="skeleton-block skeleton-legend" />
          <div className="skeleton-block skeleton-legend" />
        </div>
        {month ? (
          <div
            className="month-skeleton"
            role="status"
            aria-label="Loading releases"
            aria-busy="true"
          >
            <div className="skeleton-weekdays" aria-hidden="true">
              {Array.from({ length: 7 }, (_, i) => (
                <div key={i}>
                  <span className="skeleton-block" />
                </div>
              ))}
            </div>
            <div className="skeleton-month-grid" aria-hidden="true">
              {Array.from({ length: 35 }, (_, i) => (
                <div key={i}>
                  <span className="skeleton-block" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <ReleaseSkeleton />
        )}
        <div className="panel-footer skeleton-footer" aria-hidden="true">
          <span className="skeleton-block" />
          <span className="skeleton-block" />
          <span className="skeleton-block" />
        </div>
      </div>
      <div className="source-status skeleton-sources" aria-hidden="true">
        <span className="skeleton-block" />
        <span className="skeleton-block" />
      </div>
    </main>
  );
}
