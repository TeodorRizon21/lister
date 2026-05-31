"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { CheckInResponse } from "@/features/check-in/actions";

const AUTO_DISMISS_MS = 3500;

type ScanResultModalProps = {
  result: CheckInResponse;
  onClose: () => void;
};

function isAccessGranted(status: CheckInResponse["status"]): boolean {
  return status === "success";
}

export function ScanResultModal({ result, onClose }: ScanResultModalProps) {
  const granted = isAccessGranted(result.status);

  useEffect(() => {
    const timer = window.setTimeout(onClose, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [onClose, result]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scan-result-title"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-sm rounded-2xl border-2 p-8 text-center shadow-xl ${
          granted
            ? "border-emerald-500 bg-card"
            : "border-destructive bg-card"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`mx-auto flex size-24 items-center justify-center rounded-full ${
            granted ? "bg-emerald-500/15 text-emerald-500" : "bg-destructive/15 text-destructive"
          }`}
        >
          {granted ? (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              className="size-14"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              className="size-14"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          )}
        </div>

        <h2
          id="scan-result-title"
          className={`mt-6 text-2xl font-bold ${
            granted ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
          }`}
        >
          {granted ? "Acces permis" : "Acces interzis"}
        </h2>

        <p className="mt-3 text-base text-foreground">{result.message}</p>

        {result.participant ? (
          <div className="mt-4 rounded-lg bg-background/80 px-4 py-3 text-sm text-muted">
            <p className="font-medium text-foreground">
              {result.participant.lastName} {result.participant.firstName}
            </p>
            {result.participant.group ? (
              <p className="mt-1">{result.participant.group}</p>
            ) : null}
            {!granted && result.status === "already_checked_in" && result.participant.checkedInAt ? (
              <p className="mt-1">
                Intrat la{" "}
                {new Date(result.participant.checkedInAt).toLocaleString("ro-RO")}
              </p>
            ) : null}
          </div>
        ) : null}

        <Button
          type="button"
          variant={granted ? "primary" : "secondary"}
          className="mt-6 w-full"
          onClick={onClose}
        >
          Continuă scanarea
        </Button>
      </div>
    </div>
  );
}
