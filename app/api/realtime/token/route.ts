import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST() {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY in environment variables." },
      { status: 500 },
    );
  }

  try {
    const response = await openai.realtime.clientSecrets.create({
      session: {
        type: "transcription",
        audio: {
          input: {
            format: { type: "audio/pcm", rate: 24000 },
            transcription: {
              model: "gpt-4o-transcribe",
              language: "en",
              prompt:
                "Procurement request. Expect words like budget, supplier, delivery, laptops, consulting, EUR, CHF, USD.",
            },
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
            },
            noise_reduction: {
              type: "near_field",
            },
          },
        },
      },
    });

    return NextResponse.json({
      client_secret: response.value,
      expires_at: response.expires_at,
    });
  } catch (error) {
    console.error("Failed to create realtime transcription token", error);
    return NextResponse.json(
      { error: "Failed to create transcription session token." },
      { status: 500 },
    );
  }
}
