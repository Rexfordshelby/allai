import { streamOpenRouterChat } from "@/lib/ai/openrouter";
import { encodeSse, streamHeaders } from "@/lib/api/sse";
import {
  ensureConversation,
  getOptionalSupabaseAuth,
  jsonError
} from "@/lib/api/server";
import { compareRequestSchema } from "@/lib/api/validation";
import type { ChatMessage } from "@/types/app";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await getOptionalSupabaseAuth();

  const parsed = compareRequestSchema.safeParse(
    await request.json().catch(() => null)
  );

  if (!parsed.success) {
    return jsonError("Invalid compare request.", 422, parsed.error.flatten());
  }

  const { supabase, user } = auth;
  const { conversationId, models, prompt, history } = parsed.data;
  let resolvedConversationId: string | null = null;

  if (supabase && user) {
    try {
      resolvedConversationId = await ensureConversation(
        supabase,
        user.id,
        "compare",
        prompt,
        conversationId
      );
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "Compare setup failed.", 400);
    }

    await supabase.from("messages").insert({
      conversation_id: resolvedConversationId,
      user_id: user.id,
      role: "user",
      content: prompt,
      metadata: { compare_models: models }
    });
  }

  const encoder = new TextEncoder();
  const baseMessages: ChatMessage[] = [
    ...history.slice(-16),
    { role: "user", content: prompt }
  ];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(encodeSse(event, data)));
      };

      send("meta", {
        conversationId: resolvedConversationId ?? null,
        models
      });

      await Promise.all(
        models.map(async (model) => {
          let content = "";
          const startedAt = Date.now();
          const { data: run } =
            supabase && user && resolvedConversationId
              ? await supabase
                  .from("model_runs")
                  .insert({
                    conversation_id: resolvedConversationId,
                    user_id: user.id,
                    model_id: model,
                    status: "pending"
                  })
                  .select("id")
                  .single()
              : { data: null };

          send("status", { model, status: "streaming" });

          try {
            await streamOpenRouterChat(model, baseMessages, {
              async onToken(token) {
                content += token;
                send("token", { model, token });
              }
            });

            if (supabase && user && resolvedConversationId) {
              await supabase.from("messages").insert({
                conversation_id: resolvedConversationId,
                user_id: user.id,
                role: "assistant",
                model_id: model,
                content
              });
            }

            if (supabase && run?.id) {
              await supabase
                .from("model_runs")
                .update({
                  status: "completed",
                  latency_ms: Date.now() - startedAt,
                  completed_at: new Date().toISOString()
                })
                .eq("id", run.id);
            }

            send("status", { model, status: "completed" });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "The model request failed.";

            if (supabase && run?.id) {
              await supabase
                .from("model_runs")
                .update({
                  status: "failed",
                  error: message,
                  latency_ms: Date.now() - startedAt,
                  completed_at: new Date().toISOString()
                })
                .eq("id", run.id);
            }

            send("error", { model, error: message });
          }
        })
      );

      send("done", { conversationId: resolvedConversationId });
      controller.close();
    }
  });

  return new Response(stream, {
    headers: streamHeaders({
      ...(resolvedConversationId
        ? { "X-Conversation-Id": resolvedConversationId }
        : {})
    })
  });
}
