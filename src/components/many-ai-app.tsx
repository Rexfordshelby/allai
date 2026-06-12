"use client";

import {
  AlertTriangle,
  ArrowUp,
  ChevronDown,
  Check,
  Copy,
  ExternalLink,
  Folder,
  Image as ImageIcon,
  Layers3,
  Loader2,
  Mic,
  PanelLeft,
  Paperclip,
  Plus,
  Search,
  Settings,
  Sparkles,
  ThumbsUp,
  UserRound,
  X
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
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

export function ManyAiApp({
  cloudEnabled = false
}: {
  user: UserSummary;
  cloudEnabled?: boolean;
}) {
  const supabase = useMemo(
    () => (cloudEnabled ? createBrowserSupabaseClient() : null),
    [cloudEnabled]
  );
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
    if (!supabase) {
      setConversations([]);
      return;
    }

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

  const modelLookup = useMemo(() => {
    return new Map(models.map((model) => [model.id, model]));
  }, [models]);

  function startNewConversation(nextMode = mode) {
    setSelectedConversationId(null);
    setMode(nextMode);
    setMessages([]);
    setPrompt("");
    setCompareResults({});
    setStatusMessage(null);
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

      if (cloudEnabled) {
        await refreshConversations();
      }
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
      if (cloudEnabled) {
        await refreshConversations();
      }
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
      if (cloudEnabled) {
        await refreshConversations();
      }
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
  const recentTitles =
    conversations.length > 0
      ? conversations.slice(0, 5).map((conversation) => conversation.title)
      : [
          "Q2 Marketing Strategy",
          "Product Roadmap Review",
          "User Research Insights",
          "Competitive Analysis",
          "Brand Positioning"
        ];

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Conversation history">
        <div className="sidebar-head">
          <strong className="luma-brand">Luma</strong>
          <button
            className="sidebar-collapse"
            onClick={() => startNewConversation(mode)}
            title="New conversation"
            aria-label="New conversation"
          >
            <PanelLeft aria-hidden="true" />
          </button>
        </div>

        <nav className="luma-nav" aria-label="Workspace navigation">
          <button
            className={mode === "chat" ? "active primary" : "primary"}
            onClick={() => startNewConversation("chat")}
            type="button"
          >
            <span className="nav-icon">
              <Plus aria-hidden="true" />
            </span>
            <span>New Chat</span>
          </button>
          <button
            className={mode === "compare" ? "active" : ""}
            onClick={() => startNewConversation("compare")}
            type="button"
          >
            <Folder aria-hidden="true" />
            <span>Library</span>
          </button>
          <button
            className={mode === "image" ? "active" : ""}
            onClick={() => startNewConversation("image")}
            type="button"
          >
            <ImageIcon aria-hidden="true" />
            <span>Projects</span>
          </button>
          <button type="button">
            <Mic aria-hidden="true" />
            <span>Voice</span>
          </button>
          <button type="button">
            <Settings aria-hidden="true" />
            <span>Settings</span>
          </button>
        </nav>

        <section className="recent-section" aria-label="Recent chats">
          <p>Recent</p>
          {recentTitles.map((title, index) => (
            <button key={title} className={index === 0 ? "active" : ""} type="button">
              {title}
            </button>
          ))}
          <button type="button">View all</button>
        </section>

        <div className="account-row">
          <div className="orb-avatar" aria-hidden="true" />
          <div className="account-copy">
            <strong>Alex Morgan</strong>
            <small>Pro Plan</small>
          </div>
          <span className="account-dot" aria-hidden="true" />
        </div>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div className="model-title">
            <span>Luma 2.0</span>
            <ChevronDown aria-hidden="true" />
          </div>
          <div className="top-actions">
            <button title="Search" aria-label="Search" type="button">
              <Search aria-hidden="true" />
            </button>
            <button title="AI tools" aria-label="AI tools" type="button">
              <Sparkles aria-hidden="true" />
            </button>
            <div className="top-orb" aria-hidden="true" />
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

        <div className="workspace-body">
          {mode === "chat" ? (
            <ChatPanel
              messages={messages}
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
        </div>
      </section>
    </main>
  );
}

function ChatPanel({
  messages,
  prompt,
  onPromptChange,
  isSending,
  onSubmit
}: {
  messages: ChatMessage[];
  prompt: string;
  onPromptChange: (value: string) => void;
  isSending: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const suggestionCards = [
    "Create a campaign brief for our summer product launch",
    "Analyze competitors and share key positioning insights",
    "Draft social media content ideas for Product X",
    "Show Q2 roadmap milestones in a timeline view"
  ];

  return (
    <div className="chat-layout">
      <section className="chat-thread" aria-label="Chat messages">
        {messages.length === 0 ? (
          <div className="luma-demo-content">
            <div className="user-prompt-bubble">
              Can you summarize our Q2 marketing strategy and highlight the top
              3 priorities?
            </div>

            <div className="assistant-intro">
              <div className="orb-avatar small" aria-hidden="true" />
              <p>
                Here&apos;s a summary of your Q2 marketing strategy with the top
                3 priorities.
              </p>
            </div>

            <article className="strategy-card">
              <header>
                <span className="tiny-spark">
                  <Sparkles aria-hidden="true" />
                </span>
                <h2>Q2 Marketing Strategy Overview</h2>
              </header>
              <p>
                Our Q2 strategy focuses on accelerating brand awareness,
                improving product-led growth, and optimizing the customer
                journey.
              </p>
              <div className="strategy-list">
                <StrategyItem
                  number="1"
                  title="Boost Brand Awareness"
                  copy="Expand reach through content, partnerships, and thought leadership."
                />
                <StrategyItem
                  number="2"
                  title="Drive Product-Led Growth"
                  copy="Enhance onboarding and activation to increase user engagement."
                />
                <StrategyItem
                  number="3"
                  title="Optimize Customer Journey"
                  copy="Refine touchpoints across the funnel to improve conversion and retention."
                />
              </div>
              <footer>
                <span>Sources: Q2 Strategy Doc, Marketing Plan Apr 2024</span>
                <div>
                  <button type="button" aria-label="Copy summary">
                    <Copy aria-hidden="true" />
                  </button>
                  <button type="button" aria-label="Like summary">
                    <ThumbsUp aria-hidden="true" />
                  </button>
                </div>
              </footer>
            </article>

            <div className="suggestion-grid" aria-label="Suggested prompts">
              {suggestionCards.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => onPromptChange(suggestion)}
                >
                  <span>{suggestion}</span>
                  <ExternalLink aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="live-thread">
            {messages.map((message) => (
              <article
                key={message.id ?? `${message.role}-${message.created_at}`}
                className={`message ${message.role}`}
              >
                <div className="message-avatar">
                  {message.role === "user" ? (
                    <UserRound aria-hidden="true" />
                  ) : (
                    <div className="orb-avatar small" aria-hidden="true" />
                  )}
                </div>
                <div className="message-body">
                  <div className="message-meta">
                    <div>
                      <span>
                        {message.role === "user"
                          ? "You"
                          : modelLabel(message.model_id)}
                      </span>
                      {message.model_id ? <small>{message.model_id}</small> : null}
                    </div>
                    <time>{formatMessageTime(message.created_at)}</time>
                  </div>
                  <p>{message.content || "..."}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <form className="luma-composer" onSubmit={onSubmit}>
        <button type="button" aria-label="Attach file">
          <Paperclip aria-hidden="true" />
        </button>
        <textarea
          id="chat-prompt"
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder="Ask anything..."
          rows={1}
        />
        <button type="button" aria-label="Voice input">
          <Mic aria-hidden="true" />
        </button>
        <button
          className="send-orb"
          disabled={isSending || !prompt.trim()}
          type="submit"
          aria-label="Send message"
        >
          {isSending ? (
            <Loader2 className="spin" aria-hidden="true" />
          ) : (
            <ArrowUp aria-hidden="true" />
          )}
        </button>
      </form>
    </div>
  );
}

function StrategyItem({
  number,
  title,
  copy
}: {
  number: string;
  title: string;
  copy: string;
}) {
  return (
    <div className="strategy-item">
      <span>{number}</span>
      <div>
        <strong>{title}</strong>
        <p>{copy}</p>
      </div>
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

function formatMessageTime(createdAt?: string) {
  if (!createdAt) {
    return "Now";
  }

  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(createdAt));
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
