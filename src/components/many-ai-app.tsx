"use client";

import {
  AlertTriangle,
  ArrowUp,
  Bot,
  Check,
  Image as ImageIcon,
  Layers3,
  Loader2,
  Menu,
  MessageSquare,
  Mic,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
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

type GuestThread = {
  id: string;
  title: string;
  mode: AppMode;
  updatedAt: string;
  messages: ChatMessage[];
  compareResults?: Record<string, CompareColumn>;
  images?: ImageGeneration[];
};

const GUEST_THREADS_STORAGE_KEY = "manyai.guestThreads.v1";

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
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_TEXT_MODELS[0].id);
  const [compareModels, setCompareModels] = useState<string[]>(
    DEFAULT_COMPARE_MODELS
  );
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [guestThreads, setGuestThreads] = useState<GuestThread[]>([]);
  const [search, setSearch] = useState("");
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const [selectedGuestThreadId, setSelectedGuestThreadId] = useState<
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
    setModelsLoading(true);
    setModelsError(null);

    try {
      const response = await fetch("/api/models");
      if (!response.ok) {
        throw new Error("Could not load OpenRouter models.");
      }

      const payload = (await response.json()) as { models?: ModelOption[] };
      const nextModels = payload.models?.length ? payload.models : DEFAULT_TEXT_MODELS;
      const nextIds = new Set(nextModels.map((model) => model.id));

      setModels(nextModels);
      setSelectedModel((current) =>
        nextIds.has(current) ? current : nextModels[0].id
      );
      setCompareModels((current) => {
        const validCurrent = current.filter((model) => nextIds.has(model));
        return validCurrent.length >= 2
          ? validCurrent.slice(0, MAX_COMPARE_MODELS)
          : nextModels.slice(0, 3).map((model) => model.id);
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Model list failed to load.";
      setModelsError(message);
      setStatusMessage(message);
      setModels(DEFAULT_TEXT_MODELS);
    } finally {
      setModelsLoading(false);
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

  useEffect(() => {
    if (cloudEnabled || typeof window === "undefined") {
      return;
    }

    const stored = window.localStorage.getItem(GUEST_THREADS_STORAGE_KEY);
    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored) as GuestThread[];
      if (Array.isArray(parsed)) {
        setGuestThreads(parsed.slice(0, 50));
      }
    } catch {
      window.localStorage.removeItem(GUEST_THREADS_STORAGE_KEY);
    }
  }, [cloudEnabled]);

  useEffect(() => {
    if (cloudEnabled || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      GUEST_THREADS_STORAGE_KEY,
      JSON.stringify(guestThreads.slice(0, 50))
    );
  }, [cloudEnabled, guestThreads]);

  const modelLookup = useMemo(() => {
    return new Map(models.map((model) => [model.id, model]));
  }, [models]);

  const filteredGuestThreads = useMemo(() => {
    const query = search.trim().toLowerCase();
    return guestThreads
      .filter((thread) => !query || thread.title.toLowerCase().includes(query))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [guestThreads, search]);

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return conversations.filter(
      (conversation) =>
        !query || conversation.title.toLowerCase().includes(query)
    );
  }, [conversations, search]);

  function startNewConversation(nextMode = mode) {
    setSelectedConversationId(null);
    setSelectedGuestThreadId(null);
    setMode(nextMode);
    setMessages([]);
    setPrompt("");
    setCompareResults({});
    setStatusMessage(null);
  }

  async function loadCloudConversation(conversationId: string) {
    if (!supabase) {
      return;
    }

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
    setSelectedGuestThreadId(null);
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
    } else {
      setCompareResults({});
    }
  }

  function loadGuestThread(thread: GuestThread) {
    setSelectedConversationId(null);
    setSelectedGuestThreadId(thread.id);
    setMode(thread.mode);
    setMessages(thread.messages ?? []);
    setCompareResults(thread.compareResults ?? {});
    setStatusMessage(null);

    if (thread.images?.length) {
      setImages((current) => mergeImages(thread.images ?? [], current));
    }
  }

  function removeGuestThread(threadId: string) {
    setGuestThreads((current) => current.filter((thread) => thread.id !== threadId));
    if (selectedGuestThreadId === threadId) {
      startNewConversation(mode);
    }
  }

  function ensureGuestThreadId(nextMode: AppMode, firstPrompt: string) {
    if (cloudEnabled) {
      return null;
    }

    const currentThread = selectedGuestThreadId
      ? guestThreads.find((thread) => thread.id === selectedGuestThreadId)
      : null;

    if (currentThread?.mode === nextMode) {
      return currentThread.id;
    }

    const id = `guest-${Date.now()}`;
    setSelectedGuestThreadId(id);
    upsertGuestThread(id, nextMode, titleFromPrompt(firstPrompt), {});
    return id;
  }

  function upsertGuestThread(
    threadId: string,
    nextMode: AppMode,
    title: string,
    patch: Partial<Omit<GuestThread, "id" | "title" | "mode" | "updatedAt">>
  ) {
    if (cloudEnabled) {
      return;
    }

    const now = new Date().toISOString();
    setGuestThreads((current) => {
      const existing = current.find((thread) => thread.id === threadId);
      const nextThread: GuestThread = {
        id: threadId,
        title: existing?.title ?? title,
        mode: nextMode,
        updatedAt: now,
        messages: patch.messages ?? existing?.messages ?? [],
        compareResults: patch.compareResults ?? existing?.compareResults,
        images: patch.images ?? existing?.images
      };

      return [
        nextThread,
        ...current.filter((thread) => thread.id !== threadId)
      ].slice(0, 50);
    });
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

    const startingMessages = messages;
    const guestThreadId = ensureGuestThreadId("chat", trimmed);
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
    const optimisticMessages = [
      ...startingMessages,
      userMessage,
      assistantMessage
    ];
    const history = buildHistory();
    let assistantContent = "";

    setIsSending(true);
    setStatusMessage(null);
    setPrompt("");
    setMessages(optimisticMessages);
    if (guestThreadId) {
      upsertGuestThread(guestThreadId, "chat", titleFromPrompt(trimmed), {
        messages: optimisticMessages
      });
    }

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: cloudEnabled ? selectedConversationId : null,
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        assistantContent += decoder.decode(value, { stream: true });
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? { ...message, content: assistantContent }
              : message
          )
        );
      }

      const finalMessages = optimisticMessages.map((message) =>
        message.id === assistantId
          ? { ...message, content: assistantContent }
          : message
      );
      if (guestThreadId) {
        upsertGuestThread(guestThreadId, "chat", titleFromPrompt(trimmed), {
          messages: finalMessages
        });
      }

      if (cloudEnabled) {
        await refreshConversations();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chat failed.";
      const finalMessages = optimisticMessages.map((item) =>
        item.id === assistantId ? { ...item, content: message } : item
      );
      setMessages(finalMessages);
      setStatusMessage(message);
      if (guestThreadId) {
        upsertGuestThread(guestThreadId, "chat", titleFromPrompt(trimmed), {
          messages: finalMessages
        });
      }
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
    const guestThreadId = ensureGuestThreadId("compare", trimmed);
    const userMessage: ChatMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString()
    };
    const nextMessages = [...messages, userMessage];
    const nextResults: Record<string, CompareColumn> = Object.fromEntries(
      compareModels.map((model) => [
        model,
        {
          model,
          content: "",
          status: "idle" as CompareStatus
        }
      ])
    );

    setIsSending(true);
    setStatusMessage(null);
    setPrompt("");
    setMessages(nextMessages);
    setCompareResults(nextResults);
    if (guestThreadId) {
      upsertGuestThread(guestThreadId, "compare", titleFromPrompt(trimmed), {
        messages: nextMessages,
        compareResults: nextResults
      });
    }

    try {
      const response = await fetch("/api/chat/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: cloudEnabled ? selectedConversationId : null,
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

      const liveResults = { ...nextResults };

      await readSse(response.body, ({ event, data }) => {
        if (
          event === "meta" &&
          isRecord(data) &&
          typeof data.conversationId === "string"
        ) {
          setSelectedConversationId(data.conversationId);
          return;
        }

        if (!isRecord(data) || typeof data.model !== "string") {
          return;
        }

        const model = data.model;
        const current = liveResults[model] ?? {
          model,
          content: "",
          status: "idle" as CompareStatus
        };

        if (event === "token" && typeof data.token === "string") {
          liveResults[model] = {
            ...current,
            status: "streaming",
            content: `${current.content}${data.token}`
          };
        }

        if (event === "status" && typeof data.status === "string") {
          liveResults[model] = {
            ...current,
            status: data.status as CompareStatus
          };
        }

        if (event === "error" && typeof data.error === "string") {
          liveResults[model] = {
            ...current,
            status: "failed",
            error: data.error
          };
        }

        setCompareResults({ ...liveResults });
      });

      if (guestThreadId) {
        upsertGuestThread(guestThreadId, "compare", titleFromPrompt(trimmed), {
          messages: nextMessages,
          compareResults: liveResults
        });
      }

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

    const guestThreadId = ensureGuestThreadId("image", trimmed);
    setIsGenerating(true);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId:
            cloudEnabled && mode === "image" ? selectedConversationId : null,
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
        const generatedImage = payload.image as ImageGeneration;
        setImages((current) => [generatedImage, ...current]);
        if (guestThreadId) {
          const thread = guestThreads.find((item) => item.id === guestThreadId);
          upsertGuestThread(guestThreadId, "image", titleFromPrompt(trimmed), {
            images: [generatedImage, ...(thread?.images ?? [])]
          });
        }
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
  const selectedModelInfo =
    models.find((model) => model.id === selectedModel) ?? models[0];

  return (
    <main className="app-shell functional-shell">
      <aside className="sidebar app-sidebar" aria-label="Workspace">
        <div className="sidebar-head">
          <strong className="luma-brand">ManyAI</strong>
          <button
            className="sidebar-collapse"
            onClick={() => startNewConversation(mode)}
            title="New conversation"
            aria-label="New conversation"
            type="button"
          >
            <Plus aria-hidden="true" />
          </button>
        </div>

        <nav className="luma-nav mode-nav" aria-label="Workspace mode">
          <button
            className={mode === "chat" ? "active primary" : "primary"}
            onClick={() => startNewConversation("chat")}
            type="button"
          >
            <span className="nav-icon">
              <MessageSquare aria-hidden="true" />
            </span>
            <span>Chat</span>
          </button>
          <button
            className={mode === "compare" ? "active" : ""}
            onClick={() => startNewConversation("compare")}
            type="button"
          >
            <Layers3 aria-hidden="true" />
            <span>Compare</span>
          </button>
          <button
            className={mode === "image" ? "active" : ""}
            onClick={() => startNewConversation("image")}
            type="button"
          >
            <ImageIcon aria-hidden="true" />
            <span>Images</span>
          </button>
          <button type="button" aria-label="Voice tools" title="Voice tools">
            <Mic aria-hidden="true" />
            <span>Voice</span>
          </button>
          <button type="button" aria-label="Settings" title="Settings">
            <Settings aria-hidden="true" />
            <span>Settings</span>
          </button>
        </nav>

        <label className="sidebar-search">
          <Search aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search history"
          />
        </label>

        <section className="recent-section" aria-label="Recent work">
          <div className="recent-head">
            <p>Recent</p>
            <button
              type="button"
              onClick={() => {
                setGuestThreads([]);
                startNewConversation(mode);
              }}
              disabled={cloudEnabled || guestThreads.length === 0}
            >
              Clear
            </button>
          </div>

          {cloudEnabled
            ? filteredConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  className={
                    conversation.id === selectedConversationId ? "active" : ""
                  }
                  type="button"
                  onClick={() => void loadCloudConversation(conversation.id)}
                >
                  <strong>{conversation.title}</strong>
                  <small>{conversation.mode}</small>
                </button>
              ))
            : filteredGuestThreads.map((thread) => (
                <div key={thread.id} className="thread-row">
                  <button
                    className={thread.id === selectedGuestThreadId ? "active" : ""}
                    type="button"
                    onClick={() => loadGuestThread(thread)}
                  >
                    <strong>{thread.title}</strong>
                    <small>{thread.mode}</small>
                  </button>
                  <button
                    className="thread-delete"
                    type="button"
                    onClick={() => removeGuestThread(thread.id)}
                    aria-label={`Delete ${thread.title}`}
                  >
                    <X aria-hidden="true" />
                  </button>
                </div>
              ))}

          {cloudEnabled && filteredConversations.length === 0 ? (
            <p className="empty-history">No saved cloud conversations yet.</p>
          ) : null}
          {!cloudEnabled && filteredGuestThreads.length === 0 ? (
            <p className="empty-history">Your chats will appear here.</p>
          ) : null}
        </section>

        <div className="account-row">
          <div className="orb-avatar" aria-hidden="true" />
          <div className="account-copy">
            <strong>{cloudEnabled ? "Cloud workspace" : "Guest workspace"}</strong>
            <small>{models.length} text models available</small>
          </div>
          <span className="account-dot" aria-hidden="true" />
        </div>
      </aside>

      <section className="workspace app-workspace">
        <header className="workspace-header app-header">
          <div className="model-title">
            <span>{modeLabel(mode)}</span>
            <small>
              {mode === "chat"
                ? modelLabel(selectedModel)
                : mode === "compare"
                  ? `${compareModels.length} selected`
                  : imageModel}
            </small>
          </div>

          <div className="mode-switch" role="tablist" aria-label="Mode switcher">
            <button
              className={mode === "chat" ? "active" : ""}
              onClick={() => setMode("chat")}
              type="button"
            >
              <MessageSquare aria-hidden="true" />
              <span>Chat</span>
            </button>
            <button
              className={mode === "compare" ? "active" : ""}
              onClick={() => setMode("compare")}
              type="button"
            >
              <Layers3 aria-hidden="true" />
              <span>Compare</span>
            </button>
            <button
              className={mode === "image" ? "active" : ""}
              onClick={() => setMode("image")}
              type="button"
            >
              <ImageIcon aria-hidden="true" />
              <span>Images</span>
            </button>
          </div>

          <div className="top-actions">
            <button
              title="Reload models"
              aria-label="Reload models"
              type="button"
              onClick={() => void refreshModels()}
            >
              {modelsLoading ? (
                <Loader2 className="spin" aria-hidden="true" />
              ) : (
                <RefreshCw aria-hidden="true" />
              )}
            </button>
            <button title="Menu" aria-label="Menu" type="button">
              <Menu aria-hidden="true" />
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

        <div className="workspace-body functional-body">
          {mode === "chat" ? (
            <ChatPanel
              messages={messages}
              models={models}
              modelsLoading={modelsLoading}
              modelsError={modelsError}
              selectedModel={selectedModel}
              selectedModelInfo={selectedModelInfo}
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
        </div>
      </section>
    </main>
  );
}

function ChatPanel({
  messages,
  models,
  modelsLoading,
  modelsError,
  selectedModel,
  selectedModelInfo,
  onModelChange,
  prompt,
  onPromptChange,
  isSending,
  onSubmit
}: {
  messages: ChatMessage[];
  models: ModelOption[];
  modelsLoading: boolean;
  modelsError: string | null;
  selectedModel: string;
  selectedModelInfo?: ModelOption;
  onModelChange: (model: string) => void;
  prompt: string;
  onPromptChange: (value: string) => void;
  isSending: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const suggestionCards = [
    "Compare GPT, Claude, and Gemini on this product idea",
    "Write a detailed launch plan for my AI app",
    "Explain this code and suggest improvements",
    "Create image prompts for a futuristic dashboard"
  ];

  return (
    <div className="chat-layout working-chat">
      <section className="control-panel chat-controls" aria-label="Chat controls">
        <label className="control-field" htmlFor="chat-model">
          <span>Chat model</span>
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
        </label>
        <div className="model-readout">
          <Bot aria-hidden="true" />
          <div>
            <strong>{selectedModelInfo?.name ?? selectedModel}</strong>
            <small>
              {modelsLoading
                ? "Loading OpenRouter models..."
                : modelsError
                  ? "Using fallback models"
                  : `${models.length} OpenRouter models loaded`}
            </small>
          </div>
        </div>
      </section>

      <section className="chat-thread" aria-label="Chat messages">
        {messages.length === 0 ? (
          <div className="real-empty">
            <div className="empty-orb">
              <Sparkles aria-hidden="true" />
            </div>
            <h1>Ask any model from one place</h1>
            <div className="quick-prompts" aria-label="Suggested prompts">
              {suggestionCards.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => onPromptChange(suggestion)}
                >
                  {suggestion}
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
                    <Bot aria-hidden="true" />
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

      <form className="luma-composer working-composer" onSubmit={onSubmit}>
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
    <div className="compare-layout working-compare">
      <aside className="model-picker" aria-label="Compare model picker">
        <div className="section-title">
          <Layers3 aria-hidden="true" />
          <span>Models</span>
          <small>{selectedModels.length}/{MAX_COMPARE_MODELS}</small>
        </div>
        <div className="model-options">
          {models.slice(0, 60).map((model) => {
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
              <p>{column.error ?? (column.content || "Waiting for your prompt.")}</p>
            </article>
          ))}
        </div>

        <form className="composer compare-composer" onSubmit={onSubmit}>
          <label htmlFor="compare-prompt">Prompt for selected models</label>
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
            {isSending ? (
              <Loader2 className="spin" aria-hidden="true" />
            ) : (
              <Sparkles aria-hidden="true" />
            )}
            <span>{isSending ? "Comparing" : "Compare models"}</span>
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
    <div className="image-layout working-images">
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

        <button
          className="primary-button"
          disabled={isGenerating || !imagePrompt.trim()}
          type="submit"
        >
          {isGenerating ? (
            <Loader2 className="spin" aria-hidden="true" />
          ) : (
            <ImageIcon aria-hidden="true" />
          )}
          <span>{isGenerating ? "Generating" : "Generate image"}</span>
        </button>
      </form>

      <section className="image-gallery" aria-label="Generated images">
        {images.length === 0 ? (
          <div className="empty-state">
            <ImageIcon aria-hidden="true" />
            <h2>No images yet</h2>
            <p>Generated images appear here after Pollinations finishes.</p>
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

function modeLabel(mode: AppMode) {
  if (mode === "compare") {
    return "Compare models";
  }

  if (mode === "image") {
    return "Image studio";
  }

  return "Chat";
}

function modelLabel(modelId?: string | null) {
  if (!modelId) {
    return "Assistant";
  }

  return modelId.split("/").at(-1) ?? modelId;
}

function titleFromPrompt(prompt: string) {
  const title = prompt.trim().replace(/\s+/g, " ").slice(0, 54);
  return title.length >= 54 ? `${title.slice(0, 51)}...` : title || "New chat";
}

function mergeImages(primary: ImageGeneration[], secondary: ImageGeneration[]) {
  const seen = new Set<string>();
  return [...primary, ...secondary].filter((image) => {
    if (seen.has(image.id)) {
      return false;
    }

    seen.add(image.id);
    return true;
  });
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
