import { useEffect, useRef, useCallback, useState } from "react";
import { useVoiceCallStore } from "../stores/voice-call-store";

/**
 * Hook that manages video capture and playback for video calls.
 *
 * Robustness features:
 * - Keyframe-gated decoding: skip delta frames until first keyframe arrives
 * - Auto-recovery: on decoder error, reset and wait for next keyframe
 * - Frequent keyframes (every 1s) for fast recovery after packet loss
 * - Encoder backpressure monitoring (skip frames when queue backs up)
 * - Stats tracking: resolution, FPS, bitrate, dropped frames
 */

const VIDEO_WIDTH = 640;
const VIDEO_HEIGHT = 480;
const VIDEO_FPS = 15;
const VIDEO_BITRATE = 500_000; // 500 kbps
const KEYFRAME_INTERVAL_FRAMES = 15; // 1 keyframe per second at 15fps

export interface VideoStats {
  // Sending
  sendWidth: number;
  sendHeight: number;
  sendFps: number;
  sendBytesPerSec: number;
  sendDropped: number;
  // Receiving
  recvWidth: number;
  recvHeight: number;
  recvFps: number;
  recvBytesPerSec: number;
  recvDropped: number;
}

const EMPTY_STATS: VideoStats = {
  sendWidth: 0, sendHeight: 0, sendFps: 0, sendBytesPerSec: 0, sendDropped: 0,
  recvWidth: 0, recvHeight: 0, recvFps: 0, recvBytesPerSec: 0, recvDropped: 0,
};

