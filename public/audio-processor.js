/**
 * AudioWorklet processor for microphone capture
 *
 * Captures microphone audio at 24kHz and outputs PCM16 data
 * for transmission to the OpenAI Realtime API via WebSocket.
 *
 * Usage:
 *   await audioContext.audioWorklet.addModule('/audio-processor.js');
 *   const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');
 *   workletNode.port.onmessage = (event) => {
 *     const { pcm16 } = event.data;
 *     // Convert to base64 and send via WebSocket
 *   };
 */

class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Buffer to accumulate samples before sending
    // 24000 samples/sec, send every ~170ms for smoother transmission
    this.buffer = new Float32Array(4096);
    this.bufferIndex = 0;
  }

  /**
   * Process audio input and convert to PCM16
   *
   * @param {Float32Array[][]} inputs - Array of inputs, each with channels
   * @param {Float32Array[][]} outputs - Array of outputs (unused)
   * @param {Object} parameters - Audio parameters (unused)
   * @returns {boolean} - Return true to keep processor alive
   */
  process(inputs, outputs, parameters) {
    const input = inputs[0];

    // No input available
    if (!input || !input[0]) {
      return true;
    }

    const samples = input[0];

    // Add samples to buffer
    for (let i = 0; i < samples.length; i++) {
      this.buffer[this.bufferIndex++] = samples[i];

      // When buffer is full, send PCM16 data
      if (this.bufferIndex >= this.buffer.length) {
        this.sendPcm16();
        this.bufferIndex = 0;
      }
    }

    return true;
  }

  /**
   * Convert buffered Float32 samples to PCM16 and send to main thread
   */
  sendPcm16() {
    // Convert Float32 to PCM16
    const pcm16 = new Int16Array(this.buffer.length);
    for (let i = 0; i < this.buffer.length; i++) {
      // Clamp to [-1, 1] then scale to [-32768, 32767]
      const sample = Math.max(-1, Math.min(1, this.buffer[i]));
      pcm16[i] = sample < 0 ? sample * 32768 : sample * 32767;
    }

    // Send to main thread
    this.port.postMessage({
      type: "audio",
      pcm16: pcm16,
    });
  }
}

// Register the processor
registerProcessor("audio-processor", AudioProcessor);
