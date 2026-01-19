// Audio utilities for voice training

/**
 * AudioPlayer class for queued playback of PCM16 audio
 */
export class AudioPlayer {
  private audioContext: AudioContext | null = null
  private queue: Float32Array[] = []
  private isPlaying = false
  private sampleRate = 24000

  constructor(sampleRate = 24000) {
    this.sampleRate = sampleRate
  }

  private async ensureContext() {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext({ sampleRate: this.sampleRate })
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume()
    }
    return this.audioContext
  }

  /**
   * Enqueue base64-encoded PCM16 audio for playback
   */
  enqueue(base64Audio: string) {
    const pcm16 = base64ToFloat32(base64Audio)
    this.queue.push(pcm16)
    this.processQueue()
  }

  private async processQueue() {
    if (this.isPlaying || this.queue.length === 0) return

    this.isPlaying = true
    const context = await this.ensureContext()

    while (this.queue.length > 0) {
      const audioData = this.queue.shift()!
      await this.playBuffer(context, audioData)
    }

    this.isPlaying = false
  }

  private playBuffer(context: AudioContext, audioData: Float32Array): Promise<void> {
    return new Promise((resolve) => {
      const buffer = context.createBuffer(1, audioData.length, this.sampleRate)
      // Copy data from source array to buffer channel
      const channelData = buffer.getChannelData(0)
      channelData.set(audioData)

      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(context.destination)
      source.onended = () => resolve()
      source.start()
    })
  }

  stop() {
    this.queue = []
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(console.error)
      this.audioContext = null
    }
    this.isPlaying = false
  }
}

/**
 * Convert Float32Array to base64-encoded PCM16
 */
export function base64EncodeAudio(float32Data: Float32Array): string {
  const int16Data = new Int16Array(float32Data.length)

  for (let i = 0; i < float32Data.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Data[i]))
    int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }

  const bytes = new Uint8Array(int16Data.buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Convert base64-encoded PCM16 to Float32Array
 */
export function base64ToFloat32(base64: string): Float32Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  const int16Data = new Int16Array(bytes.buffer)
  const float32Data = new Float32Array(int16Data.length)

  for (let i = 0; i < int16Data.length; i++) {
    float32Data[i] = int16Data[i] / (int16Data[i] < 0 ? 0x8000 : 0x7fff)
  }

  return float32Data
}

/**
 * Convert PCM16 Int16Array to Float32Array
 */
export function pcm16ToFloat32(int16Data: Int16Array): Float32Array {
  const float32Data = new Float32Array(int16Data.length)

  for (let i = 0; i < int16Data.length; i++) {
    float32Data[i] = int16Data[i] / (int16Data[i] < 0 ? 0x8000 : 0x7fff)
  }

  return float32Data
}

/**
 * Convert Float32Array to PCM16 Int16Array
 */
export function float32ToPcm16(float32Data: Float32Array): Int16Array {
  const int16Data = new Int16Array(float32Data.length)

  for (let i = 0; i < float32Data.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Data[i]))
    int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }

  return int16Data
}
