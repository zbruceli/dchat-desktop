import { useEffect, useRef, useCallback } from "react";
import { useVoiceCallStore } from "../stores/voice-call-store";

/**
 * Hook that manages WebAudio capture and playback for voice calls.
 *
 * Capture: AudioWorklet collects 20ms PCM frames (960 samples @ 48kHz),
 * Opus-encodes via WebCodecs AudioEncoder, sends via IPC → Go sidecar → TUNA relay.
 *
 * Playback: Incoming Opus frames are decoded via AudioDecoder, then fed into
 * a jitter buffer for gapless scheduled playback.
 *
 * Opus encoding reduces bandwidth from 768 kbps (raw PCM) to ~24 kbps with
 * built-in FEC for packet loss resilience and DTX for silence suppression.
 */

const FRAME_DURATION = 960 / 48000; // 20ms per frame
const JITTER_BUFFER_MS = 60; // Buffer 60ms (3 frames) before starting playback

export function useVoiceAudio(): void {
  const activeCall = useVoiceCallStore((s) => s.activeCall);
  const isMuted = useVoiceCallStore((s) => s.isMuted);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Jitter buffer state for scheduled playback
  const nextPlayTimeRef = useRef(0);
  const jitterBufferRef = useRef<Float32Array[]>([]);
  const bufferingRef = useRef(true);
  const playbackStartedRef = useRef(false);

  // Drain the jitter buffer, scheduling frames for gapless playback
  const drainBuffer = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx || ctx.state === "closed") return;

    const queue = jitterBufferRef.current;
    while (queue.length > 0) {
      const pcmData = queue.shift()!;
      const buffer = ctx.createBuffer(1, pcmData.length, 48000);
      buffer.getChannelData(0).set(pcmData);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      // Schedule this frame right after the previous one ends
      const now = ctx.currentTime;
      if (nextPlayTimeRef.current < now) {
        // Fallen behind — reset to now (with small lookahead for scheduling)
        nextPlayTimeRef.current = now + 0.005;
      }
      source.start(nextPlayTimeRef.current);
      nextPlayTimeRef.current += FRAME_DURATION;
    }
  }, []);

  // Play received audio frames via jitter buffer
  const playAudioFrame = useCallback((pcmData: Float32Array) => {
    const ctx = audioContextRef.current;
    if (!ctx || ctx.state === "closed") return;

    jitterBufferRef.current.push(pcmData);

    if (bufferingRef.current) {
      // Wait until we have enough frames to smooth out jitter
      const bufferedMs = jitterBufferRef.current.length * FRAME_DURATION * 1000;
      if (bufferedMs >= JITTER_BUFFER_MS) {
        bufferingRef.current = false;
        if (!playbackStartedRef.current) {
          playbackStartedRef.current = true;
          console.log(`[VoiceAudio] Jitter buffer ready (${jitterBufferRef.current.length} frames), starting playback`);
        }
        drainBuffer();
      }
    } else {
      drainBuffer();
    }
  }, [drainBuffer]);

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
        console.log("[VoiceAudio] Setting up Opus audio pipeline...");
        // Create AudioContext
        const audioContext = new AudioContext({ sampleRate: 48000 });
        audioContextRef.current = audioContext;
        console.log("[VoiceAudio] AudioContext created, state:", audioContext.state);

        // On Windows, AudioContext may start suspended — resume it explicitly
        if (audioContext.state === "suspended") {
          console.log("[VoiceAudio] AudioContext suspended, resuming...");
          await audioContext.resume();
          console.log("[VoiceAudio] AudioContext resumed, state:", audioContext.state);
        }

        // Auto-resume if AudioContext gets suspended mid-call
        audioContext.onstatechange = () => {
          console.log("[VoiceAudio] AudioContext state changed to:", audioContext.state);
          if (audioContext.state === "suspended") {
            audioContext.resume().catch(console.error);
          }
        };

        // Reset jitter buffer state
        nextPlayTimeRef.current = 0;
        jitterBufferRef.current = [];
        bufferingRef.current = true;
        playbackStartedRef.current = false;

        // --- Opus Encoder (capture side) ---
        let sendCount = 0;
        const encoder = new AudioEncoder({
          output: (chunk: EncodedAudioChunk) => {
            const buf = new ArrayBuffer(chunk.byteLength);
            chunk.copyTo(buf);
            sendCount++;
            if (sendCount <= 5 || sendCount % 50 === 0) {
              console.log(`[VoiceAudio] Sending Opus frame #${sendCount}, size=${chunk.byteLength}`);
            }
            window.dchat.voice.sendAudio(buf);
          },
          error: (e) => console.error("[VoiceAudio] Encoder error:", e),
        });

        encoder.configure({
          codec: "opus",
          sampleRate: 48000,
          numberOfChannels: 1,
          bitrate: 24000,
          opus: {
            frameDuration: 20000,
            useinbandfec: true,
            usedtx: true,
            packetlossperc: 10,
          },
        });
        console.log("[VoiceAudio] Opus encoder configured (24 kbps, VoIP, FEC+DTX)");

        // --- Opus Decoder (playback side) ---
        const decoder = new AudioDecoder({
          output: (audioData: AudioData) => {
            const float32 = new Float32Array(audioData.numberOfFrames);
            audioData.copyTo(float32, { planeIndex: 0 });
            audioData.close();
            playAudioFrame(float32);
          },
          error: (e) => console.error("[VoiceAudio] Decoder error:", e),
        });

        decoder.configure({
          codec: "opus",
          sampleRate: 48000,
          numberOfChannels: 1,
        });
        console.log("[VoiceAudio] Opus decoder configured");

        // Register worklet — use inline source wrapped in a blob URL to avoid CSP
        // issues with Vite's data: URL inlining in production builds
        const workletSource = `
class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frameSize = 960;
    this.buffer = new Float32Array(this.frameSize);
    this.writePos = 0;
  }
  process(inputs, _outputs, _parameters) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channelData = input[0];
    if (!channelData) return true;
    let readPos = 0;
    while (readPos < channelData.length) {
      const remaining = this.frameSize - this.writePos;
      const available = channelData.length - readPos;
      const toCopy = Math.min(remaining, available);
      this.buffer.set(channelData.subarray(readPos, readPos + toCopy), this.writePos);
      this.writePos += toCopy;
      readPos += toCopy;
      if (this.writePos >= this.frameSize) {
        this.port.postMessage({ type: "pcm-frame", data: this.buffer.slice() });
        this.writePos = 0;
      }
    }
    return true;
  }
}
registerProcessor("audio-capture-processor", AudioCaptureProcessor);
`;
        const workletBlob = new Blob([workletSource], { type: "application/javascript" });
        const workletUrl = URL.createObjectURL(workletBlob);
        console.log("[VoiceAudio] Loading worklet from blob URL");
        await audioContext.audioWorklet.addModule(workletUrl);
        URL.revokeObjectURL(workletUrl);
        console.log("[VoiceAudio] Worklet loaded");

        if (cancelled) {
          encoder.close();
          decoder.close();
          return;
        }

        // Get microphone stream
        console.log("[VoiceAudio] Requesting mic access...");
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
          encoder.close();
          decoder.close();
          return;
        }

        streamRef.current = stream;
        console.log("[VoiceAudio] Mic stream acquired, tracks:", stream.getAudioTracks().length);

        // Create worklet node for capture
        const sourceNode = audioContext.createMediaStreamSource(stream);
        const workletNode = new AudioWorkletNode(audioContext, "audio-capture-processor");
        workletNodeRef.current = workletNode;

        // Frame timestamp tracker for AudioData (microseconds)
        let frameTimestamp = 0;

        workletNode.port.onmessage = (event) => {
          if (event.data.type === "pcm-frame") {
            const pcmFrame = event.data.data as Float32Array;
            // Wrap PCM in AudioData and feed to Opus encoder
            const audioData = new AudioData({
              format: "f32-planar",
              sampleRate: 48000,
              numberOfFrames: pcmFrame.length,
              numberOfChannels: 1,
              timestamp: frameTimestamp,
              data: pcmFrame.buffer as ArrayBuffer,
            });
            encoder.encode(audioData);
            audioData.close();
            frameTimestamp += 20000; // 20ms in microseconds
          }
        };

        sourceNode.connect(workletNode);
        // Don't connect worklet to destination (we don't want to hear ourselves)
        workletNode.connect(audioContext.destination);
        // Actually, disconnect from destination to prevent feedback
        workletNode.disconnect(audioContext.destination);

        // Subscribe to incoming audio data
        let recvCount = 0;
        let recvTimestamp = 0;
        const unsubAudio = window.dchat.voice.onAudioData((audioData) => {
          if (!audioData?.data) return;
          recvCount++;
          if (recvCount <= 5 || recvCount % 50 === 0) {
            console.log(`[VoiceAudio] Received Opus frame #${recvCount}, size=${audioData.data.length}`);
          }

          // Decode base64 to raw Opus bytes, feed to decoder
          const raw = atob(audioData.data);
          const bytes = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) {
            bytes[i] = raw.charCodeAt(i);
          }

          const chunk = new EncodedAudioChunk({
            type: "key", // Opus frames are all independently decodable
            timestamp: recvTimestamp,
            data: bytes.buffer,
          });
          decoder.decode(chunk);
          recvTimestamp += 20000; // 20ms in microseconds
        });

        cleanupRef.current = () => {
          unsubAudio();
          encoder.close();
          decoder.close();
          workletNode.disconnect();
          sourceNode.disconnect();
          stream.getTracks().forEach((t) => t.stop());
          audioContext.close().catch(console.error);
          audioContextRef.current = null;
          streamRef.current = null;
          workletNodeRef.current = null;
          jitterBufferRef.current = [];
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
