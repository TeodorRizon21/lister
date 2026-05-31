"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  verifyRegistrationPasswordAction,
  type RegistrationPasswordState,
} from "@/features/registration/actions";

export function RegistrationPasswordForm({ slug }: { slug: string }) {
  const router = useRouter();
  const initial: RegistrationPasswordState = { status: "idle" };
  const [state, action, pending] = useActionState(
    verifyRegistrationPasswordAction,
    initial,
  );

  useEffect(() => {
    if (state?.status !== "idle" || pending) return;
    router.refresh();
  }, [state, pending, router]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />
      <p className="text-sm text-muted">
        Introdu parola primită de la organizatori pentru a accesa formularul de
        înscriere.
      </p>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Parolă eveniment
        <Input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          placeholder="Parola evenimentului"
        />
      </label>
      {state?.status === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Se verifică…" : "Continuă"}
      </Button>
    </form>
  );
}
