import SimplePage from "../../components/simple-page";

export const metadata = {
  title: "Terms of Service | Goguma Chat",
  description: "The agreement that governs your use of Goguma Chat.",
};

export default function TermsPage() {
  return (
    <SimplePage
      title="Terms of Service"
      description="Plain-language commitments around availability, data ownership, and supported use."
    >
      <p>
        By operating a Goguma Chat workspace you retain ownership of the content
        you upload. We provide 99.95% uptime backed by service credits and
        commit to 90-day advanced notice for changes to critical APIs.
      </p>
      <p>
        Custom agreements are available for enterprise plans. Reach out to{" "}
        <a
          className="underline decoration-white/40 underline-offset-4"
          href="mailto:legal@goguma.chat"
        >
          legal@goguma.chat
        </a>
        .
      </p>
    </SimplePage>
  );
}
