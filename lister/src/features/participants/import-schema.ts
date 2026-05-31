import { z } from "zod";

export const participantImportRowSchema = z.object({
  firstName: z.string().trim().min(1, "Prenume lipsă"),
  lastName: z.string().trim().min(1, "Nume lipsă"),
  email: z
    .string()
    .trim()
    .transform((s) => (s === "" ? null : s.toLowerCase()))
    .refine((s) => s === null || z.string().email().safeParse(s).success, {
      message: "Email invalid",
    }),
  phone: z
    .string()
    .trim()
    .transform((s) => (s === "" ? null : s)),
  group: z
    .string()
    .trim()
    .transform((s) => s),
  teacher: z.boolean(),
  paid: z.boolean(),
  menuType: z.enum(["normal", "vegetarian"]).nullable().optional(),
  schoolLevel: z.enum(["minor", "major"]).nullable().optional(),
});

export type ParticipantImportRow = z.infer<typeof participantImportRowSchema>;
