'use client';

import { useState, useRef, useCallback } from 'react';

interface UseAudioRecorderResult {
  isRecording: boolean;
  recordingSeconds: number;
  startRecording: () => Promise<boolean>;
  stopRecording: () => Promise<Blob | null>;
  error: string | null;
  clearError: () => void;
}

const MAX_RECORDING_SECONDS = 15;
const MIN_RECORDING_MS = 800; // Minimum 0.8s duration
const MIN_SPEECH_RMS = 0.012; // Minimum audio energy threshold to reject pure silence

export function useAudioRecorder(): UseAudioRecorderResult {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const vadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const startTimeRef = useRef<number>(0);
  const maxRmsRef = useRef<number>(0);

  const clearError = useCallback(() => setError(null), []);

  const cleanupMedia = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
    setRecordingSeconds(0);
  }, []);

  const startRecording = useCallback(async (): Promise<boolean> => {
    setError(null);
    chunksRef.current = [];
    maxRmsRef.current = 0;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Microphone API not supported in this browser.');
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      // Setup Web Audio API Analyser for real-time Voice Activity Detection (VAD)
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const audioCtx = new AudioCtx();
        audioCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        const buffer = new Uint8Array(analyser.fftSize);
        vadIntervalRef.current = setInterval(() => {
          analyser.getByteTimeDomainData(buffer);
          let sumSquares = 0;
          for (let i = 0; i < buffer.length; i++) {
            const normalized = (buffer[i] - 128) / 128;
            sumSquares += normalized * normalized;
          }
          const rms = Math.sqrt(sumSquares / buffer.length);
          if (rms > maxRmsRef.current) {
            maxRmsRef.current = rms;
          }
        }, 100);
      } catch {
        // Fallback if Web Audio analyser is restricted
        maxRmsRef.current = 1;
      }

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      startTimeRef.current = Date.now();
      recorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev + 1 >= MAX_RECORDING_SECONDS) {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
              mediaRecorderRef.current.stop();
            }
            return MAX_RECORDING_SECONDS;
          }
          return prev + 1;
        });
      }, 1000);

      return true;
    } catch (err) {
      cleanupMedia();
      const message =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone permission denied. Please allow mic access.'
          : 'Unable to access microphone.';
      setError(message);
      return false;
    }
  }, [cleanupMedia]);

  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      const elapsedMs = Date.now() - startTimeRef.current;

      if (!recorder || recorder.state === 'inactive') {
        cleanupMedia();
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(chunksRef.current, { type: mimeType });
        const peakRms = maxRmsRef.current;
        chunksRef.current = [];
        cleanupMedia();

        // 1. Reject accidental rapid taps (< 0.8s)
        if (elapsedMs < MIN_RECORDING_MS || audioBlob.size < 1500) {
          setError('Audio too short. Speak for at least 1 second.');
          resolve(null);
          return;
        }

        // 2. Reject dead silence before hitting external API
        if (peakRms < MIN_SPEECH_RMS) {
          setError('No voice detected. Please speak closer to the mic.');
          resolve(null);
          return;
        }

        resolve(audioBlob);
      };

      recorder.stop();
    });
  }, [cleanupMedia]);

  return {
    isRecording,
    recordingSeconds,
    startRecording,
    stopRecording,
    error,
    clearError,
  };
}