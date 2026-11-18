import { NextResponse } from 'next/server';

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB strict limit

// Common Whisper silence hallucinations across French/English
const SILENCE_HALLUCINATIONS = new Set([
  'merci',
  'merci beaucoup',
  'thank you',
  'thanks',
  'thanks for watching',
  'sous titres',
  'you',
  'bye',
]);

interface WhisperSegment {
  no_speech_prob?: number;
}

interface WhisperVerboseResponse {
  text?: string;
  segments?: WhisperSegment[];
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Server configuration error: GROQ_API_KEY is missing in .env.local' },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const audioFile = formData.get('audio');
    const lang = (formData.get('lang') as string) || 'wo';

    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json(
        { error: 'Invalid request: missing audio payload.' },
        { status: 400 }
      );
    }

    if (audioFile.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'Audio file exceeds 2MB limit.' },
        { status: 413 }
      );
    }

    const groqForm = new FormData();
    const extension = audioFile.type.includes('mp4') ? 'mp4' : 'webm';
    groqForm.append('file', audioFile, `merchant-voice.${extension}`);
    groqForm.append('model', 'whisper-large-v3');
    groqForm.append('response_format', 'verbose_json');
    groqForm.append('temperature', '0');

   if (lang === 'en') {
      groqForm.append('language', 'en');
      groqForm.append(
        'prompt',
        'Dakar Sandaga market merchant sale: FCFA, francs, sats, bitcoin, bags of rice, fabric, 500, 1000, 3500, 4500.'
      );
    } else if (lang === 'wo') {
      groqForm.append('language', 'fr');
      groqForm.append(
        'prompt',
        'Jaaykat ci Marché Sandaga Dakar (Wolof ak Français): Jaay naa benn, ñaari tééré, ñetti junni ak juróomi tééméér FCFA. Ceeb, thiéboudienne, attaya, dibi, mango, xaalis, fey, fukk, tééméér, junni, 500, 1000, 2000, 3500, 5000 francs.'
      );
    } else {
      groqForm.append('language', 'fr');
      groqForm.append(
        'prompt',
        'Transaction commerciale au Marché Sandaga à Dakar: Vendu deux tissus pour trois mille cinq cents FCFA. Thiéboudienne, attaya, dibi, sac de riz, sats, bitcoin, 500, 1000, 2000, 3500, 5000 francs.'
      );
    }

    const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: groqForm,
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      console.error('Groq Whisper upstream error status:', groqResponse.status);
      return NextResponse.json(
        { error: `Speech recognition failed (${groqResponse.status}): ${errText.slice(0, 120)}` },
        { status: 502 }
      );
    }

    const data = (await groqResponse.json()) as WhisperVerboseResponse;
    const transcript = (data.text || '').trim();

    // 1. Check Whisper's internal no_speech_prob metric
    const segments = data.segments || [];
    const avgNoSpeechProb =
      segments.length > 0
        ? segments.reduce((acc, seg) => acc + (seg.no_speech_prob ?? 0), 0) / segments.length
        : 0;

    // 2. Strip punctuation to test for empty or silence-hallucinated phrases
    const normalized = transcript
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (
      !transcript ||
      normalized.length < 2 ||
      avgNoSpeechProb > 0.65 ||
      SILENCE_HALLUCINATIONS.has(normalized)
    ) {
      return NextResponse.json(
        { error: 'No clear speech detected. Please speak closer to the mic.' },
        { status: 422 }
      );
    }

    return NextResponse.json({ transcript });
  } catch (error) {
    console.error('Transcription route exception:', error instanceof Error ? error.message : 'Unknown');
    return NextResponse.json(
      { error: 'Unexpected server error while processing audio.' },
      { status: 500 }
    );
  }
}