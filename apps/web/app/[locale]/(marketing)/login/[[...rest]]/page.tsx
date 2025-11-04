import Link from "next/link";

import AuthForm from "@/components/auth-form";
import GradientText from "@/components/gradient-text";

export const metadata = {
  title: "Log in | Goguma Chat",
  description: "Access your Goguma Chat operator console.",
};

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-16 pb-32 text-white">
      <div className="mb-8">
        <Link
          href="/"
          className="text-sm text-white/60 transition hover:text-white"
        >
          ← Back to home
        </Link>
      </div>
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-[0_30px_60px_rgba(0,0,0,0.45)]">
        <h1 className="text-2xl font-semibold tracking-tight">
          <GradientText className="block">Log in</GradientText>
        </h1>
        <p className="mt-2 text-sm text-white/60">
          Welcome back. Sign in with your work email to continue.
        </p>
        <div className="mt-8">
          <AuthForm mode="login" />
        </div>
        <p className="mt-4 text-center text-xs text-white/50">
          Forgot your credentials?{" "}
          <Link
            href="/contact"
            className="underline decoration-white/40 underline-offset-4 transition hover:decoration-white"
          >
            Contact support
          </Link>
          .
        </p>
        <p className="mt-6 text-center text-xs text-white/50">
          Need an account?{" "}
          <Link
            href="/signup"
            className="underline decoration-white/40 underline-offset-4 transition hover:decoration-white"
          >
            Start your trial
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
