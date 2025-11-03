import Link from "next/link";

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
        <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>
        <p className="mt-2 text-sm text-white/60">
          Welcome back. Enter your credentials to continue.
        </p>
        <form
          className="mt-8 space-y-6"
          method="post"
          action="/api/auth/callback/credentials"
        >
          <label className="block text-sm">
            <span className="text-white/70">Email</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white shadow-inner focus:border-white/40 focus:outline-none"
            />
          </label>
          <label className="block text-sm">
            <span className="text-white/70">Password</span>
            <input
              type="password"
              name="password"
              required
              minLength={8}
              autoComplete="current-password"
              className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white shadow-inner focus:border-white/40 focus:outline-none"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-full bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            Sign in
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-white/50">
          Forgot your credentials?{" "}
          <Link
            href="/contact"
            className="underline decoration-white/40 underline-offset-4 transition hover:decoration-white"
          >
            Contact support
          </Link>
          .
        </p>
        <p className="mt-4 text-center text-xs text-white/50">
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
