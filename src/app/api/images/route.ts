import { randomUUID } from "crypto";
import { GENERATED_IMAGES_BUCKET } from "@/lib/constants";
import { generateImageBytes } from "@/lib/ai/huggingface";
import {
  ensureConversation,
  getAuthedSupabase,
  jsonError
} from "@/lib/api/server";
import { imageRequestSchema } from "@/lib/api/validation";

export const runtime = "nodejs";

export async function GET() {
  const auth = await getAuthedSupabase();
  if (auth instanceof Response) {
    return auth;
  }

  const { supabase, user } = auth;
  const { data, error } = await supabase
    .from("image_generations")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) {
    return jsonError(error.message, 500);
  }

  const images = await Promise.all(
    (data ?? []).map(async (image) => {
      if (!image.storage_path) {
        return { ...image, signed_url: null };
      }

      const { data: signed } = await supabase.storage
        .from(GENERATED_IMAGES_BUCKET)
        .createSignedUrl(image.storage_path, 60 * 60);

      return { ...image, signed_url: signed?.signedUrl ?? null };
    })
  );

  return Response.json({ images });
}

export async function POST(request: Request) {
  const auth = await getAuthedSupabase();
  if (auth instanceof Response) {
    return auth;
  }

  const parsed = imageRequestSchema.safeParse(
    await request.json().catch(() => null)
  );

  if (!parsed.success) {
    return jsonError("Invalid image request.", 422, parsed.error.flatten());
  }

  const { supabase, user } = auth;
  const input = parsed.data;
  let conversationId: string | null = input.conversationId ?? null;

  try {
    conversationId = await ensureConversation(
      supabase,
      user.id,
      "image",
      input.prompt,
      conversationId
    );
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Image setup failed.", 400);
  }

  await supabase.from("messages").insert({
    conversation_id: conversationId,
    user_id: user.id,
    role: "user",
    content: input.prompt,
    metadata: {
      negative_prompt: input.negativePrompt ?? null,
      image_model: input.model
    }
  });

  const generationId = randomUUID();
  const storagePath = `${user.id}/${generationId}.png`;

  await supabase.from("image_generations").insert({
    id: generationId,
    conversation_id: conversationId,
    user_id: user.id,
    prompt: input.prompt,
    negative_prompt: input.negativePrompt ?? null,
    model_id: input.model,
    width: input.width,
    height: input.height,
    seed: input.seed ?? null,
    status: "pending"
  });

  try {
    const image = await generateImageBytes({
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      model: input.model,
      width: input.width,
      height: input.height,
      seed: input.seed
    });

    const { error: uploadError } = await supabase.storage
      .from(GENERATED_IMAGES_BUCKET)
      .upload(storagePath, image.bytes, {
        contentType: image.contentType,
        upsert: false
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: signed } = await supabase.storage
      .from(GENERATED_IMAGES_BUCKET)
      .createSignedUrl(storagePath, 60 * 60);

    const { data, error } = await supabase
      .from("image_generations")
      .update({
        storage_path: storagePath,
        status: "completed",
        completed_at: new Date().toISOString()
      })
      .eq("id", generationId)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return Response.json({
      image: { ...data, signed_url: signed?.signedUrl ?? null },
      conversationId
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Image generation failed.";

    await supabase
      .from("image_generations")
      .update({
        status: "failed",
        error: message,
        completed_at: new Date().toISOString()
      })
      .eq("id", generationId);

    return jsonError(message, 502);
  }
}
