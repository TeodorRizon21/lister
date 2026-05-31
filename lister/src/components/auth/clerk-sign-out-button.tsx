"use client";

import { SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export function ClerkSignOutButton({
  variant = "ghost",
  className,
  label = "Deconectare",
}: {
  variant?: "ghost" | "secondary";
  className?: string;
  label?: string;
}) {
  return (
    <SignOutButton redirectUrl="/sign-in">
      <Button type="button" variant={variant} className={className}>
        {label}
      </Button>
    </SignOutButton>
  );
}
