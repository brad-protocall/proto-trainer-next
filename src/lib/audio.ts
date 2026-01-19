/**
 * Audio utilities for WebSocket voice communication
 *
 * Handles:
 * - PCM16 encoding/decoding
 * - Base64 conversion
 * - Queued audio playback
 */

// ============================================================================
// PCM16 Encoding/Decoding
// ============================================================================

/**
 * Convert Float32 audio samples to PCM16 Int16Array
 */
export function floatToPcm16(float32Array: Float32Array): Int16Array {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    // Clamp to [-1, 1] then scale to [-32768, 32767]
    const sample = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16[i] = sample < 0 ? sample * 32768 : sample * 32767;
  }
  return pcm16;
}

/**
 * Convert PCM16 Int16Array to Float32 audio samples
 */
export function pcm16ToFloat(pcm16: Int16Array): Float32Array {
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    float32[i] = pcm16[i] / 32768;
  }
  return float32;
}

// ============================================================================
// Base64 Encoding/Decoding
// ============================================================================

/**
 * Encode PCM16 audio data to base64 string
 */
export function base64EncodeAudio(pcm16: Int16Array): string {
  const uint8Array = new Uint8Array(pcm16.buffer);
  let binary = "";
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}

/**
 * Decode base64 string to Float32 audio samples
 */
export function base64DecodeAudio(base64Data: string): Float32Array {
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Convert PCM16 bytes to Float32
  const pcm16 = new Int16Array(bytes.buffer);
  return pcm16ToFloat(pcm16);
}

// ============================================================================
// AudioPlayer Class
// ============================================================================

export interface AudioPlayerOptions {
  sampleRate?: number;
  maxQueueSize?: number;
  onPlaybackStart?: () => void;
  onPlaybackEnd?: () => void;
}

/**
 * AudioPlayer class for queued playback of audio chunks
 *
 * Handles:
 * - Audio context management
 * - Queued playback of audio chunks
 * - Interruption for user speech
 */
export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private audioQueue: Float32Array[] = [];
  private isPlaying = false;
  private currentSource: AudioBufferSourceNode | null = null;
  private sampleRate: number;
  private maxQueueSize: number;
  private onPlaybackStart: (() => void) | undefined;
  private onPlaybackEnd: (() => void) | undefined;

  constructor(options: AudioPlayerOptions = {}) {
    this.sampleRate = options.sampleRate ?? 24000;
    this.maxQueueSize = options.maxQueueSize ?? 150;
    this.onPlaybackStart = options.onPlaybackStart;
    this.onPlaybackEnd = options.onPlaybackEnd;
  }

  /**
   * Initialize the audio context (must be called after user interaction)
   */
  async initialize(): Promise<void> {
    if (this.audioContext) {
      return;
    }

    this.audioContext = new AudioContext({ sampleRate: this.sampleRate });

    // Resume context if it's suspended (browser autoplay policy)
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  /**
   * Queue audio data for playback
   */
  queueAudio(audioData: Float32Array): void {
    // Prevent queue overflow
    if (this.audioQueue.length > this.maxQueueSize) {
      console.warn("Audio queue overflow, clearing backlog");
      this.audioQueue = [];
    }

    this.audioQueue.push(audioData);

    if (!this.isPlaying) {
      this.playNextChunk();
    }
  }

  /**
   * Queue base64-encoded audio for playback
   */
  queueBase64Audio(base64Data: string): void {
    const audioData = base64DecodeAudio(base64Data);
    this.queueAudio(audioData);
  }

  /**
   * Play the next chunk in the queue
   */
  private playNextChunk(): void {
    if (!this.audioContext) {
      console.error("AudioPlayer not initialized");
      return;
    }

    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      this.currentSource = null;
      this.onPlaybackEnd?.();
      return;
    }

    if (!this.isPlaying) {
      this.onPlaybackStart?.();
    }

    this.isPlaying = true;
    const audioData = this.audioQueue.shift()!;

    const buffer = this.audioContext.createBuffer(
      1,
      audioData.length,
      this.sampleRate
    );
    // Create a new Float32Array with explicit ArrayBuffer to satisfy TypeScript
    const channelData = new Float32Array(audioData.length);
    channelData.set(audioData);
    buffer.copyToChannel(channelData, 0);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    source.onended = () => this.playNextChunk();
    source.start();

    this.currentSource = source;
  }

  /**
   * Stop playback and clear queue (e.g., when user starts speaking)
   */
  stopPlayback(): void {
    this.audioQueue = [];
    this.isPlaying = false;

    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {
        // Source may have already ended
      }
      this.currentSource = null;
    }

    this.onPlaybackEnd?.();
  }

  /**
   * Check if audio is currently playing
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Get the current queue size
   */
  getQueueSize(): number {
    return this.audioQueue.length;
  }

  /**
   * Close the audio context and clean up resources
   */
  async close(): Promise<void> {
    this.stopPlayback();

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
  }
}
