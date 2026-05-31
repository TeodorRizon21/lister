import { EventForm } from "@/components/events/event-form";
import { createEventAction } from "@/features/events/actions";

export default function NewEventPage() {
  return (
    <EventForm
      title="Creeaza eveniment"
      submitLabel="Creeaza eveniment"
      action={createEventAction}
    />
  );
}
