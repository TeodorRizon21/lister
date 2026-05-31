"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  resetCheckInAction,
  type ResetCheckInState,
} from "@/features/check-in/actions";

export function ResetCheckInButton({
  participantId,
  eventId,
  participantName,
}: {
  participantId: string;
  eventId: string;
  participantName: string;
}) {
  const initial: ResetCheckInState = { status: "idle" };
  const [state, action, pending] = useActionState(resetCheckInAction, initial);
  const lastToast = useRef<string | null>(null);

  useEffect(() => {
    if (state.status === "idle" || !state.message) return;
    const key = `${state.status}|${state.message}`;
    if (lastToast.current === key) return;
    lastToast.current = key;
    if (state.status === "success") {
      toast.success(state.message);
    } else {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <form
      action={action}
      className="mt-1"
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Resetezi check-in-ul pentru ${participantName}? Va apărea din nou ca neintrat.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="participantId" value={participantId} />
      <input type="hidden" name="eventId" value={eventId} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs font-medium text-muted underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
      >
        {pending ? "Se resetează…" : "Resetează check-in"}
      </button>
    </form>
  );
}
