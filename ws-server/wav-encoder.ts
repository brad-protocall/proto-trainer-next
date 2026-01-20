/**
 * WAV Encoder for voice recordings
 *
 * Encodes raw PCM16 audio samples into WAV format with proper headers.
 * Used for persisting voice training sessions.
 */

export interface WavOptions {
  sampleRate: number;
  numChannels: number;
  bitDepth: number;
}

const DEFAULT_OPTIONS: WavOptions = {
  sampleRate: 24000,
  numChannels: 1,
  bitDepth: 16,
};

/**
 * Encode raw PCM samples into a WAV file buffer
 */
export function encodeWav(
  samples: Buffer,
  options: WavOptions = DEFAULT_OPTIONS
): Buffer {
  const { sampleRate, numChannels, bitDepth } = options;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length;
  const fileSize = 36 + dataSize;

  // Create buffer for WAV file
  const wav = Buffer.alloc(44 + dataSize);
  let offset = 0;

  // RIFF header
  wav.write("RIFF", offset);
  offset += 4;
  wav.writeUInt32LE(fileSize, offset);
  offset += 4;
  wav.write("WAVE", offset);
  offset += 4;

  // fmt subchunk
  wav.write("fmt ", offset);
  offset += 4;
  wav.writeUInt32LE(16, offset); // Subchunk1Size (16 for PCM)
  offset += 4;
  wav.writeUInt16LE(1, offset); // AudioFormat (1 for PCM)
  offset += 2;
  wav.writeUInt16LE(numChannels, offset);
  offset += 2;
  wav.writeUInt32LE(sampleRate, offset);
  offset += 4;
  wav.writeUInt32LE(byteRate, offset);
  offset += 4;
  wav.writeUInt16LE(blockAlign, offset);
  offset += 2;
  wav.writeUInt16LE(bitDepth, offset);
  offset += 2;

  // data subchunk
  wav.write("data", offset);
  offset += 4;
  wav.writeUInt32LE(dataSize, offset);
  offset += 4;

  // Audio data
  samples.copy(wav, offset);

  return wav;
}

/**
 * Calculate duration in seconds from PCM data size
 */
export function calculateDuration(
  dataSize: number,
  options: WavOptions = DEFAULT_OPTIONS
): number {
  const { sampleRate, numChannels, bitDepth } = options;
  const bytesPerSample = bitDepth / 8;
  const bytesPerSecond = sampleRate * numChannels * bytesPerSample;
  return Math.round(dataSize / bytesPerSecond);
}
