import { createFileRoute } from "@tanstack/react-router";
import { searchSchema } from "@calendar/schema";
import { CalendarApp } from "../calendar";
export const Route = createFileRoute("/")({
  validateSearch: (input) => searchSchema.parse(input),
  component: CalendarApp,
});
