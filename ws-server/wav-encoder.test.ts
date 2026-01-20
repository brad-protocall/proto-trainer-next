import { describe, it, expect } from "vitest";
import { encodeWav, calculateDuration } from "./wav-encoder";

describe("WAV encoder", () => {
  it("produces valid WAV header", () => {
    const samples = Buffer.alloc(4800); // 100ms of silence at 24kHz mono 16-bit
    const wav = encodeWav(samples);

    expect(wav.slice(0, 4).toString()).toBe("RIFF");
    expect(wav.slice(8, 12).toString()).toBe("WAVE");
    expect(wav.slice(12, 16).toString()).toBe("fmt ");
  });

  it("includes correct file size in header", () => {
    const samples = Buffer.alloc(4800);
    const wav = encodeWav(samples);

    // File size is stored at offset 4 (little-endian)
    // Should be 36 + dataSize
    const fileSize = wav.readUInt32LE(4);
    expect(fileSize).toBe(36 + 4800);
  });

  it("includes correct data chunk size", () => {
    const samples = Buffer.alloc(4800);
    const wav = encodeWav(samples);

    // Data size is stored at offset 40 (little-endian)
    const dataSize = wav.readUInt32LE(40);
    expect(dataSize).toBe(4800);
  });

  it("includes correct audio format (PCM = 1)", () => {
    const samples = Buffer.alloc(4800);
    const wav = encodeWav(samples);

    // Audio format is at offset 20
    const audioFormat = wav.readUInt16LE(20);
    expect(audioFormat).toBe(1);
  });

  it("includes correct sample rate", () => {
    const samples = Buffer.alloc(4800);
    const wav = encodeWav(samples, { sampleRate: 24000, numChannels: 1, bitDepth: 16 });

    // Sample rate is at offset 24
    const sampleRate = wav.readUInt32LE(24);
    expect(sampleRate).toBe(24000);
  });

  it("includes correct number of channels", () => {
    const samples = Buffer.alloc(4800);
    const wav = encodeWav(samples);

    // NumChannels is at offset 22
    const numChannels = wav.readUInt16LE(22);
    expect(numChannels).toBe(1);
  });

  it("has total size of header + data", () => {
    const samples = Buffer.alloc(4800);
    const wav = encodeWav(samples);

    expect(wav.length).toBe(44 + 4800);
  });

  it("copies audio data into output buffer", () => {
    const samples = Buffer.alloc(100);
    // Fill with non-zero pattern
    for (let i = 0; i < 100; i++) {
      samples[i] = i;
    }
    const wav = encodeWav(samples);

    // Audio data starts at offset 44
    const audioData = wav.slice(44);
    expect(audioData).toEqual(samples);
  });
});

describe("calculateDuration", () => {
  it("calculates duration correctly for 24kHz mono 16-bit", () => {
    // 24000 samples/sec * 1 channel * 2 bytes/sample = 48000 bytes/sec
    const oneSecond = 48000;
    expect(calculateDuration(oneSecond)).toBe(1);
    expect(calculateDuration(oneSecond * 60)).toBe(60);
  });

  it("calculates duration correctly for 44.1kHz stereo 16-bit", () => {
    // 44100 samples/sec * 2 channels * 2 bytes/sample = 176400 bytes/sec
    const oneSecond = 176400;
    const options = { sampleRate: 44100, numChannels: 2, bitDepth: 16 };
    expect(calculateDuration(oneSecond, options)).toBe(1);
  });

  it("returns 0 for empty data", () => {
    expect(calculateDuration(0)).toBe(0);
  });
});