interface UseVideoOptions {
  localCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  remoteCanvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export function useVideo({ localCanvasRef, remoteCanvasRef }: UseVideoOptions): VideoStats {
  const activeCall = useVoiceCallStore((s) => s.activeCall);
  const isVideoOff = useVoiceCallStore((s) => s.isVideoOff);

  const streamRef = useRef<MediaStream | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const localAnimRef = useRef<number | null>(null);
  const [stats, setStats] = useState<VideoStats>(EMPTY_STATS);

  const isVideoCall = activeCall?.callType === "video" && activeCall.state === "connected";

  useEffect(() => {
    if (!isVideoCall) {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      setStats(EMPTY_STATS);
      return;
    }

    let cancelled = false;

    // --- Stats accumulators (reset every second) ---
    let sendFramesInWindow = 0;
    let sendBytesInWindow = 0;
    let sendDroppedTotal = 0;
    let recvFramesInWindow = 0;
    let recvBytesInWindow = 0;
    let recvDroppedTotal = 0;
    let lastSendWidth = 0;
    let lastSendHeight = 0;
    let lastRecvWidth = 0;
    let lastRecvHeight = 0;

    const statsInterval = setInterval(() => {
      if (cancelled) return;
      setStats({
        sendWidth: lastSendWidth,
        sendHeight: lastSendHeight,
        sendFps: sendFramesInWindow,
        sendBytesPerSec: sendBytesInWindow,
        sendDropped: sendDroppedTotal,
        recvWidth: lastRecvWidth,
        recvHeight: lastRecvHeight,
        recvFps: recvFramesInWindow,
        recvBytesPerSec: recvBytesInWindow,
        recvDropped: recvDroppedTotal,
      });
      sendFramesInWindow = 0;
      sendBytesInWindow = 0;
      recvFramesInWindow = 0;
      recvBytesInWindow = 0;
    }, 1000);

    async function setupVideo() {
      try {
        console.log("[Video] Setting up VP8 video pipeline...");

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: VIDEO_WIDTH },
            height: { ideal: VIDEO_HEIGHT },
            frameRate: { ideal: VIDEO_FPS },
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const videoTrack = stream.getVideoTracks()[0];
        const settings = videoTrack.getSettings();
        lastSendWidth = settings.width || VIDEO_WIDTH;
        lastSendHeight = settings.height || VIDEO_HEIGHT;
        console.log(`[Video] Camera acquired: ${lastSendWidth}x${lastSendHeight} @ ${settings.frameRate}fps`);

        // --- Local preview ---
        const localVideo = document.createElement("video");
        localVideo.srcObject = stream;
        localVideo.muted = true;
        localVideo.playsInline = true;
        localVideo.play();

        function drawLocalPreview() {
          const canvas = localCanvasRef.current;
          if (canvas && localVideo.readyState >= 2) {
            const ctx = canvas.getContext("2d");
            if (ctx) {
              canvas.width = localVideo.videoWidth || VIDEO_WIDTH;
              canvas.height = localVideo.videoHeight || VIDEO_HEIGHT;
              ctx.save();
              ctx.scale(-1, 1);
              ctx.drawImage(localVideo, -canvas.width, 0, canvas.width, canvas.height);
              ctx.restore();
            }
          }
          localAnimRef.current = requestAnimationFrame(drawLocalPreview);
        }
        drawLocalPreview();

        // --- VP8 Encoder ---
        let frameCount = 0;

        const encoder = new VideoEncoder({
          output: (chunk: EncodedVideoChunk) => {
            const buf = new ArrayBuffer(chunk.byteLength);
            chunk.copyTo(buf);
            sendFramesInWindow++;
            sendBytesInWindow += chunk.byteLength;
            window.dchat.voice.sendVideo(buf);
          },
          error: (e) => {
            console.error("[Video] Encoder error:", e);
            // Encoder errors are usually fatal — but don't crash the whole pipeline
          },
        });

        encoder.configure({
          codec: "vp8",
          width: lastSendWidth,
          height: lastSendHeight,
          bitrate: VIDEO_BITRATE,
          framerate: VIDEO_FPS,
        });
        console.log("[Video] VP8 encoder configured");

        // --- VP8 Decoder with auto-recovery ---
        let hasReceivedKeyframe = false;
        let decoderState: "active" | "recovering" = "active";

        function createDecoder(): VideoDecoder {
          const dec = new VideoDecoder({
            output: (frame: VideoFrame) => {
              lastRecvWidth = frame.displayWidth;
              lastRecvHeight = frame.displayHeight;
              const canvas = remoteCanvasRef.current;
              if (canvas) {
                const ctx = canvas.getContext("2d");
                if (ctx) {
                  canvas.width = frame.displayWidth;
                  canvas.height = frame.displayHeight;
                  ctx.drawImage(frame, 0, 0);
                }
              }
              frame.close();
            },
            error: (e) => {
              console.warn("[Video] Decoder error, will recover on next keyframe:", e);
              decoderState = "recovering";
              hasReceivedKeyframe = false;
              // Reset decoder — reconfigure so it's ready for next keyframe
              try {
                dec.reset();
                dec.configure({ codec: "vp8" });
                decoderState = "active";
              } catch {
                console.error("[Video] Decoder reset failed, creating new decoder");
              }
            },
          });
          dec.configure({ codec: "vp8" });
          return dec;
        }

        let decoder = createDecoder();
        console.log("[Video] VP8 decoder configured with auto-recovery");

        // --- Capture frames ---
        // @ts-expect-error MediaStreamTrackProcessor is not yet in TS lib types
        const processor = new MediaStreamTrackProcessor({ track: videoTrack });
        const reader = processor.readable.getReader();

        const frameDurationUs = Math.round(1_000_000 / VIDEO_FPS);
        let encoderTimestamp = 0;

        async function readFrames() {
          try {
            while (!cancelled) {
              const { value: videoFrame, done } = await reader.read();
              if (done || cancelled) {
                videoFrame?.close();
                break;
              }

              // Backpressure: skip frame if encoder queue is backed up
              if (encoder.state === "configured" && encoder.encodeQueueSize > 5) {
                sendDroppedTotal++;
                videoFrame.close();
                continue;
              }

              frameCount++;
              // Force keyframe every KEYFRAME_INTERVAL_FRAMES (1s)
              const isKeyFrame = frameCount % KEYFRAME_INTERVAL_FRAMES === 1;

              try {
                encoder.encode(videoFrame, { keyFrame: isKeyFrame });
              } catch (e) {
                console.warn("[Video] Encode error:", e);
                sendDroppedTotal++;
              }
              videoFrame.close();
              encoderTimestamp += frameDurationUs;
            }
          } catch (e) {
            if (!cancelled) console.error("[Video] Frame reader error:", e);
          }
        }
        readFrames();

        // --- Subscribe to incoming video data ---
        let recvTimestamp = 0;
        const unsubVideo = window.dchat.voice.onVideoData((videoData) => {
          if (!videoData?.data) return;

          // Decode base64 to raw bytes
          const raw = atob(videoData.data);
          const bytes = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) {
            bytes[i] = raw.charCodeAt(i);
          }

          // VP8 frame type detection: bit 0 of first byte (0 = keyframe, 1 = interframe)
          const isKey = bytes.length > 0 && (bytes[0] & 0x01) === 0;

          // Keyframe gating: skip delta frames until we get a keyframe
          if (!hasReceivedKeyframe) {
            if (isKey) {
              hasReceivedKeyframe = true;
              console.log("[Video] First keyframe received, decoding enabled");
            } else {
              recvDroppedTotal++;
              recvTimestamp += frameDurationUs;
              return;
            }
          }

          // Skip if decoder is in recovery state waiting for keyframe
          if (decoderState === "recovering" && !isKey) {
            recvDroppedTotal++;
            recvTimestamp += frameDurationUs;
            return;
          }

          const chunk = new EncodedVideoChunk({
            type: isKey ? "key" : "delta",
            timestamp: recvTimestamp,
            data: bytes.buffer,
          });

          try {
            if (decoder.state === "configured") {
              decoder.decode(chunk);
              recvFramesInWindow++;
              recvBytesInWindow += bytes.length;
            } else {
              // Decoder closed or unconfigured — recreate
              console.log("[Video] Decoder not configured, recreating...");
              try { decoder.close(); } catch {}
              decoder = createDecoder();
              hasReceivedKeyframe = false;
              recvDroppedTotal++;
            }
          } catch {
            recvDroppedTotal++;
            // If decode threw, mark for recovery
            hasReceivedKeyframe = false;
            decoderState = "recovering";
            try {
              decoder.reset();
              decoder.configure({ codec: "vp8" });
              decoderState = "active";
            } catch {
              // Will recreate on next attempt
            }
          }
          recvTimestamp += frameDurationUs;
        });

        cleanupRef.current = () => {
          cancelled = true;
          clearInterval(statsInterval);
          if (localAnimRef.current) cancelAnimationFrame(localAnimRef.current);
          localAnimRef.current = null;
          unsubVideo();
          reader.cancel().catch(() => {});
          try { encoder.close(); } catch {}
          try { decoder.close(); } catch {}
          localVideo.pause();
          localVideo.srcObject = null;
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        };
      } catch (err) {
        console.error("[Video] Failed to set up video:", err);
      }
    }

    setupVideo();

    return () => {
      cancelled = true;
      clearInterval(statsInterval);
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [isVideoCall]);

  // Handle video off/on
  useEffect(() => {
    const stream = streamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((track) => {
      track.enabled = !isVideoOff;
    });
  }, [isVideoOff]);

  return stats;
}
