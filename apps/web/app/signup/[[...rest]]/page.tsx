import { SignUp } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import Link from "next/link";

export const metadata = {
  title: "Create account | Goguma Chat",
  description: "Spin up your Goguma Chat workspace in minutes.",
};

export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6 py-16 pb-32 text-white">
      <div className="mb-8">
        <Link
          href="/"
          className="text-sm text-white/60 transition hover:text-white"
        >
          ← Back to home
        </Link>
      </div>
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-10 shadow-[0_30px_60px_rgba(0,0,0,0.45)]">
        <h1 className="text-2xl font-semibold tracking-tight">
          Start your free trial
        </h1>
        <p className="mt-2 text-sm text-white/60">
          Create a workspace and invite your teammates. No credit card required.
        </p>
        <div className="mt-8">
          <SignUp
            routing="path"
            appearance={{
              baseTheme: dark,
              variables: { colorPrimary: "#ffffff" },
              elements: {
                rootBox: "w-full",
                card: "border border-white/10 bg-black/60 backdrop-blur",
                headerTitle: "text-white",
                headerSubtitle: "text-white/60",
                formFieldLabel: "text-xs uppercase tracking-[0.2em] text-white/50",
                formFieldInput:
                  "rounded-xl border border-white/15 bg-black/80 text-white placeholder:text-white/40 focus:border-white/40",
                dividerLine: "bg-white/10",
                dividerText: "text-white/50",
                formButtonPrimary:
                  "rounded-full bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-white/90",
                footer: "text-white/50",
              },
            }}
            afterSignUpUrl="/app/dashboard"
            signInUrl="/login"
          />
        </div>
        <p className="mt-4 text-center text-xs text-white/50">
          By continuing you agree to the{" "}
          <Link
            href="/terms"
            className="underline decoration-white/40 underline-offset-4 transition hover:decoration-white"
          >
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link
            href="/privacy"
            className="underline decoration-white/40 underline-offset-4 transition hover:decoration-white"
          >
            Privacy Policy
          </Link>
          .
        </p>
        <p className="mt-6 text-center text-xs text-white/50">
          Already using Goguma Chat?{" "}
          <Link
            href="/login"
            className="underline decoration-white/40 underline-offset-4 transition hover:decoration-white"
          >
            Log in instead
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
