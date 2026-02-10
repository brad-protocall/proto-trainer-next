"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface UseAudioRecorderOptions {
  localTrack: MediaStreamTrack | null | undefined;
  remoteTrack: MediaStreamTrack | null | undefined;
  enabled: boolean;
}

interface UseAudioRecorderResult {
  isRecording: boolean;
  stopRecording: () => Promise<Blob | null>;
  recordingError: string | null;
}

const MIME_TYPE = "audio/webm;codecs=opus";
const TIMESLICE_MS = 1000;

/**
 * Browser-side audio recorder that mixes local mic + remote agent audio
 * via AudioContext and records with MediaRecorder.
 *
 * Simplified design:
 * - Waits for BOTH tracks before starting (no hot-swap)
 * - Single MIME type check (webm/opus or skip)
 * - stopRecording() returns the accumulated blob
 * - Cleanup on unmount stops recording and closes AudioContext
 */
export function useAudioRecorder({
  localTrack,
  remoteTrack,
  enabled,
}: UseAudioRecorderOptions): UseAudioRecorderResult {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedRef = useRef(false);
  const stoppedRef = useRef(false);
  const mimeTypeRef = useRef<string>(MIME_TYPE);

  // Start recording when enabled + both tracks available (once only)
  useEffect(() => {
    if (!enabled || !localTrack || !remoteTrack || startedRef.current) return;

    // Check browser support
    if (typeof MediaRecorder === "undefined") {
      setRecordingError("MediaRecorder not supported");
      return;
    }

    if (!MediaRecorder.isTypeSupported(MIME_TYPE)) {
      // Try without codec spec
      if (MediaRecorder.isTypeSupported("audio/webm")) {
        mimeTypeRef.current = "audio/webm";
      } else {
        setRecordingError("WebM recording not supported in this browser");
        return;
      }
    }

    try {
      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();

      // Mix both tracks into a single output
      const localSource = audioContext.createMediaStreamSource(
        new MediaStream([localTrack])
      );
      const remoteSource = audioContext.createMediaStreamSource(
        new MediaStream([remoteTrack])
      );
      localSource.connect(destination);
      remoteSource.connect(destination);

      const recorder = new MediaRecorder(destination.stream, {
        mimeType: mimeTypeRef.current,
      });

      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onerror = () => {
        setRecordingError("Recording error occurred");
        setIsRecording(false);
      };

      recorder.start(TIMESLICE_MS);

      mediaRecorderRef.current = recorder;
      audioContextRef.current = audioContext;
      startedRef.current = true;
      stoppedRef.current = false;
      setIsRecording(true);
    } catch (err) {
      setRecordingError(
        err instanceof Error ? err.message : "Failed to start recording"
      );
    }
  }, [enabled, localTrack, remoteTrack]);

  // Stop recording and return blob
  const stopRecording = useCallback((): Promise<Blob | null> => {
    if (stoppedRef.current || !mediaRecorderRef.current) {
      // Already stopped or never started — return blob from existing chunks
      if (chunksRef.current.length > 0) {
        return Promise.resolve(
          new Blob(chunksRef.current, { type: mimeTypeRef.current })
        );
      }
      return Promise.resolve(null);
    }

    stoppedRef.current = true;
    const recorder = mediaRecorderRef.current;

    return new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        setIsRecording(false);
        const blob =
          chunksRef.current.length > 0
            ? new Blob(chunksRef.current, { type: mimeTypeRef.current })
            : null;

        // Close AudioContext
        audioContextRef.current?.close().catch(() => {});
        audioContextRef.current = null;
        mediaRecorderRef.current = null;

        resolve(blob);
      };

      if (recorder.state === "recording") {
        recorder.stop();
      } else {
        // Already inactive
        setIsRecording(false);
        const blob =
          chunksRef.current.length > 0
            ? new Blob(chunksRef.current, { type: mimeTypeRef.current })
            : null;
        audioContextRef.current?.close().catch(() => {});
        audioContextRef.current = null;
        mediaRecorderRef.current = null;
        resolve(blob);
      }
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      audioContextRef.current?.close().catch(() => {});
    };
  }, []);

  return { isRecording, stopRecording, recordingError };
}
