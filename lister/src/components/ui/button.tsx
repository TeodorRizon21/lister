import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "ghost" | "danger";
  }
>(({ className, variant = "primary", type = "button", ...props }, ref) => {
  const variants = {
    primary:
      "bg-accent text-accent-foreground hover:opacity-90 shadow-sm disabled:opacity-50",
    secondary:
      "bg-card border border-border text-foreground hover:bg-background/80",
    ghost: "text-foreground hover:bg-card/80 border border-transparent",
    danger:
      "bg-destructive text-white hover:opacity-90 disabled:opacity-50 shadow-sm",
  };
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent min-h-[44px]",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
});
Button.displayName = "Button";
