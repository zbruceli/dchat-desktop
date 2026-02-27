import { useEffect, useRef, useCallback } from "react";
import { useVoiceCallStore } from "../stores/voice-call-store";

/**
 * Hook that manages WebAudio capture and playback for voice calls.
 *
 * When the call is connected:
 * - Captures mic audio via AudioWorklet, converts PCM to Opus-like frames, sends via IPC
 * - Receives audio frames from IPC, decodes and plays back via WebAudio
 *
 * Note: Since Opus WASM codec adds significant complexity, we use raw PCM (Float32)
 * encoded as base64 for the initial implementation. The Go sidecar handles the
 * length-prefixed framing. For production, an Opus WASM encoder should be added.
 */
export function useVoiceAudio(): void {
  const activeCall = useVoiceCallStore((s) => s.activeCall);
  const isMuted = useVoiceCallStore((s) => s.isMuted);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const playbackQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Play received audio frames
  const playAudioFrame = useCallback((pcmData: Float32Array) => {
    const ctx = audioContextRef.current;
    if (!ctx || ctx.state === "closed") return;

    const buffer = ctx.createBuffer(1, pcmData.length, 48000);
    buffer.getChannelData(0).set(pcmData);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
  }, []);

  // Set up audio when call connects
  useEffect(() => {
    if (!activeCall || activeCall.state !== "connected") {
      // Clean up when call ends or not connected
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      return;
    }

    let cancelled = false;

    async function setupAudio() {
      try {
        // Create AudioContext
        const audioContext = new AudioContext({ sampleRate: 48000 });
        audioContextRef.current = audioContext;

        // Register worklet
        const workletUrl = new URL("../workers/audio-processor.worklet.ts", import.meta.url);
        await audioContext.audioWorklet.addModule(workletUrl.href);

        if (cancelled) return;

        // Get microphone stream
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 48000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        // Create worklet node for capture
        const source = audioContext.createMediaStreamSource(stream);
        const workletNode = new AudioWorkletNode(audioContext, "audio-capture-processor");
        workletNodeRef.current = workletNode;

        workletNode.port.onmessage = (event) => {
          if (event.data.type === "pcm-frame") {
            const pcmFrame = event.data.data as Float32Array;
            // Convert Float32 PCM to Int16 for more efficient transport
            const int16 = new Int16Array(pcmFrame.length);
            for (let i = 0; i < pcmFrame.length; i++) {
              const s = Math.max(-1, Math.min(1, pcmFrame[i]));
              int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
            }
            window.dchat.voice.sendAudio(int16.buffer);
          }
        };

        source.connect(workletNode);
        // Don't connect worklet to destination (we don't want to hear ourselves)
        workletNode.connect(audioContext.destination);
        // Actually, disconnect from destination to prevent feedback
        workletNode.disconnect(audioContext.destination);

        // Subscribe to incoming audio data
        const unsubAudio = window.dchat.voice.onAudioData((audioData) => {
          if (!audioData?.data) return;

          // Decode base64 to Int16 PCM, then to Float32
          const raw = atob(audioData.data);
          const bytes = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) {
            bytes[i] = raw.charCodeAt(i);
          }
          const int16 = new Int16Array(bytes.buffer);
          const float32 = new Float32Array(int16.length);
          for (let i = 0; i < int16.length; i++) {
            float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff);
          }

          playAudioFrame(float32);
        });

        cleanupRef.current = () => {
          unsubAudio();
          workletNode.disconnect();
          source.disconnect();
          stream.getTracks().forEach((t) => t.stop());
          audioContext.close().catch(console.error);
          audioContextRef.current = null;
          streamRef.current = null;
          workletNodeRef.current = null;
        };
      } catch (err) {
        console.error("[VoiceAudio] Failed to set up audio:", err);
      }
    }

    setupAudio();

    return () => {
      cancelled = true;
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [activeCall?.state === "connected" ? "connected" : "other", playAudioFrame]);

  // Handle mute/unmute
  useEffect(() => {
    const stream = streamRef.current;
    if (!stream) return;

    stream.getAudioTracks().forEach((track) => {
      track.enabled = !isMuted;
    });
  }, [isMuted]);
}
