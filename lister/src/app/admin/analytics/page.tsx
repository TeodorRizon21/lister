import { Card } from "@/components/ui/card";

export default function AdminAnalyticsPage() {
  return (
    <div className="max-w-3xl">
      <Card>
        <h2 className="text-base font-semibold">Analiză</h2>
        <p className="mt-2 text-sm text-muted">
          Agregări pe eveniment (prezență, plăți, profesori) vor folosi
          modelul <code className="text-foreground">CheckInLog</code> și
          participanți — implementare ulterioară.
        </p>
      </Card>
    </div>
  );
}
