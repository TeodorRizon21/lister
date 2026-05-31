"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  updateEventRegistrationAction,
  type EventRegistrationSettingsState,
} from "@/features/events/registration-actions";

export function EventRegistrationSettings({
  eventId,
  slug,
  registrationOpen,
  hasPassword,
  publicUrl,
}: {
  eventId: string;
  slug: string;
  registrationOpen: boolean;
  hasPassword: boolean;
  publicUrl: string;
}) {
  const [state, action, pending] = useActionState(
    updateEventRegistrationAction,
    undefined as EventRegistrationSettingsState | undefined,
  );

  const displayUrl = state?.registrationUrl ?? publicUrl;

  return (
    <Card>
      <h2 className="text-base font-semibold">Înscriere participanți (link public)</h2>
      <p className="mt-2 text-sm text-muted">
        Distribuie linkul de mai jos. Participanții introduc parola evenimentului, apoi
        completează formularul. Fără duplicate (nume + prenume + clasă/grupă).
      </p>

      <div className="mt-4 rounded-lg border border-border bg-background/70 p-3">
        <p className="text-xs font-medium text-muted">Link înscriere</p>
        <code className="mt-1 block break-all text-sm text-foreground">{displayUrl}</code>
        <p className="mt-2 text-xs text-muted">
          Slug: <span className="text-foreground">{slug}</span>
          {hasPassword ? " · parolă setată" : " · parolă nesetată"}
        </p>
      </div>

      <form action={action} className="mt-4 flex flex-col gap-4">
        <input type="hidden" name="eventId" value={eventId} />

        <label className="flex flex-col gap-1 text-sm font-medium">
          Parolă acces formular
          <Input
            type="password"
            name="registrationPassword"
            autoComplete="new-password"
            placeholder={
              hasPassword
                ? "Lasă gol pentru a păstra parola curentă"
                : "Minim 4 caractere (obligatoriu prima dată)"
            }
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="registrationOpen"
            defaultChecked={registrationOpen}
            className="size-4"
          />
          Înscrieri deschise
        </label>

        {state?.error ? (
          <p className="text-sm text-destructive" role="alert">
            {state.error}
          </p>
        ) : null}
        {state?.success ? (
          <p className="text-sm text-foreground" role="status">
            {state.success}
          </p>
        ) : null}

        <Button type="submit" disabled={pending}>
          {pending ? "Se salvează…" : "Salvează setări înscriere"}
        </Button>
      </form>
    </Card>
  );
}
