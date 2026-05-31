import { z } from "zod";

export const selfRegistrationSchema = z
  .object({
    firstName: z.string().trim().min(1, "Prenumele este obligatoriu"),
    lastName: z.string().trim().min(1, "Numele este obligatoriu"),
    group: z.string().trim().min(1, "Clasa / grupa este obligatorie"),
    menuType: z.enum(["normal", "vegetarian"], {
      message: "Alege meniul",
    }),
    schoolLevel: z.enum(["minor", "major"], {
      message: "Alege nivelul (minor / major)",
    }),
    parentalConsent: z
      .string()
      .optional()
      .transform((v) => v === "on" || v === "true"),
  })
  .superRefine((data, ctx) => {
    if (data.schoolLevel === "minor" && !data.parentalConsent) {
      ctx.addIssue({
        code: "custom",
        message:
          "Pentru minori este necesar acordul parental (bifați căutați părinte/tutore).",
        path: ["parentalConsent"],
      });
    }
  });

export type SelfRegistrationInput = z.infer<typeof selfRegistrationSchema>;
