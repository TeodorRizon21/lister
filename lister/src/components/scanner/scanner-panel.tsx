"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Card } from "@/components/ui/card";
import { ScanResultModal } from "@/components/scanner/scan-result-modal";
import {
  checkInByQrTokenAction,
  type CheckInResponse,
} from "@/features/check-in/actions";

const SCANNER_ELEMENT_ID = "qr-scanner-view";
/** Cooldown after closing the result modal, so the same QR still in frame isn't re-scanned. */
const POST_CLOSE_COOLDOWN_MS = 2500;

export function ScannerPanel() {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  /** Blocks all scans from recognition until the result modal is closed. */
  const lockedRef = useRef(false);
  const lastScanRef = useRef<{ token: string; at: number } | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [modalResult, setModalResult] = useState<CheckInResponse | null>(null);
  const [awaitingResult, setAwaitingResult] = useState(false);

  const pauseScanner = useCallback(() => {
    const scanner = scannerRef.current;
    if (!scanner?.isScanning) return;
    try {
      scanner.pause(true);
    } catch {
      // Already paused or not ready — lock still holds via lockedRef.
    }
  }, []);

  const resumeScanner = useCallback(() => {
    const scanner = scannerRef.current;
    if (!scanner?.isScanning) return;
    try {
      scanner.resume();
    } catch {
      // Ignore resume errors; next successful start handles recovery.
    }
  }, []);

  const handleScan = useCallback(
    async (decodedText: string) => {
      const token = decodedText.trim();
      if (!token) return;
      if (lockedRef.current) return;

      const now = Date.now();
      const last = lastScanRef.current;
      if (
        last &&
        last.token === token &&
        now - last.at < POST_CLOSE_COOLDOWN_MS
      ) {
        return;
      }

      // Lock immediately on recognition — before any await — so duplicate
      // frames cannot start a second check-in while the network is slow.
      lockedRef.current = true;
      lastScanRef.current = { token, at: now };
      pauseScanner();
      setAwaitingResult(true);

      try {
        const result = await checkInByQrTokenAction(token);
        setModalResult(result);
      } catch {
        setModalResult({
          status: "error",
          message: "Eroare la check-in. Încearcă din nou.",
        });
      } finally {
        setAwaitingResult(false);
      }
    },
    [pauseScanner],
  );

  const closeModal = useCallback(() => {
    // Restart cooldown from dismiss so a QR still in frame isn't re-read.
    if (lastScanRef.current) {
      lastScanRef.current = {
        ...lastScanRef.current,
        at: Date.now(),
      };
    }
    setModalResult(null);
    lockedRef.current = false;
    resumeScanner();
  }, [resumeScanner]);

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

  return (
    <>
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
          {awaitingResult ? (
            <p className="border-t border-border px-4 py-3 text-sm text-muted">
              Verific biletul…
            </p>
          ) : null}
        </Card>

        <Card>
          <p className="text-sm text-muted">
            Îndreaptă camera spre codul QR al participantului. După scanare apare
            un mesaj de acces permis sau interzis.
          </p>
        </Card>
      </div>

      {modalResult ? (
        <ScanResultModal result={modalResult} onClose={closeModal} />
      ) : null}
    </>
  );
}
