import SimplePage from "../../components/simple-page";

const paragraphs = [
  "Goguma Chat exists to make every customer interaction feel hand-crafted. We believe teams deserve a workspace that amplifies clarity instead of clutter, so we designed an OLED-first interface where contrast serves the conversation.",
  "From rapid incident response to long-running success journeys, our tools help you orchestrate every exchange with context, AI recall, and a touch of hospitality.",
  "We are a distributed crew of designers, engineers, and operators who have supported millions of conversations for global companies. The mission is simple: help your team stay human at scale.",
];

export default function AboutPage() {
  return (
    <SimplePage
      title="About Goguma Chat"
      description="We build monochrome messaging tools that keep customer
      relationships bright."
    >
      {paragraphs.map((text) => (
        <p key={text}>{text}</p>
      ))}
    </SimplePage>
  );
}
