import "server-only";
import OpenAI, { toFile } from "openai";
import { GoogleGenAI, Modality } from "@google/genai";

/**
 * Image generation for the Design Studio: OpenAI GPT Image or Google Gemini (native image output).
 * Keys come from Vercel env (OPENAI_API_KEY, GEMINI_API_KEY); models can be pinned with
 * OPENAI_IMAGE_MODEL / GEMINI_IMAGE_MODEL.
 */
export const imageProviders = ["OPENAI", "GEMINI"] as const;
export type ImageProvider = (typeof imageProviders)[number];

export const studioScenes = [
  "EXTERIOR",
  "INTERIOR",
  "LANDSCAPE",
  "FLOOR_PLAN_3D",
  "FURNITURE",
] as const;
export const studioStyles = [
  "MODERN_TROPICAL",
  "MINIMAL",
  "JAPANDI",
  "NORDIC",
  "CONTEMPORARY_THAI",
  "LUXURY",
  "INDUSTRIAL",
  "CLASSIC",
] as const;
export const studioLighting = ["DAYLIGHT", "GOLDEN_HOUR", "TWILIGHT", "NIGHT", "OVERCAST"] as const;
export const studioAspects = ["16:9", "4:3", "1:1", "3:4", "9:16"] as const;
export const studioPurposes = ["INTERNAL", "CUSTOMER", "MARKETING"] as const;

export const providerModel = (p: ImageProvider) =>
  p === "OPENAI"
    ? process.env.OPENAI_IMAGE_MODEL || "gpt-image-2"
    : process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image";

export const configuredProviders = (): ImageProvider[] =>
  imageProviders.filter((p) =>
    p === "OPENAI"
      ? Boolean(process.env.OPENAI_API_KEY)
      : Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
  );

const styleText: Record<(typeof studioStyles)[number], string> = {
  MODERN_TROPICAL:
    "modern tropical: clean lines, deep overhangs, timber accents, large openings, lush greenery",
  MINIMAL: "minimalist: white and warm-grey palette, flush details, uncluttered spaces",
  JAPANDI: "Japandi: light oak, linen, muted earth tones, low furniture, calm and natural",
  NORDIC: "Scandinavian: pale wood, soft whites, cosy textiles, bright and airy",
  CONTEMPORARY_THAI:
    "contemporary Thai: modern massing with Thai roof proportions, teak, rattan, local craft details",
  LUXURY: "luxury: marble, brass accents, rich textures, layered lighting, hotel-like finish",
  INDUSTRIAL: "industrial loft: exposed concrete, black steel, brick, warm Edison lighting",
  CLASSIC: "classic: symmetrical facades, mouldings, refined traditional details",
};
const lightingText: Record<(typeof studioLighting)[number], string> = {
  DAYLIGHT: "bright natural daylight, clear sky",
  GOLDEN_HOUR: "warm golden-hour sunlight with long soft shadows",
  TWILIGHT: "blue-hour twilight with warm interior lights glowing",
  NIGHT: "night scene with architectural and landscape lighting",
  OVERCAST: "soft overcast light, even shadows",
};
const sceneText: Record<(typeof studioScenes)[number], string> = {
  EXTERIOR: "an exterior view of a single-family house in Thailand",
  INTERIOR: "an interior view of a room in a Thai family house",
  LANDSCAPE: "the garden and landscaping around a house in Thailand",
  FLOOR_PLAN_3D:
    "a 3D top-down cutaway visualization of the house floor plan, walls cut at waist height, furnished rooms",
  FURNITURE: "a furnished interior focusing on furniture layout and decor",
};

export type StudioBrief = {
  scene: (typeof studioScenes)[number];
  style: (typeof studioStyles)[number];
  lighting: (typeof studioLighting)[number];
  materials: string;
  furniture: boolean;
  landscape: boolean;
  people: boolean;
  notes: string;
  hasReference: boolean;
};

