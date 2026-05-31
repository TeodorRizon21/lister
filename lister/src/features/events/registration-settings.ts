import { z } from "zod";

export const eventRegistrationSettingsSchema = z.object({
  eventId: z.string().min(1),
  registrationOpen: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true"),
  registrationPassword: z.string().optional(),
});
