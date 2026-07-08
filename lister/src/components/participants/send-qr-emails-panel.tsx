"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  sendQrEmailsBatchAction,
  type SendQrEmailsState,
} from "@/features/participants/qr-email-actions";

export function SendQrEmailsPanel({
  eventId,
  pendingCount,
  sentCount,
  smtpConfigured,
}: {
  eventId: string;
  pendingCount: number;
  sentCount: number;
  smtpConfigured: boolean;
}) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{
    sent: number;
    remaining: number;
  } | null>(null);

  const runBatches = useCallback(async () => {
    if (
      !window.confirm(
        `Trimiți codul QR pe email către ${pendingCount} participanți?\n\nSe trimit în loturi mici (câte ~20) până se termină lista. Poți opri oricând.`,
      )
    ) {
      return;
    }

    setRunning(true);
    setProgress({ sent: 0, remaining: pendingCount });

    let totalSent = 0;
    let remaining = pendingCount;
    const idle: SendQrEmailsState = { status: "idle" };

    try {
      while (remaining > 0) {
        const fd = new FormData();
        fd.set("eventId", eventId);
        const result = await sendQrEmailsBatchAction(idle, fd);

        if (result.status === "error") {
          toast.error(result.message);
          break;
        }

        if (result.status !== "success") break;

        totalSent += result.sent;
        remaining = result.remaining;
        setProgress({ sent: totalSent, remaining });

        if (result.sent === 0) {
          toast.error(
            result.failed > 0
              ? "Trimiterea s-a oprit din cauza erorilor SMTP."
              : result.message,
          );
          break;
        }

        if (remaining === 0) {
          toast.success(`Gata! ${totalSent} emailuri trimise în această sesiune.`);
          break;
        }

        await new Promise((r) => setTimeout(r, 600));
      }
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }, [eventId, pendingCount]);

  return (
    <div className="mt-4 rounded-lg border border-border bg-background/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Coduri QR pe email</p>
          <p className="mt-1 text-sm text-muted">
            {sentCount > 0 ? `${sentCount} trimise` : "Niciun email trimis"}
            {pendingCount > 0 ? ` · ${pendingCount} de trimis` : " · toți au primit"}
          </p>
          {!smtpConfigured ? (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              Configurează SMTP în <code className="text-xs">.env</code> pentru a
              putea trimite (vezi .env.example).
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={runBatches}
          disabled={running || pendingCount === 0 || !smtpConfigured}
          className="inline-flex min-h-[44px] items-center rounded-lg border border-border bg-foreground px-4 py-2 text-sm font-medium text-background disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running
            ? progress
              ? `Se trimit… ${progress.sent} / ${progress.sent + progress.remaining}`
              : "Se pregătește…"
            : pendingCount > 0
              ? "Trimite coduri QR"
              : "Toate trimise"}
        </button>
      </div>
    </div>
  );
}
