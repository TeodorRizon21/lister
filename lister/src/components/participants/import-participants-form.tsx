"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  importParticipantsAction,
  type ImportParticipantsState,
} from "@/features/participants/import-actions";

export function ImportParticipantsForm({ eventId }: { eventId: string }) {
  const initial: ImportParticipantsState = { status: "idle" };
  const [state, action, pending] = useActionState(importParticipantsAction, initial);
  const lastToastKey = useRef<string | null>(null);

  useEffect(() => {
    if (state?.status !== "success") return;
    const key = `${state.created}|${state.skippedDuplicates}|${state.invalidCount}|${state.totalParsedRows}`;
    if (lastToastKey.current === key) return;
    lastToastKey.current = key;
    toast.success(
      `Import finalizat: ${state.created} creați, ${state.skippedDuplicates} duplicate sărite, ${state.invalidCount} rânduri invalide.`,
    );
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="eventId" value={eventId} />

      <label className="flex flex-col gap-2 text-sm font-medium">
        Fișier (.csv, .xlsx, .xls)
        <input
          type="file"
          name="file"
          accept=".csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/vnd.ms-excel"
          required
          className="rounded-lg border border-border bg-background px-3 py-3 text-sm"
        />
      </label>

      <div className="rounded-lg border border-border bg-background/70 p-3 text-xs text-muted">
        <p className="font-medium text-foreground">Formate acceptate</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>
            <span className="text-foreground">Standard</span> — prima linie: First Name,
            Last Name, Email, Phone, Teacher, Paid (și variante RO). Group/Clasă e
            opțional.
          </li>
          <li>
            <span className="text-foreground">Listă clasă / bal</span> — mai multe foi
            (Profesori, A, B, C…), antet pe rândul cu{" "}
            <span className="text-foreground">Nume și Prenume</span>; opțional Meniu /
            Minor. Profesorii sunt marcați automat; elevii primesc grupa din foaie (ex.
            12A).
          </li>
          <li>
            Email gol e permis; duplicatele după{" "}
            <span className="text-foreground">eveniment + email</span> se sar. Fără email,
            deduplicăm după nume + grupă.
          </li>
          <li>Teacher / Paid (format standard): Da/Nu, true/false, 1/0.</li>
        </ul>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Se importă…" : "Încarcă și importă"}
      </Button>

      {state?.status === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}

      {state?.status === "success" ? (
        <div
          className="rounded-lg border border-border bg-card p-4 text-sm"
          role="status"
        >
          <p className="font-medium text-foreground">Rezultat</p>
          <ul className="mt-2 space-y-1 text-muted">
            <li>Rânduri evaluate (parser): {state.totalParsedRows}</li>
            <li>Participanți creați: {state.created}</li>
            <li>Duplicate sărite (fișier + bază): {state.skippedDuplicates}</li>
            <li>Rânduri invalide: {state.invalidCount}</li>
          </ul>
          {state.invalidSamples.length ? (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer font-medium text-foreground">
                Mostră erori (max afișate {state.invalidSamples.length})
              </summary>
              <ul className="mt-2 max-h-52 space-y-2 overflow-auto">
                {state.invalidSamples.map((s) => (
                  <li key={s.row} className="border-t border-border pt-2">
                    <span className="text-foreground">Rand {s.row}:</span>{" "}
                    {s.errors.join("; ")}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
