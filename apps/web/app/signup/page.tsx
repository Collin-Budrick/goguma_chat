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
        <form
          className="mt-8 grid gap-6 md:grid-cols-2"
          method="post"
          action="/api/auth/signup"
        >
          <label className="block text-sm md:col-span-1">
            <span className="text-white/70">First name</span>
            <input
              type="text"
              name="firstName"
              required
              className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white shadow-inner focus:border-white/40 focus:outline-none"
            />
          </label>
          <label className="block text-sm md:col-span-1">
            <span className="text-white/70">Last name</span>
            <input
              type="text"
              name="lastName"
              required
              className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white shadow-inner focus:border-white/40 focus:outline-none"
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="text-white/70">Work email</span>
            <input
              type="email"
              name="email"
              required
              className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white shadow-inner focus:border-white/40 focus:outline-none"
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="text-white/70">Company name</span>
            <input
              type="text"
              name="company"
              required
              className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white shadow-inner focus:border-white/40 focus:outline-none"
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="text-white/70">Password</span>
            <input
              type="password"
              name="password"
              minLength={8}
              required
              className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white shadow-inner focus:border-white/40 focus:outline-none"
            />
          </label>
          <label className="flex items-start gap-3 text-xs text-white/60 md:col-span-2">
            <input
              type="checkbox"
              name="terms"
              required
              className="mt-1 rounded border border-white/25 bg-black"
            />
            <span>
              I agree to the{" "}
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
            </span>
          </label>
          <button
            type="submit"
            className="md:col-span-2 inline-flex w-full items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            Create workspace
          </button>
        </form>
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
