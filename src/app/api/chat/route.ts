import { chatRequestSchema } from "@/lib/api/validation";
import {
  ensureConversation,
  getAuthedSupabase,
  jsonError
} from "@/lib/api/server";
import { streamOpenRouterChat } from "@/lib/ai/openrouter";
import type { ChatMessage } from "@/types/app";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await getAuthedSupabase();
  if (auth instanceof Response) {
    return auth;
  }

  const parsed = chatRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError("Invalid chat request.", 422, parsed.error.flatten());
  }

  const { supabase, user } = auth;
  const { conversationId, model, prompt, history } = parsed.data;
  let resolvedConversationId: string;

  try {
    resolvedConversationId = await ensureConversation(
      supabase,
      user.id,
      "chat",
      prompt,
      conversationId
    );
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Chat setup failed.", 400);
  }

  await supabase.from("messages").insert({
    conversation_id: resolvedConversationId,
    user_id: user.id,
    role: "user",
    content: prompt
  });

  const { data: run } = await supabase
    .from("model_runs")
    .insert({
      conversation_id: resolvedConversationId,
      user_id: user.id,
      model_id: model,
      status: "pending"
    })
    .select("id")
    .single();

  const encoder = new TextEncoder();
  const messages: ChatMessage[] = [
    ...history.slice(-30),
    { role: "user", content: prompt }
  ];

  let assistantContent = "";
  const startedAt = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await streamOpenRouterChat(model, messages, {
          async onToken(token) {
            assistantContent += token;
            controller.enqueue(encoder.encode(token));
          }
        });

        if (assistantContent.trim()) {
          await supabase.from("messages").insert({
            conversation_id: resolvedConversationId,
            user_id: user.id,
            role: "assistant",
            model_id: model,
            content: assistantContent
          });
        }

        if (run?.id) {
          await supabase
            .from("model_runs")
            .update({
              status: "completed",
              latency_ms: Date.now() - startedAt,
              completed_at: new Date().toISOString()
            })
            .eq("id", run.id);
        }

        controller.close();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "The model request failed.";
        controller.enqueue(encoder.encode(`\n\n${message}`));

        if (run?.id) {
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

        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Conversation-Id": resolvedConversationId
    }
  });
}
