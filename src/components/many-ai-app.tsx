"use client";

import {
  AlertTriangle,
  ArrowUp,
  Bot,
  Check,
  Download,
  FileText,
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
  SlidersHorizontal,
  Sparkles,
  Upload,
  UserRound,
  X
} from "lucide-react";
import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
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
const PROFILE_STORAGE_KEY = "lumaai.profile.v1";
const APP_SETTINGS_STORAGE_KEY = "lumaai.settings.v1";
const APP_DISPLAY_NAME = "Luma AI";

type ActivePanel = "menu" | "settings" | "profile" | null;

type UserProfile = {
  name: string;
  role: string;
  tone: string;
  memory: string;
};

type AppSettings = {
  compactUi: boolean;
  reduceMotion: boolean;
  showModelDetails: boolean;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
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
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [isListening, setIsListening] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const [profile, setProfile] = useState<UserProfile>({
    name: "Alex Morgan",
    role: "Builder",
    tone: "Clear, professional, and practical",
    memory: "Prefer concise answers with useful next steps."
  });
  const [appSettings, setAppSettings] = useState<AppSettings>({
    compactUi: true,
    reduceMotion: false,
    showModelDetails: false
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
    if (typeof window === "undefined") {
      return;
    }

    const stored = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!stored) {
      return;
    }

    try {
      setProfile({ ...profile, ...(JSON.parse(stored) as Partial<UserProfile>) });
    } catch {
      window.localStorage.removeItem(PROFILE_STORAGE_KEY);
    }
    // Run once on mount; profile defaults are the fallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
    if (!stored) {
      return;
    }

    try {
      setAppSettings({
        compactUi: true,
        reduceMotion: false,
        showModelDetails: false,
        ...(JSON.parse(stored) as Partial<AppSettings>)
      });
    } catch {
      window.localStorage.removeItem(APP_SETTINGS_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      APP_SETTINGS_STORAGE_KEY,
      JSON.stringify(appSettings)
    );
  }, [appSettings]);

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

  function appendToPrompt(text: string) {
    setPrompt((current) => {
      const separator = current.trim() ? "\n\n" : "";
      return `${current}${separator}${text}`;
    });
    if (mode === "image") {
      setImagePrompt((current) => {
        const separator = current.trim() ? "\n\n" : "";
        return `${current}${separator}${text}`;
      });
    }
  }

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) {
      return;
    }

    const summaries: string[] = [];

    for (const file of files.slice(0, 4)) {
      const isText =
        file.type.startsWith("text/") ||
        /\.(md|txt|csv|json|ts|tsx|js|jsx|css|html)$/i.test(file.name);
      let content = "";

      if (isText && file.size <= 120_000) {
        content = await file.text();
      }

      summaries.push(
        [
          `Attached file: ${file.name}`,
          `Type: ${file.type || "unknown"}`,
          `Size: ${Math.round(file.size / 1024)} KB`,
          content ? `Content:\n${content.slice(0, 7000)}` : "Content was not embedded; describe how to use this file."
        ].join("\n")
      );
    }

    setAttachedFiles((current) => [
      ...summaries.map((summary) => summary.split("\n")[0].replace("Attached file: ", "")),
      ...current
    ].slice(0, 8));
    appendToPrompt(summaries.join("\n\n---\n\n"));
    setStatusMessage(`${files.length} file${files.length === 1 ? "" : "s"} attached to the prompt.`);
    event.target.value = "";
  }

  function startVoiceInput() {
    if (typeof window === "undefined") {
      return;
    }

    const SpeechRecognition =
      (window as typeof window & {
        SpeechRecognition?: new () => SpeechRecognitionLike;
        webkitSpeechRecognition?: new () => SpeechRecognitionLike;
      }).SpeechRecognition ??
      (window as typeof window & {
        webkitSpeechRecognition?: new () => SpeechRecognitionLike;
      }).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setStatusMessage("Voice input is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) {
        appendToPrompt(transcript);
      }
    };
    recognition.onerror = () => {
      setStatusMessage("Voice input could not hear anything. Try again.");
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
    setIsListening(true);
    recognition.start();
  }

  function exportCurrentChat() {
    const markdown = [
      `# ${APP_DISPLAY_NAME} Chat Export`,
      "",
      `Profile: ${profile.name} (${profile.role})`,
      `Mode: ${modeLabel(mode)}`,
      `Exported: ${new Date().toLocaleString()}`,
      "",
      ...messages.map((message) =>
        [
          `## ${message.role === "user" ? "You" : modelLabel(message.model_id)}`,
          "",
          message.content || "..."
        ].join("\n")
      )
    ].join("\n");

    downloadTextFile("luma-ai-chat.md", markdown);
  }

  function exportAllHistory() {
    downloadTextFile(
      "luma-ai-history.json",
      JSON.stringify(
        {
          app: APP_DISPLAY_NAME,
          exportedAt: new Date().toISOString(),
          profile,
          guestThreads,
          current: { mode, messages, compareResults, images }
        },
        null,
        2
      )
    );
  }

  function downloadImage(image: ImageGeneration) {
    if (!image.signed_url) {
      setStatusMessage("This image has no downloadable URL yet.");
      return;
    }

    const link = document.createElement("a");
    link.href = image.signed_url;
    link.download = `luma-ai-${image.id}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function clearAttachments() {
    setAttachedFiles([]);
    setStatusMessage("Attachment chips cleared. Embedded prompt text is still editable.");
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
          history: [{ role: "system", content: profileContext(profile) }, ...history]
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
          history: [{ role: "system", content: profileContext(profile) }, ...history]
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
    <main
      className={[
        "app-shell functional-shell",
        appSettings.compactUi ? "compact-ui" : "",
        appSettings.reduceMotion ? "reduce-motion" : ""
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        multiple
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => void handleFileUpload(event)}
      />
      <aside className="sidebar app-sidebar" aria-label="Workspace">
        <div className="sidebar-head">
          <button
            className="brand-lockup"
            type="button"
            onClick={() => setActivePanel("profile")}
            aria-label="Open profile"
          >
            <span className="brand-logo" aria-hidden="true" />
            <span>
              <strong>{APP_DISPLAY_NAME}</strong>
              <small>{profile.role}</small>
            </span>
          </button>
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
            aria-label="Chat"
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
            aria-label="Compare"
            type="button"
          >
            <Layers3 aria-hidden="true" />
            <span>Compare</span>
          </button>
          <button
            className={mode === "image" ? "active" : ""}
            onClick={() => startNewConversation("image")}
            aria-label="Images"
            type="button"
          >
            <ImageIcon aria-hidden="true" />
            <span>Images</span>
          </button>
          <button
            type="button"
            aria-label="Voice tools"
            title="Voice tools"
            onClick={startVoiceInput}
            className={isListening ? "listening" : ""}
          >
            <Mic aria-hidden="true" />
            <span>Voice</span>
          </button>
          <button
            type="button"
            aria-label="Settings"
            title="Settings"
            onClick={() => setActivePanel("settings")}
          >
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
            <strong>{profile.name}</strong>
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
            <button
              title="Menu"
              aria-label="Menu"
              type="button"
              onClick={() => setActivePanel("menu")}
            >
              <Menu aria-hidden="true" />
            </button>
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
              onAttach={() => fileInputRef.current?.click()}
              onVoice={startVoiceInput}
              isListening={isListening}
              attachedFiles={attachedFiles}
              showModelDetails={appSettings.showModelDetails}
              onClearAttachments={clearAttachments}
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
              onDownloadImage={downloadImage}
              onSubmit={submitImage}
            />
          ) : null}
        </div>
      </section>

      <ActionPanel
        activePanel={activePanel}
        profile={profile}
        appSettings={appSettings}
        messages={messages}
        guestThreads={guestThreads}
        attachedFiles={attachedFiles}
        onClose={() => setActivePanel(null)}
        onProfileChange={setProfile}
        onSettingsChange={setAppSettings}
        onExportChat={exportCurrentChat}
        onExportHistory={exportAllHistory}
        onAttach={() => fileInputRef.current?.click()}
        onVoice={startVoiceInput}
        onClearAttachments={clearAttachments}
        onOpenSettings={() => setActivePanel("settings")}
        onOpenProfile={() => setActivePanel("profile")}
        onNewChat={() => {
          startNewConversation("chat");
          setActivePanel(null);
        }}
        onClearHistory={() => {
          setGuestThreads([]);
          setActivePanel(null);
        }}
      />
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
  onAttach,
  onVoice,
  isListening,
  attachedFiles,
  showModelDetails,
  onClearAttachments,
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
  onAttach: () => void;
  onVoice: () => void;
  isListening: boolean;
  attachedFiles: string[];
  showModelDetails: boolean;
  onClearAttachments: () => void;
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
      <section
        className={`control-panel chat-controls ${showModelDetails ? "" : "details-collapsed"}`}
        aria-label="Chat controls"
      >
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
        {showModelDetails ? (
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
        ) : null}
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

      {attachedFiles.length ? (
        <div className="attachment-strip" aria-label="Attached files">
          {attachedFiles.map((file) => (
            <span key={file}>
              <FileText aria-hidden="true" />
              {file}
            </span>
          ))}
          <button type="button" onClick={onClearAttachments}>
            Clear
          </button>
        </div>
      ) : null}

      <form className="luma-composer working-composer" onSubmit={onSubmit}>
        <button type="button" aria-label="Attach file" onClick={onAttach}>
          <Paperclip aria-hidden="true" />
        </button>
        <textarea
          id="chat-prompt"
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder="Ask anything..."
          rows={1}
        />
        <button
          type="button"
          aria-label="Voice input"
          onClick={onVoice}
          className={isListening ? "listening" : ""}
        >
          {isListening ? (
            <Loader2 className="spin" aria-hidden="true" />
          ) : (
            <Mic aria-hidden="true" />
          )}
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
  onDownloadImage,
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
  onDownloadImage: (image: ImageGeneration) => void;
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
                <button
                  className="download-image-button"
                  type="button"
                  onClick={() => onDownloadImage(image)}
                  disabled={!image.signed_url}
                >
                  <Download aria-hidden="true" />
                  <span>Download</span>
                </button>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

function ActionPanel({
  activePanel,
  profile,
  appSettings,
  messages,
  guestThreads,
  attachedFiles,
  onClose,
  onProfileChange,
  onSettingsChange,
  onExportChat,
  onExportHistory,
  onAttach,
  onVoice,
  onClearAttachments,
  onOpenSettings,
  onOpenProfile,
  onNewChat,
  onClearHistory
}: {
  activePanel: ActivePanel;
  profile: UserProfile;
  appSettings: AppSettings;
  messages: ChatMessage[];
  guestThreads: GuestThread[];
  attachedFiles: string[];
  onClose: () => void;
  onProfileChange: (profile: UserProfile) => void;
  onSettingsChange: (settings: AppSettings) => void;
  onExportChat: () => void;
  onExportHistory: () => void;
  onAttach: () => void;
  onVoice: () => void;
  onClearAttachments: () => void;
  onOpenSettings: () => void;
  onOpenProfile: () => void;
  onNewChat: () => void;
  onClearHistory: () => void;
}) {
  if (!activePanel) {
    return null;
  }

  return (
    <div className="panel-scrim" role="presentation" onMouseDown={onClose}>
      <aside
        className="action-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`${activePanel} panel`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="panel-logo" aria-hidden="true" />
            <div>
              <strong>{panelTitle(activePanel)}</strong>
              <small>{APP_DISPLAY_NAME}</small>
            </div>
          </div>
          <button type="button" aria-label="Close panel" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        {activePanel === "menu" ? (
          <div className="panel-grid">
            <button type="button" onClick={onNewChat}>
              <Plus aria-hidden="true" />
              <span>New chat</span>
              <small>Start fresh without losing history</small>
            </button>
            <button type="button" onClick={onAttach}>
              <Upload aria-hidden="true" />
              <span>Attach files</span>
              <small>{attachedFiles.length || "Add"} file context to prompts</small>
            </button>
            <button
              type="button"
              onClick={onClearAttachments}
              disabled={attachedFiles.length === 0}
            >
              <X aria-hidden="true" />
              <span>Clear attachments</span>
              <small>Remove visible file chips from the composer</small>
            </button>
            <button type="button" onClick={onVoice}>
              <Mic aria-hidden="true" />
              <span>Voice input</span>
              <small>Dictate a prompt into the composer</small>
            </button>
            <button type="button" onClick={onOpenSettings}>
              <Settings aria-hidden="true" />
              <span>Settings</span>
              <small>Compact UI, animation, and model display options</small>
            </button>
            <button type="button" onClick={onOpenProfile}>
              <UserRound aria-hidden="true" />
              <span>Profile</span>
              <small>Personalize name, role, tone, and instructions</small>
            </button>
            <button type="button" onClick={onExportChat}>
              <Download aria-hidden="true" />
              <span>Export chat</span>
              <small>{messages.length} messages as Markdown</small>
            </button>
            <button type="button" onClick={onExportHistory}>
              <FileText aria-hidden="true" />
              <span>Export history</span>
              <small>{guestThreads.length} saved guest sessions</small>
            </button>
            <button type="button" onClick={onClearHistory}>
              <X aria-hidden="true" />
              <span>Clear local history</span>
              <small>Remove guest sessions from this browser</small>
            </button>
          </div>
        ) : null}

        {activePanel === "profile" ? (
          <ProfileForm profile={profile} onProfileChange={onProfileChange} />
        ) : null}

        {activePanel === "settings" ? (
          <div className="settings-list">
            <label className="settings-toggle">
              <SlidersHorizontal aria-hidden="true" />
              <div>
                <strong>Compact mobile layout</strong>
                <span>Reduces duplicate navigation and keeps the composer visible.</span>
              </div>
              <input
                type="checkbox"
                checked={appSettings.compactUi}
                onChange={(event) =>
                  onSettingsChange({
                    ...appSettings,
                    compactUi: event.target.checked
                  })
                }
              />
            </label>
            <label className="settings-toggle">
              <Bot aria-hidden="true" />
              <div>
                <strong>Show model details</strong>
                <span>Display the larger model status card above chat.</span>
              </div>
              <input
                type="checkbox"
                checked={appSettings.showModelDetails}
                onChange={(event) =>
                  onSettingsChange({
                    ...appSettings,
                    showModelDetails: event.target.checked
                  })
                }
              />
            </label>
            <label className="settings-toggle">
              <Sparkles aria-hidden="true" />
              <div>
                <strong>Reduce animation</strong>
                <span>Turns off motion-heavy panel and card transitions.</span>
              </div>
              <input
                type="checkbox"
                checked={appSettings.reduceMotion}
                onChange={(event) =>
                  onSettingsChange({
                    ...appSettings,
                    reduceMotion: event.target.checked
                  })
                }
              />
            </label>
            <div className="settings-note">
              <FileText aria-hidden="true" />
              <div>
                <strong>Exports</strong>
                <span>Markdown chat export and JSON history export are enabled.</span>
              </div>
            </div>
            <div className="settings-note">
              <Upload aria-hidden="true" />
              <div>
                <strong>Attachments</strong>
                <span>Text, code, CSV, JSON, and Markdown files can be embedded into prompts.</span>
              </div>
            </div>
            <div className="settings-note">
              <Mic aria-hidden="true" />
              <div>
                <strong>Voice</strong>
                <span>Uses your browser speech recognition when available.</span>
              </div>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function ProfileForm({
  profile,
  onProfileChange
}: {
  profile: UserProfile;
  onProfileChange: (profile: UserProfile) => void;
}) {
  return (
    <form className="profile-form">
      <label>
        <span>Name</span>
        <input
          value={profile.name}
          onChange={(event) =>
            onProfileChange({ ...profile, name: event.target.value })
          }
        />
      </label>
      <label>
        <span>Role</span>
        <input
          value={profile.role}
          onChange={(event) =>
            onProfileChange({ ...profile, role: event.target.value })
          }
        />
      </label>
      <label>
        <span>Preferred tone</span>
        <input
          value={profile.tone}
          onChange={(event) =>
            onProfileChange({ ...profile, tone: event.target.value })
          }
        />
      </label>
      <label>
        <span>Personal instructions</span>
        <textarea
          value={profile.memory}
          onChange={(event) =>
            onProfileChange({ ...profile, memory: event.target.value })
          }
          rows={5}
        />
      </label>
    </form>
  );
}

function panelTitle(activePanel: Exclude<ActivePanel, null>) {
  if (activePanel === "profile") {
    return "Profile";
  }

  if (activePanel === "settings") {
    return "Settings";
  }

  return "Menu";
}

function profileContext(profile: UserProfile) {
  return [
    `You are ${APP_DISPLAY_NAME}, a polished multi-model AI assistant.`,
    `User name: ${profile.name || "User"}.`,
    `User role/context: ${profile.role || "Not specified"}.`,
    `Preferred response style: ${profile.tone || "Clear and useful"}.`,
    `Personal instructions: ${profile.memory || "No extra instructions."}`,
    "Be practical, accurate, and format responses so they are easy to scan."
  ].join("\n");
}

function downloadTextFile(filename: string, content: string) {
  if (typeof window === "undefined") {
    return;
  }

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
