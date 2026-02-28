// AudioWorklet globals — these are available in the AudioWorklet scope but not in TS DOM lib
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}
declare function registerProcessor(name: string, processorCtor: new () => AudioWorkletProcessor): void;

/**
 * AudioWorklet processor for capturing PCM audio frames.
 * Collects 20ms chunks (960 samples at 48kHz) and sends them to the main thread.
 */
class AudioCaptureProcessor extends AudioWorkletProcessor {
  private buffer: Float32Array;
  private writePos: number;
  private readonly frameSize: number;

  constructor() {
    super();
    // 20ms at 48kHz = 960 samples
    this.frameSize = 960;
    this.buffer = new Float32Array(this.frameSize);
    this.writePos = 0;
  }

  process(inputs: Float32Array[][], _outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channelData = input[0]; // mono
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
        // Send complete frame to main thread
        this.port.postMessage({
          type: "pcm-frame",
          data: this.buffer.slice(),
        });
        this.writePos = 0;
      }
    }

    return true;
  }
}

registerProcessor("audio-capture-processor", AudioCaptureProcessor);
