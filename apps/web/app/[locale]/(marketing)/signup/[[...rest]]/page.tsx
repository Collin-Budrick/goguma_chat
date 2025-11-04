import Link from "next/link";

import AuthForm from "@/components/auth-form";
import GradientText from "@/components/gradient-text";

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
          <GradientText className="block">
            Start your free trial
          </GradientText>
        </h1>
        <p className="mt-2 text-sm text-white/60">
          Create a workspace and invite your teammates. No credit card required.
        </p>
        <div className="mt-8">
          <AuthForm mode="signup" />
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
