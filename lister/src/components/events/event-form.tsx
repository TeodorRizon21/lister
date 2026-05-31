"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import type { EventFormState } from "@/features/events/actions";

type FormValues = {
  eventId?: string;
  title?: string;
  description?: string | null;
  location?: string | null;
  startDate?: Date;
  endDate?: Date;
};

function toDateTimeInputValue(date?: Date) {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function EventForm({
  title,
  submitLabel,
  action,
  defaults,
}: {
  title: string;
  submitLabel: string;
  action: (
    state: EventFormState | undefined,
    formData: FormData,
  ) => Promise<EventFormState | undefined>;
  defaults?: FormValues;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <Card className="max-w-3xl">
      <h2 className="text-base font-semibold">{title}</h2>

      <form action={formAction} className="mt-4 flex flex-col gap-4">
        {defaults?.eventId ? (
          <input type="hidden" name="eventId" value={defaults.eventId} />
        ) : null}

        <label className="flex flex-col gap-1 text-sm">
          Titlu
          <Input
            name="title"
            required
            minLength={3}
            defaultValue={defaults?.title ?? ""}
            placeholder="Ex: Olimpiada Nationala 2026"
          />
          {state?.fieldErrors?.title ? (
            <span className="text-xs text-destructive">{state.fieldErrors.title}</span>
          ) : null}
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Locatie
          <Input
            name="location"
            defaultValue={defaults?.location ?? ""}
            placeholder="Sala Polivalenta"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Descriere
          <textarea
            name="description"
            defaultValue={defaults?.description ?? ""}
            rows={4}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent"
            placeholder="Detalii eveniment"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            Data start
            <Input
              name="startDate"
              type="datetime-local"
              required
              defaultValue={toDateTimeInputValue(defaults?.startDate)}
            />
            {state?.fieldErrors?.startDate ? (
              <span className="text-xs text-destructive">
                {state.fieldErrors.startDate}
              </span>
            ) : null}
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Data final
            <Input
              name="endDate"
              type="datetime-local"
              required
              defaultValue={toDateTimeInputValue(defaults?.endDate)}
            />
            {state?.fieldErrors?.endDate ? (
              <span className="text-xs text-destructive">{state.fieldErrors.endDate}</span>
            ) : null}
          </label>
        </div>

        {state?.error ? (
          <p className="text-sm text-destructive" role="alert">
            {state.error}
          </p>
        ) : null}

        {!defaults?.eventId ? (
          <label className="flex flex-col gap-1 text-sm">
            Parolă înscriere online (opțional)
            <Input
              type="password"
              name="registrationPassword"
              autoComplete="new-password"
              placeholder="Minim 4 caractere — pentru linkul public /e/..."
            />
            <span className="text-xs text-muted">
              Poți seta sau schimba parola și mai târziu din pagina evenimentului.
            </span>
          </label>
        ) : null}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Se salveaza..." : submitLabel}
          </Button>
        </div>
      </form>
    </Card>
  );
}
