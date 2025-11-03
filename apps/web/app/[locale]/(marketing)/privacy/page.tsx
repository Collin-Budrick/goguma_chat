import SimplePage from "@/components/simple-page";

export const metadata = {
  title: "Privacy Policy | Goguma Chat",
  description:
    "Understand how Goguma Chat protects and processes your data.",
};

export default function PrivacyPage() {
  return (
    <SimplePage
      title="Privacy Policy"
      description="We encrypt, minimize, and guard the conversations entrusted to us."
    >
      <p>
        Goguma Chat stores customer messages in region-specific clusters with
        envelope encryption and strict access controls. Operators can request
        audit trails at any time, and personal data requests are honored within
        72 hours.
      </p>
      <p>
        Contact{" "}
        <a
          className="underline decoration-white/40 underline-offset-4"
          href="mailto:privacy@goguma.chat"
        >
          privacy@goguma.chat
        </a>{" "}
        for questions.
      </p>
    </SimplePage>
  );
}
