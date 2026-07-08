import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const r = await p.participant.updateMany({
  where: { eventId: "6a4adf88408edddf43b6f833", tableNumber: 51 },
  data: { teacher: true },
});
console.log("Actualizați ca profesori:", r.count);
await p.$disconnect();
