import SimplePage from "@/components/simple-page";

export const metadata = {
  title: "Contacts | Goguma Chat",
};

export default function ContactsPage() {
  return (
    <SimplePage
      title="Contacts live inside chat threads"
      description="We merged profiles into the unified chat canvas so you never leave the context of a conversation."
    >
      <p>
        Head to the{" "}
        <a
          href="/app/chat#contacts"
          className="underline decoration-white/40 underline-offset-4 transition hover:decoration-white"
        >
          chat workspace
        </a>{" "}
        to browse teammates, invite new operators, and manage customer linkage.
      </p>
    </SimplePage>
  );
}
