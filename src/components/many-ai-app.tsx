"use client";

import {
  AlertTriangle,
  Bot,
  Check,
  Image as ImageIcon,
  Layers3,
  Loader2,
  LogOut,
  Plus,
  Search,
  Send,
  Sparkles,
  X
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  APP_NAME,
  DEFAULT_COMPARE_MODELS,
  DEFAULT_IMAGE_MODELS,
  DEFAULT_TEXT_MODELS,
  IMAGE_SIZES,
  MAX_COMPARE_MODELS
} from "@/lib/constants";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type {
  AppMode,
  ChatMessage,
  Conversation,
  ImageGeneration,
  ModelOption
} from "@/types/app";

type UserSummary = {
  id: string;
  email: string;
};

type CompareStatus = "idle" | "streaming" | "completed" | "failed";

type CompareColumn = {
  model: string;
  content: string;
  status: CompareStatus;
  error?: string;
};

type SseEvent = {
  event: string;
  data: unknown;
};

export function ManyAiApp({ user }: { user: UserSummary }) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [mode, setMode] = useState<AppMode>("chat");
  const [models, setModels] = useState<ModelOption[]>(DEFAULT_TEXT_MODELS);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_TEXT_MODELS[0].id);
  const [compareModels, setCompareModels] = useState<string[]>(
    DEFAULT_COMPARE_MODELS
  );
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [search, setSearch] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [compareResults, setCompareResults] = useState<
    Record<string, CompareColumn>
  >({});
  const [imagePrompt, setImagePrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [imageModel, setImageModel] = useState(DEFAULT_IMAGE_MODELS[0]);
  const [imageSize, setImageSize] = useState(IMAGE_SIZES[0]);
  const [images, setImages] = useState<ImageGeneration[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const refreshModels = useCallback(async () => {
    const response = await fetch("/api/models");
    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as { models?: ModelOption[] };
    if (payload.models?.length) {
      setModels(payload.models);
      setSelectedModel((current) => current || payload.models![0].id);
    }
  }, []);

  const refreshConversations = useCallback(async () => {
    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .eq("archived", false)
      .order("updated_at", { ascending: false })
      .limit(80);

    if (error) {
      setStatusMessage(`Database setup needed: ${error.message}`);
      return;
    }

    setConversations((data as Conversation[]) ?? []);
  }, [supabase]);

  const refreshImages = useCallback(async () => {
    const response = await fetch("/api/images");
    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as { images?: ImageGeneration[] };
    setImages(payload.images ?? []);
  }, []);

  useEffect(() => {
    void refreshModels();
    void refreshConversations();
    void refreshImages();
  }, [refreshConversations, refreshImages, refreshModels]);

  const filteredConversations = conversations.filter((conversation) =>
    conversation.title.toLowerCase().includes(search.toLowerCase())
  );

  const modelLookup = useMemo(() => {
    return new Map(models.map((model) => [model.id, model]));
  }, [models]);

  async function loadConversation(conversationId: string) {
    setStatusMessage(null);

    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .single();

    if (conversationError || !conversation) {
      setStatusMessage(conversationError?.message ?? "Conversation not found.");
      return;
    }

    const { data, error } = await supabase
      .from("messages")
      .select("id, role, content, model_id, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      setStatusMessage(error.message);
      return;
    }

    const loadedMessages = (data as ChatMessage[]) ?? [];
    const loadedConversation = conversation as Conversation;
    setSelectedConversationId(conversationId);
    setMode(loadedConversation.mode);
    setMessages(loadedMessages);

    if (loadedConversation.mode === "compare") {
      const nextResults: Record<string, CompareColumn> = {};

      for (const message of loadedMessages) {
        if (message.role === "assistant" && message.model_id) {
          nextResults[message.model_id] = {
            model: message.model_id,
            content: message.content,
            status: "completed"
          };
        }
      }

      const loadedModels = Object.keys(nextResults);
      if (loadedModels.length) {
        setCompareModels(loadedModels.slice(0, MAX_COMPARE_MODELS));
      }
      setCompareResults(nextResults);
    }
  }

  function startNewConversation(nextMode = mode) {
    setSelectedConversationId(null);
    setMode(nextMode);
    setMessages([]);
    setPrompt("");
    setCompareResults({});
    setStatusMessage(null);
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.reload();
  }

  function buildHistory() {
    return messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .slice(-24)
      .map((message) => ({
        role: message.role,
        content: message.content,
        model_id: message.model_id
      }));
  }

  async function submitChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || isSending) {
      return;
    }

    setIsSending(true);
    setStatusMessage(null);
    setPrompt("");

    const userMessage: ChatMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString()
    };
    const assistantId = `local-assistant-${Date.now()}`;
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      model_id: selectedModel,
      created_at: new Date().toISOString()
    };
    const history = buildHistory();

    setMessages((current) => [...current, userMessage, assistantMessage]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: selectedConversationId,
          model: selectedModel,
          prompt: trimmed,
          history
        })
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Chat request failed.");
      }

      const conversationId = response.headers.get("X-Conversation-Id");
      if (conversationId) {
        setSelectedConversationId(conversationId);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let content = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        content += decoder.decode(value, { stream: true });
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId ? { ...message, content } : message
          )
        );
      }

      await refreshConversations();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chat failed.";
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId ? { ...item, content: message } : item
        )
      );
      setStatusMessage(message);
    } finally {
      setIsSending(false);
    }
  }

  async function submitCompare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || isSending || compareModels.length === 0) {
      return;
    }

    const history = buildHistory();
    setIsSending(true);
    setStatusMessage(null);
    setPrompt("");
    setMessages((current) => [
      ...current,
      {
        id: `local-user-${Date.now()}`,
        role: "user",
        content: trimmed,
        created_at: new Date().toISOString()
      }
    ]);
    setCompareResults(
      Object.fromEntries(
        compareModels.map((model) => [
          model,
          {
            model,
            content: "",
            status: "idle" as CompareStatus
          }
        ])
      )
    );

    try {
      const response = await fetch("/api/chat/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: selectedConversationId,
          models: compareModels,
          prompt: trimmed,
          history
        })
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Compare request failed.");
      }

      const conversationId = response.headers.get("X-Conversation-Id");
      if (conversationId) {
        setSelectedConversationId(conversationId);
      }

      await readSse(response.body, handleCompareEvent);
      await refreshConversations();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Compare failed.";
      setStatusMessage(message);
    } finally {
      setIsSending(false);
    }
  }

  function handleCompareEvent({ event, data }: SseEvent) {
    if (event === "meta" && isRecord(data) && typeof data.conversationId === "string") {
      setSelectedConversationId(data.conversationId);
      return;
    }

    if (!isRecord(data) || typeof data.model !== "string") {
      return;
    }

    const model = data.model;

    if (event === "token" && typeof data.token === "string") {
      setCompareResults((current) => ({
        ...current,
        [model]: {
          model,
          status: "streaming",
          content: `${current[model]?.content ?? ""}${data.token}`
        }
      }));
    }

    if (event === "status" && typeof data.status === "string") {
      setCompareResults((current) => ({
        ...current,
        [model]: {
          model,
          content: current[model]?.content ?? "",
          status: data.status as CompareStatus
        }
      }));
    }

    if (event === "error" && typeof data.error === "string") {
      const errorMessage = data.error;
      setCompareResults((current) => ({
        ...current,
        [model]: {
          model,
          content: current[model]?.content ?? "",
          status: "failed",
          error: errorMessage
        }
      }));
    }
  }

  function toggleCompareModel(modelId: string) {
    setCompareModels((current) => {
      if (current.includes(modelId)) {
        return current.filter((model) => model !== modelId);
      }

      if (current.length >= MAX_COMPARE_MODELS) {
        setStatusMessage(`Compare mode supports up to ${MAX_COMPARE_MODELS} models.`);
        return current;
      }

      return [...current, modelId];
    });
  }

  async function submitImage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = imagePrompt.trim();
    if (!trimmed || isGenerating) {
      return;
    }

    setIsGenerating(true);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: mode === "image" ? selectedConversationId : null,
          prompt: trimmed,
          negativePrompt: negativePrompt.trim() || null,
          model: imageModel,
          width: imageSize.width,
          height: imageSize.height
        })
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Image generation failed.");
      }

      if (payload?.conversationId) {
        setSelectedConversationId(payload.conversationId);
      }

      if (payload?.image) {
        setImages((current) => [payload.image, ...current]);
      }

      setImagePrompt("");
      await refreshConversations();
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Image generation failed."
      );
    } finally {
      setIsGenerating(false);
    }
  }

  const activeCompareColumns =
    Object.values(compareResults).length > 0
      ? Object.values(compareResults)
      : compareModels.map((model) => ({
          model,
          content: "",
          status: "idle" as CompareStatus
        }));

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Conversation history">
        <div className="sidebar-head">
          <div className="brand-row compact">
            <div className="brand-mark">M</div>
            <div>
              <p className="eyebrow">Workspace</p>
              <strong>{APP_NAME}</strong>
            </div>
          </div>
          <button
            className="icon-button"
            onClick={() => startNewConversation(mode)}
            title="New conversation"
            aria-label="New conversation"
          >
            <Plus aria-hidden="true" />
          </button>
        </div>

        <div className="mode-tabs" role="tablist" aria-label="Workspace mode">
          <button
            className={mode === "chat" ? "active" : ""}
            onClick={() => startNewConversation("chat")}
            title="Single chat"
            type="button"
          >
            <Bot aria-hidden="true" />
            <span>Chat</span>
          </button>
          <button
            className={mode === "compare" ? "active" : ""}
            onClick={() => startNewConversation("compare")}
            title="Compare models"
            type="button"
          >
            <Layers3 aria-hidden="true" />
            <span>Compare</span>
          </button>
          <button
            className={mode === "image" ? "active" : ""}
            onClick={() => startNewConversation("image")}
            title="Generate images"
            type="button"
          >
            <ImageIcon aria-hidden="true" />
            <span>Image</span>
          </button>
        </div>

        <div className="search-box">
          <Search aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search chats"
          />
        </div>

        <nav className="conversation-list" aria-label="Saved conversations">
          {filteredConversations.map((conversation) => (
            <button
              key={conversation.id}
              className={
                conversation.id === selectedConversationId ? "selected" : ""
              }
              onClick={() => void loadConversation(conversation.id)}
              type="button"
            >
              <span>{conversation.title}</span>
              <small>{conversation.mode}</small>
            </button>
          ))}
          {filteredConversations.length === 0 ? (
            <p className="empty-text">No saved conversations yet.</p>
          ) : null}
        </nav>

        <div className="account-row">
          <div>
            <small>Signed in</small>
            <span>{user.email}</span>
          </div>
          <button
            className="icon-button"
            onClick={() => void signOut()}
            title="Sign out"
            aria-label="Sign out"
            type="button"
          >
            <LogOut aria-hidden="true" />
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">
              {mode === "chat"
                ? "Single model"
                : mode === "compare"
                  ? "Side-by-side"
                  : "Image generation"}
            </p>
            <h1>
              {mode === "chat"
                ? "Chat with one model"
                : mode === "compare"
                  ? "Compare AI replies"
                  : "Generate images"}
            </h1>
          </div>
          {statusMessage ? (
            <div className="status-pill" role="status">
              <AlertTriangle aria-hidden="true" />
              <span>{statusMessage}</span>
              <button
                onClick={() => setStatusMessage(null)}
                title="Dismiss"
                aria-label="Dismiss status"
                type="button"
              >
                <X aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </header>

        {mode === "chat" ? (
          <ChatPanel
            messages={messages}
            models={models}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            prompt={prompt}
            onPromptChange={setPrompt}
            isSending={isSending}
            onSubmit={submitChat}
          />
        ) : null}

        {mode === "compare" ? (
          <ComparePanel
            models={models}
            modelLookup={modelLookup}
            selectedModels={compareModels}
            onToggleModel={toggleCompareModel}
            prompt={prompt}
            onPromptChange={setPrompt}
            isSending={isSending}
            onSubmit={submitCompare}
            columns={activeCompareColumns}
          />
        ) : null}

        {mode === "image" ? (
          <ImagePanel
            images={images}
            imagePrompt={imagePrompt}
            negativePrompt={negativePrompt}
            imageModel={imageModel}
            imageSize={imageSize}
            isGenerating={isGenerating}
            onPromptChange={setImagePrompt}
            onNegativePromptChange={setNegativePrompt}
            onModelChange={setImageModel}
            onSizeChange={setImageSize}
            onSubmit={submitImage}
          />
        ) : null}
      </section>
    </main>
  );
}