/** Turns the form choices into one English prompt; image models follow English best. */
export function buildPrompt(b: StudioBrief) {
  const lines = [
    `Photorealistic architectural visualization of ${sceneText[b.scene]}.`,
    `Design style: ${styleText[b.style]}.`,
    `Lighting: ${lightingText[b.lighting]}.`,
    b.materials ? `Materials and finishes: ${b.materials}.` : "",
    b.furniture ? "Include tasteful, realistic furniture and decor suited to the style." : "",
    b.landscape
      ? "Include tropical landscaping suited to Thailand: lawn, frangipani, palms, stone paths."
      : "",
    b.people ? "Include a few natural-looking people for scale." : "Do not include people.",
    b.hasReference
      ? b.scene === "FLOOR_PLAN_3D"
        ? "Use the reference floor plan exactly: keep every room, wall, door and window in the same position and proportion."
        : "Use the reference image as the exact geometry: keep the building massing, proportions, roof shape, openings and camera viewpoint unchanged; change only materials, finishes, furniture, landscaping and lighting."
      : "",
    "Professional real-estate rendering quality, accurate perspective, no text, no watermarks, no labels.",
    b.notes ? `Additional requirements: ${b.notes}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

const openaiSize: Record<(typeof studioAspects)[number], string> = {
  "16:9": "1536x1024",
  "4:3": "1536x1024",
  "1:1": "1024x1024",
  "3:4": "1024x1536",
  "9:16": "1024x1536",
};

export type GeneratedImage = { data: Buffer; mimeType: string; model: string };
export class ImageProviderError extends Error {
  constructor(public key: "not_configured" | "blocked" | "no_image" | "provider") {
    super(key);
  }
}

export async function generateImage(opts: {
  provider: ImageProvider;
  prompt: string;
  aspect: (typeof studioAspects)[number];
  reference?: { data: Buffer; mimeType: string } | null;
}): Promise<GeneratedImage> {
  const model = providerModel(opts.provider);
  if (!configuredProviders().includes(opts.provider))
    throw new ImageProviderError("not_configured");

  if (opts.provider === "OPENAI") {
    const client = new OpenAI();
    try {
      const common = {
        model,
        prompt: opts.prompt,
        size: openaiSize[opts.aspect],
        quality: "high" as const,
        output_format: "jpeg" as const,
      };
      const res = opts.reference
        ? await client.images.edit({
            ...common,
            image: await toFile(
              opts.reference.data,
              `reference.${opts.reference.mimeType.split("/")[1]}`,
              {
                type: opts.reference.mimeType,
              },
            ),
          })
        : await client.images.generate(common);
      const b64 = res.data?.[0]?.b64_json;
      if (!b64) throw new ImageProviderError("no_image");
      return { data: Buffer.from(b64, "base64"), mimeType: "image/jpeg", model };
    } catch (e) {
      if (e instanceof ImageProviderError) throw e;
      if (e instanceof OpenAI.BadRequestError && /safety|moderation/i.test(e.message))
        throw new ImageProviderError("blocked");
      console.error("openai image failed", e);
      throw new ImageProviderError("provider");
    }
  }

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    ...(process.env.GEMINI_BASE_URL
      ? { httpOptions: { baseUrl: process.env.GEMINI_BASE_URL } }
      : {}),
  });
  try {
    const res = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            ...(opts.reference
              ? [
                  {
                    inlineData: {
                      mimeType: opts.reference.mimeType,
                      data: opts.reference.data.toString("base64"),
                    },
                  },
                ]
              : []),
            { text: opts.prompt },
          ],
        },
      ],
      config: {
        responseModalities: [Modality.IMAGE],
        imageConfig: { aspectRatio: opts.aspect, imageSize: "2K" },
      },
    });
    const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part?.inlineData?.data) {
      const reason = res.candidates?.[0]?.finishReason ?? res.promptFeedback?.blockReason;
      throw new ImageProviderError(
        reason && /SAFETY|BLOCK|PROHIBITED/i.test(String(reason)) ? "blocked" : "no_image",
      );
    }
    return {
      data: Buffer.from(part.inlineData.data, "base64"),
      mimeType: part.inlineData.mimeType || "image/png",
      model,
    };
  } catch (e) {
    if (e instanceof ImageProviderError) throw e;
    console.error("gemini image failed", e);
    throw new ImageProviderError("provider");
  }
}
