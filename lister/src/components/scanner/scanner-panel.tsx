"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import {
  checkInByQrTokenAction,
  type CheckInResponse,
} from "@/features/check-in/actions";

const SCANNER_ELEMENT_ID = "qr-scanner-view";
const SCAN_COOLDOWN_MS = 2500;

type ScanStatus = CheckInResponse["status"];

const statusStyles: Record<
  ScanStatus,
  { border: string; bg: string; label: string }
> = {
  success: {
    border: "border-emerald-500/50",
    bg: "bg-emerald-500/10",
    label: "Intrat",
  },
  already_checked_in: {
    border: "border-amber-500/50",
    bg: "bg-amber-500/10",
    label: "Deja intrat",
  },
  invalid_ticket: {
    border: "border-destructive/50",
    bg: "bg-destructive/10",
    label: "Invalid",
  },
  error: {
    border: "border-destructive/50",
    bg: "bg-destructive/10",
    label: "Eroare",
  },
};

export function ScannerPanel() {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false);
  const lastScanRef = useRef<{ token: string; at: number } | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [lastResult, setLastResult] = useState<CheckInResponse | null>(null);

  const handleScan = useCallback(async (decodedText: string) => {
    const token = decodedText.trim();
    if (!token) return;

    const now = Date.now();
    const last = lastScanRef.current;
    if (
      last &&
      last.token === token &&
      now - last.at < SCAN_COOLDOWN_MS
    ) {
      return;
    }
    if (processingRef.current) return;

    processingRef.current = true;
    lastScanRef.current = { token, at: now };

    try {
      const result = await checkInByQrTokenAction(token);
      setLastResult(result);

      if (result.status === "success") {
        toast.success(result.message);
      } else if (result.status === "already_checked_in") {
        toast.warning(result.message);
      } else {
        toast.error(result.message);
      }
    } catch {
      const fallback: CheckInResponse = {
        status: "error",
        message: "Eroare la check-in. Încearcă din nou.",
      };
      setLastResult(fallback);
      toast.error(fallback.message);
    } finally {
      processingRef.current = false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
    scannerRef.current = scanner;

    async function startCamera() {
      try {
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const size = Math.min(viewfinderWidth, viewfinderHeight) * 0.72;
              return { width: size, height: size };
            },
            aspectRatio: 1,
          },
          (decoded) => {
            if (!cancelled) void handleScan(decoded);
          },
          () => {},
        );
        if (!cancelled) {
          setCameraReady(true);
          setCameraError(null);
        }
      } catch {
        if (!cancelled) {
          setCameraError(
            "Nu am putut porni camera. Acordă permisiunea în browser sau folosește HTTPS.",
          );
        }
      }
    }

    void startCamera();

    return () => {
      cancelled = true;
      const instance = scannerRef.current;
      scannerRef.current = null;
      if (instance?.isScanning) {
        void instance.stop().catch(() => {});
      }
    };
  }, [handleScan]);

  const style = lastResult ? statusStyles[lastResult.status] : null;

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden p-0">
        <div
          id={SCANNER_ELEMENT_ID}
          className="min-h-[280px] w-full bg-black/90 [&_video]:mx-auto [&_video]:max-h-[min(70vh,520px)] [&_video]:w-full [&_video]:object-cover"
        />
        {!cameraReady && !cameraError ? (
          <p className="border-t border-border px-4 py-3 text-sm text-muted">
            Pornesc camera…
          </p>
        ) : null}
        {cameraError ? (
          <p className="border-t border-border px-4 py-3 text-sm text-destructive">
            {cameraError}
          </p>
        ) : null}
      </Card>

      <Card>
        <p className="text-sm text-muted">
          Îndreaptă camera spre codul QR al participantului. Check-in-ul se face
          automat la scanare.
        </p>
      </Card>

      {lastResult && style ? (
        <Card className={`border-2 ${style.border} ${style.bg}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Ultima scanare — {style.label}
          </p>
          <p className="mt-2 text-base font-semibold">{lastResult.message}</p>
          {lastResult.participant ? (
            <dl className="mt-3 grid gap-1 text-sm text-muted">
              <div>
                <span className="text-foreground">
                  {lastResult.participant.lastName}{" "}
                  {lastResult.participant.firstName}
                </span>
                {lastResult.participant.group ? (
                  <span> · {lastResult.participant.group}</span>
                ) : null}
              </div>
              <div>{lastResult.participant.eventTitle}</div>
              {lastResult.participant.checkedInAt ? (
                <div>
                  Ora intrării:{" "}
                  {new Date(lastResult.participant.checkedInAt).toLocaleString(
                    "ro-RO",
                  )}
                </div>
              ) : null}
            </dl>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
