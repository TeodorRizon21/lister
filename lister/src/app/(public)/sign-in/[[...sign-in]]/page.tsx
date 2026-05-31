import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center p-6">
      <SignIn
        appearance={{
          elements: {
            rootBox: "w-full max-w-md",
            card: "shadow-none border border-border bg-card",
          },
        }}
      />
    </div>
  );
}
