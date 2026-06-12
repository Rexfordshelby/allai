import { ManyAiApp } from "@/components/many-ai-app";

export default async function Home() {
  return (
    <ManyAiApp
      user={{
        id: "guest",
        email: "Guest workspace"
      }}
      cloudEnabled={false}
    />
  );
}
