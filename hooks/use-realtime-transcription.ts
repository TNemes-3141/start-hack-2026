"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const TARGET_SAMPLE_RATE = 24000;
const WS_URL = "wss://api.openai.com/v1/realtime?intent=transcription";

type TranscriptionEvent = {
  type: string;
  transcript?: string;
  error?: { message?: string };
};

export type UseRealtimeTranscriptionReturn = {
  isRecording: boolean;
  transcript: string;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string>;
  error: string | null;
};

function float32ToPcm16Base64(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function resampleFloat32(
  input: Float32Array,
  inputRate: number,
  outputRate: number,
): Float32Array {
  if (inputRate === outputRate) return input;
  const ratio = inputRate / outputRate;
  const outputLength = Math.round(input.length / ratio);
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const low = Math.floor(srcIndex);
    const high = Math.min(low + 1, input.length - 1);
    const frac = srcIndex - low;
    output[i] = input[low] * (1 - frac) + input[high] * frac;
  }
  return output;
}

export function useRealtimeTranscription(): UseRealtimeTranscriptionReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const transcriptRef = useRef("");
  const isRecordingRef = useRef(false);
  const flushResolveRef = useRef<((transcript: string) => void) | null>(null);

  const cleanup = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (wsRef.current) {
      if (
        wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING
      ) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
  }, []);

  const stopRecording = useCallback((): Promise<string> => {
    // Stop capturing audio immediately
    isRecordingRef.current = false;
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setIsRecording(false);
      wsRef.current = null;
      return Promise.resolve(transcriptRef.current);
    }

    // Flush any remaining audio in the server buffer
    ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));

    // Wait for the final transcription event, then close
    return new Promise<string>((resolve) => {
      flushResolveRef.current = resolve;

      // Safety timeout — don't wait forever (3s)
      const timeout = window.setTimeout(() => {
        flushResolveRef.current = null;
        ws.close();
        wsRef.current = null;
        setIsRecording(false);
        resolve(transcriptRef.current);
      }, 3000);

      // The onmessage handler will call flushResolveRef when the next
      // transcription.completed arrives, which clears this timeout via
      // the resolve guard below.
      const originalResolve = flushResolveRef.current;
      flushResolveRef.current = (finalTranscript: string) => {
        window.clearTimeout(timeout);
        originalResolve?.(finalTranscript);
        ws.close();
        wsRef.current = null;
        setIsRecording(false);
      };
    });
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setTranscript("");
    transcriptRef.current = "";

    try {
      // 1. Get ephemeral token
      const tokenRes = await fetch("/api/realtime/token", { method: "POST" });
      if (!tokenRes.ok) {
        const err = await tokenRes.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error ||
            "Failed to get transcription token",
        );
      }
      const { client_secret } = (await tokenRes.json()) as {
        client_secret: string;
      };

      // 2. Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = stream;

      // 3. Set up AudioContext + ScriptProcessor
      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      const nativeSampleRate = audioCtx.sampleRate;

      // 4. Open WebSocket
      const ws = new WebSocket(WS_URL, [
        "realtime",
        `openai-insecure-api-key.${client_secret}`,
      ]);
      wsRef.current = ws;

      ws.onopen = () => {
        // Start processing audio once connection is open
        processor.onaudioprocess = (e) => {
          if (!isRecordingRef.current || ws.readyState !== WebSocket.OPEN)
            return;
          const inputData = e.inputBuffer.getChannelData(0);
          const resampled = resampleFloat32(
            inputData,
            nativeSampleRate,
            TARGET_SAMPLE_RATE,
          );
          const base64 = float32ToPcm16Base64(resampled);
          ws.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: base64,
            }),
          );
        };

        source.connect(processor);
        processor.connect(audioCtx.destination);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as TranscriptionEvent;

          if (
            data.type ===
            "conversation.item.input_audio_transcription.completed"
          ) {
            const text = data.transcript?.trim();
            if (text) {
              transcriptRef.current =
                (transcriptRef.current ? transcriptRef.current + " " : "") +
                text;
              setTranscript(transcriptRef.current);
            }

            // If we're flushing (stopRecording was called), resolve with final transcript
            if (flushResolveRef.current) {
              const resolve = flushResolveRef.current;
              flushResolveRef.current = null;
              resolve(transcriptRef.current);
            }
          }

          if (data.type === "error") {
            // When flushing on stop, a "buffer too small" error is expected
            // if VAD already committed all audio. Resolve and ignore it.
            if (flushResolveRef.current) {
              const resolve = flushResolveRef.current;
              flushResolveRef.current = null;
              resolve(transcriptRef.current);
            } else {
              console.error("[STT] WebSocket error event:", data.error);
              setError(data.error?.message ?? "Transcription error");
            }
          }
        } catch {
          // ignore non-JSON messages
        }
      };

      ws.onerror = () => {
        setError("WebSocket connection error");
        stopRecording();
      };

      ws.onclose = () => {
        if (isRecordingRef.current) {
          // Unexpected close while still recording
          isRecordingRef.current = false;
          setIsRecording(false);
          cleanup();
        }
      };

      isRecordingRef.current = true;
      setIsRecording(true);
    } catch (err) {
      cleanup();
      const message =
        err instanceof Error ? err.message : "Failed to start recording";
      setError(message);
      console.error("[STT] startRecording error:", err);
    }
  }, [cleanup, stopRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isRecordingRef.current) {
        isRecordingRef.current = false;
        cleanup();
      }
    };
  }, [cleanup]);

  return { isRecording, transcript, startRecording, stopRecording, error };
}
