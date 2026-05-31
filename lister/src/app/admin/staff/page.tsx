import { Card } from "@/components/ui/card";

export default function AdminStaffPage() {
  return (
    <div className="max-w-3xl">
      <Card>
        <h2 className="text-base font-semibold">Personal &amp; roluri</h2>
        <p className="mt-2 text-sm text-muted">
          Invită utilizatori din Clerk (Dashboard → Users) sau lasă înregistrarea
          deschisă din Clerk dacă e cazul. Rolurile admin/staff în aplicație se
          gestionează din Prisma; aici vom afișa lista și promovarea admin/staff.
        </p>
      </Card>
    </div>
  );
}
