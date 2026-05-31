import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center p-6">
      <SignUp
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
