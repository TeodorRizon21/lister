import { z } from "zod";

const dateField = z
  .string()
  .min(1, "Data este obligatorie")
  .transform((value) => new Date(value));

export const eventInputSchema = z
  .object({
    title: z.string().trim().min(3, "Titlul trebuie sa aiba minim 3 caractere"),
    description: z.string().trim().optional(),
    location: z.string().trim().optional(),
    startDate: dateField,
    endDate: dateField,
  })
  .refine((data) => data.endDate >= data.startDate, {
    path: ["endDate"],
    message: "Data de final trebuie sa fie dupa data de start",
  });

export type EventInput = z.infer<typeof eventInputSchema>;