function ChatPanel({
  messages,
  models,
  selectedModel,
  onModelChange,
  prompt,
  onPromptChange,
  isSending,
  onSubmit
}: {
  messages: ChatMessage[];
  models: ModelOption[];
  selectedModel: string;
  onModelChange: (model: string) => void;
  prompt: string;
  onPromptChange: (value: string) => void;
  isSending: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="panel-layout">
      <section className="conversation-panel" aria-label="Chat messages">
        {messages.length === 0 ? (
          <div className="empty-state">
            <Bot aria-hidden="true" />
            <h2>Start a model conversation</h2>
            <p>Pick a model, ask once, and the thread saves automatically.</p>
          </div>
        ) : (
          messages.map((message) => (
            <article key={message.id ?? `${message.role}-${message.created_at}`} className={`message ${message.role}`}>
              <div className="message-meta">
                <span>{message.role === "user" ? "You" : modelLabel(message.model_id)}</span>
                {message.model_id ? <small>{message.model_id}</small> : null}
              </div>
              <p>{message.content || "..."}</p>
            </article>
          ))
        )}
      </section>

      <form className="composer" onSubmit={onSubmit}>
        <label htmlFor="chat-model">Model</label>
        <select
          id="chat-model"
          value={selectedModel}
          onChange={(event) => onModelChange(event.target.value)}
        >
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
        <label htmlFor="chat-prompt">Message</label>
        <textarea
          id="chat-prompt"
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder="Ask anything..."
          rows={4}
        />
        <button className="primary-button" disabled={isSending || !prompt.trim()} type="submit">
          {isSending ? <Loader2 className="spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
          <span>{isSending ? "Streaming" : "Send"}</span>
        </button>
      </form>
    </div>
  );
}

function ComparePanel({
  models,
  modelLookup,
  selectedModels,
  onToggleModel,
  prompt,
  onPromptChange,
  isSending,
  onSubmit,
  columns
}: {
  models: ModelOption[];
  modelLookup: Map<string, ModelOption>;
  selectedModels: string[];
  onToggleModel: (model: string) => void;
  prompt: string;
  onPromptChange: (value: string) => void;
  isSending: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  columns: CompareColumn[];
}) {
  return (
    <div className="compare-layout">
      <aside className="model-picker" aria-label="Compare model picker">
        <div className="section-title">
          <Layers3 aria-hidden="true" />
          <span>Models</span>
          <small>{selectedModels.length}/{MAX_COMPARE_MODELS}</small>
        </div>
        <div className="model-options">
          {models.slice(0, 28).map((model) => {
            const checked = selectedModels.includes(model.id);
            return (
              <label key={model.id} className={checked ? "checked" : ""}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleModel(model.id)}
                />
                <span>{model.name}</span>
              </label>
            );
          })}
        </div>
      </aside>

      <section className="compare-workspace">
        <div className="compare-columns" aria-label="Model responses">
          {columns.map((column) => (
            <article key={column.model} className="compare-card">
              <header>
                <div>
                  <strong>{modelLookup.get(column.model)?.name ?? column.model}</strong>
                  <small>{column.model}</small>
                </div>
                <StatusIcon status={column.status} />
              </header>
              <p>{column.error ?? (column.content || "Waiting for a prompt.")}</p>
            </article>
          ))}
        </div>

        <form className="composer compare-composer" onSubmit={onSubmit}>
          <label htmlFor="compare-prompt">Prompt</label>
          <textarea
            id="compare-prompt"
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            placeholder="Send one prompt to every selected model..."
            rows={4}
          />
          <button
            className="primary-button"
            disabled={isSending || !prompt.trim() || selectedModels.length === 0}
            type="submit"
          >
            {isSending ? <Loader2 className="spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
            <span>{isSending ? "Comparing" : "Compare"}</span>
          </button>
        </form>
      </section>
    </div>
  );
}

function ImagePanel({
  images,
  imagePrompt,
  negativePrompt,
  imageModel,
  imageSize,
  isGenerating,
  onPromptChange,
  onNegativePromptChange,
  onModelChange,
  onSizeChange,
  onSubmit
}: {
  images: ImageGeneration[];
  imagePrompt: string;
  negativePrompt: string;
  imageModel: string;
  imageSize: (typeof IMAGE_SIZES)[number];
  isGenerating: boolean;
  onPromptChange: (value: string) => void;
  onNegativePromptChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onSizeChange: (size: (typeof IMAGE_SIZES)[number]) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="image-layout">
      <form className="image-controls" onSubmit={onSubmit}>
        <label htmlFor="image-model">Image model</label>
        <select
          id="image-model"
          value={imageModel}
          onChange={(event) => onModelChange(event.target.value)}
        >
          {DEFAULT_IMAGE_MODELS.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>

        <label htmlFor="image-prompt">Prompt</label>
        <textarea
          id="image-prompt"
          value={imagePrompt}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder="Describe the image..."
          rows={4}
        />

        <label htmlFor="negative-prompt">Negative prompt</label>
        <textarea
          id="negative-prompt"
          value={negativePrompt}
          onChange={(event) => onNegativePromptChange(event.target.value)}
          placeholder="Things to avoid..."
          rows={3}
        />

        <div className="segmented" role="radiogroup" aria-label="Image size">
          {IMAGE_SIZES.map((size) => (
            <button
              key={size.label}
              className={size.label === imageSize.label ? "active" : ""}
              onClick={() => onSizeChange(size)}
              type="button"
            >
              {size.label}
            </button>
          ))}
        </div>

        <button className="primary-button" disabled={isGenerating || !imagePrompt.trim()} type="submit">
          {isGenerating ? <Loader2 className="spin" aria-hidden="true" /> : <ImageIcon aria-hidden="true" />}
          <span>{isGenerating ? "Generating" : "Generate"}</span>
        </button>
      </form>

      <section className="image-gallery" aria-label="Generated images">
        {images.length === 0 ? (
          <div className="empty-state">
            <ImageIcon aria-hidden="true" />
            <h2>No images yet</h2>
            <p>Generated images will appear here and save to Supabase Storage.</p>
          </div>
        ) : (
          images.map((image) => (
            <article key={image.id} className="image-card">
              {image.signed_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image.signed_url} alt={image.prompt} />
              ) : (
                <div className="image-placeholder">
                  <AlertTriangle aria-hidden="true" />
                </div>
              )}
              <div>
                <strong>{image.model_id}</strong>
                <p>{image.prompt}</p>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

function StatusIcon({ status }: { status: CompareStatus }) {
  if (status === "completed") {
    return <Check className="status-icon complete" aria-label="Completed" />;
  }

  if (status === "failed") {
    return <AlertTriangle className="status-icon failed" aria-label="Failed" />;
  }

  if (status === "streaming") {
    return <Loader2 className="status-icon spin" aria-label="Streaming" />;
  }

  return <Sparkles className="status-icon idle" aria-label="Idle" />;
}

function modelLabel(modelId?: string | null) {
  if (!modelId) {
    return "Assistant";
  }

  return modelId.split("/").at(-1) ?? modelId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: SseEvent) => void
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let separator = buffer.indexOf("\n\n");

    while (separator !== -1) {
      const rawEvent = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      separator = buffer.indexOf("\n\n");

      const parsed = parseSseEvent(rawEvent);
      if (parsed) {
        onEvent(parsed);
      }
    }
  }
}

function parseSseEvent(rawEvent: string): SseEvent | null {
  const lines = rawEvent.split("\n");
  const event = lines
    .find((line) => line.startsWith("event:"))
    ?.replace(/^event:\s*/, "");
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s*/, ""))
    .join("\n");

  if (!event || !data) {
    return null;
  }

  try {
    return { event, data: JSON.parse(data) };
  } catch {
    return null;
  }
}
