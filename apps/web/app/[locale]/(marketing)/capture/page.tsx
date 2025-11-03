export const metadata = {
  title: "Background Capture | Goguma Chat",
  description: "Minimal frosted surface for monochrome screen recordings.",
};

export default function CapturePage() {
  return (
    <div
      aria-hidden="true"
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-white/5 via-white/0 to-white/10"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.18)_0%,transparent_60%)]" />
      <span className="sr-only">
        Frosted background capture surface for recordings.
      </span>
    </div>
  );
}
