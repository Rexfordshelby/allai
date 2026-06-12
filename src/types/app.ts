export type AppMode = "chat" | "compare" | "image";

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  id?: string;
  role: ChatRole;
  content: string;
  model_id?: string | null;
  created_at?: string;
};

export type Conversation = {
  id: string;
  user_id: string;
  title: string;
  mode: AppMode;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

export type ModelOption = {
  id: string;
  name: string;
  contextLength?: number;
  promptPrice?: string;
  completionPrice?: string;
  description?: string;
};

export type ImageGeneration = {
  id: string;
  prompt: string;
  negative_prompt: string | null;
  model_id: string;
  width: number;
  height: number;
  seed: number | null;
  storage_path: string | null;
  signed_url?: string | null;
  status: "pending" | "completed" | "failed";
  error: string | null;
  created_at: string;
};
