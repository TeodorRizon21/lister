"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  selfRegisterAction,
  type SelfRegisterState,
} from "@/features/registration/actions";

export function SelfRegisterForm({ slug }: { slug: string }) {
  const initial: SelfRegisterState = { status: "idle" };
  const [state, action, pending] = useActionState(selfRegisterAction, initial);
  const fieldErrors = state?.status === "error" ? state.fieldErrors : undefined;
  const errorMessage = state?.status === "error" ? state.message : undefined;

  if (state?.status === "success") {
    return (
      <div
        className="rounded-lg border border-border bg-card p-4 text-sm"
        role="status"
      >
        <p className="font-medium text-foreground">Înscriere reușită</p>
        <p className="mt-2 text-muted">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Prenume
          <Input name="firstName" required autoComplete="given-name" />
          {fieldErrors?.firstName ? (
            <span className="text-xs text-destructive">
              {fieldErrors.firstName}
            </span>
          ) : null}
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Nume
          <Input name="lastName" required autoComplete="family-name" />
          {fieldErrors?.lastName ? (
            <span className="text-xs text-destructive">
              {fieldErrors.lastName}
            </span>
          ) : null}
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Clasă / grupă
        <Input
          name="group"
          required
          placeholder="Ex: Clasa a X-a A, Grupa Juniori 1"
        />
        {fieldErrors?.group ? (
          <span className="text-xs text-destructive">{fieldErrors.group}</span>
        ) : null}
      </label>

      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="font-medium">Meniul la masă</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="menuType" value="normal" required />
          Normal
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="menuType" value="vegetarian" />
          Vegetarian
        </label>
        {fieldErrors?.menuType ? (
          <span className="text-xs text-destructive">{fieldErrors.menuType}</span>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="font-medium">Liceu — vârstă</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="schoolLevel" value="minor" required />
          Minor (sub 18 ani — necesit acord parental)
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="schoolLevel" value="major" />
          Major (18+ ani)
        </label>
        {fieldErrors?.schoolLevel ? (
          <span className="text-xs text-destructive">
            {fieldErrors.schoolLevel}
          </span>
        ) : null}
      </fieldset>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="parentalConsent"
          className="mt-1"
        />
        <span>
          Confirm că am acordul părintelui / tutorelui legal pentru participare
          (obligatoriu pentru <strong>minori</strong>).
        </span>
      </label>
      {fieldErrors?.parentalConsent ? (
        <span className="text-xs text-destructive">
          {fieldErrors.parentalConsent}
        </span>
      ) : null}

      {errorMessage ? (
        <p className="text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Se trimite…" : "Trimite înscrierea"}
      </Button>
    </form>
  );
}
