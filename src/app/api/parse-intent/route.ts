import { NextResponse } from 'next/server';

const MAX_TRANSCRIPT_LENGTH = 500;

interface ParsedAgentOutput {
  item: string;
  quantity: number;
  amountXOF: number;
  confidence: 'high' | 'medium' | 'low';
}

interface GroqModel {
  id: string;
  active?: boolean;
}

let cachedChatModels: string[] | null = null;

const SYSTEM_PROMPT = `You are BaatSats AI, a financial point-of-sale parser for street merchants in Dakar, Senegal (Marché Sandaga).
Extract structured transaction data from a merchant's spoken transcript in Wolof, French, English, or code-switched combinations.

Rules:
1. Convert ALL spoken number words into exact integer XOF (CFA Franc) amounts:
   - French: "cinq cents" = 500, "mille" = 1000, "quinze cents" = 1500, "deux mille" = 2000, "trois mille cinq cents" = 3500, "dix mille" = 10000.
   - Wolof (standard & French-phonetic ASR spellings):
     * "benn" / "ben" = 1
     * "ñaar" / "ñaari" / "niar" / "niari" = 2
     * "ñett" / "ñetti" / "niet" / "nietti" = 3
     * "ñent" / "nient" = 4
     * "juróom" / "diourom" / "juroom" = 5
     * "fukk" / "fouk" = 10
     * "tééméér" / "temer" / "témér" = 100 (e.g., "juróomi tééméér" / "diouromi temer" = 500)
     * "junni" / "diouni" / "jouni" = 1000 (e.g., "ñaari junni" / "niari diouni" = 2000; "ñetti junni ak juróomi tééméér" = 3500)
   - English: "thirty five hundred" = 3500, "four thousand five hundred" = 4500.
2. Extract integer "quantity" (default 1 if unspecified).
3. Extract "item" as a clean, Title-Cased product name WITHOUT repeating the quantity number or number word inside "item":
   - Examples: "3 bags of rice" -> quantity: 3, item: "Bags of Rice"; "deux tissus" -> quantity: 2, item: "Tissus"; "ñaari tééré" / "niari téré" -> quantity: 2, item: "Tééré".
   - If no specific product is named, use "Jaay Marché" (if lang is "wo"), "Vente Marché" (if lang is "fr"), or "Market Sale" (if lang is "en").
4. Set "confidence" to "high" if both item and amount are clear, "medium" if inferred, or "low" if no price/amount was spoken (set amountXOF to 0 if no price is mentioned).

Output ONLY raw valid JSON with no markdown or extra text:
{"item":"string","quantity":1,"amountXOF":0,"confidence":"high"}`;

function rankModel(id: string): number {
  const lower = id.toLowerCase();
  if (lower.includes('llama-4-scout') || lower.includes('llama-4-maverick')) return 1;
  if (lower.includes('llama-3.3') || lower.includes('llama-3.1-8b-instant')) return 2;
  if (lower.includes('llama') || lower.includes('gemma')) return 3;
  if (lower.includes('qwen') || lower.includes('deepseek') || lower.includes('gpt-oss')) return 5;
  return 4;
}

async function getActiveGroqChatModels(apiKey: string): Promise<string[]> {
  if (cachedChatModels && cachedChatModels.length > 0) {
    return cachedChatModels;
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(4000),
    });

    if (res.ok) {
      const payload = (await res.json()) as { data?: GroqModel[] };
      const excludedKeywords = [
        'whisper',
        'guard',
        'tts',
        'orpheus',
        'playai',
        'embed',
        'rerank',
        'compound',
      ];

      const models = (payload.data || [])
        .filter((m) => m.active !== false)
        .map((m) => m.id)
        .filter((id) => !excludedKeywords.some((kw) => id.toLowerCase().includes(kw)))
        .sort((a, b) => rankModel(a) - rankModel(b));

      if (models.length > 0) {
        cachedChatModels = models;
        return models;
      }
    }
  } catch {
    // Fall through to static candidate list
  }

  return [
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'llama-3.1-8b-instant',
    'qwen/qwen3-32b',
  ];
}

function toTitleCase(str: string): string {
  return str
    .split(/\s+/)
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : ''))
    .join(' ');
}

function defaultItemForLang(lang: string): string {
  if (lang === 'en') return 'Market Sale';
  if (lang === 'fr') return 'Vente Marché';
  return 'Jaay Marché';
}

function fallbackRuleParser(transcript: string, lang: string): ParsedAgentOutput {
  const cleaned = transcript.replace(/,/g, '');
  const amountMatch = cleaned.match(/\b(\d{3,7})\b/);
  const qtyMatch = cleaned.match(/\b([1-9]\d?)\s+(?!fcfa|francs|sats|mille|cents|hundred|thousand)/i);

  const amountXOF = amountMatch ? parseInt(amountMatch[1], 10) : 0;
  const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

  return {
    item: defaultItemForLang(lang),
    quantity,
    amountXOF,
    confidence: amountXOF > 0 ? 'medium' : 'low',
  };
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Server configuration error: GROQ_API_KEY is missing.' },
        { status: 500 }
      );
    }

    const body = (await request.json()) as { transcript?: unknown; lang?: unknown };
    const transcript = typeof body.transcript === 'string' ? body.transcript.trim() : '';
    const lang = typeof body.lang === 'string' ? body.lang : 'wo';

    if (!transcript || transcript.length > MAX_TRANSCRIPT_LENGTH) {
      return NextResponse.json(
        { error: 'Invalid or overly long transcript input.' },
        { status: 400 }
      );
    }

    const candidateModels = await getActiveGroqChatModels(apiKey);
    let parsedJson: Partial<ParsedAgentOutput> | null = null;

    for (const modelId of candidateModels.slice(0, 4)) {
      try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: modelId,
            temperature: 0.1,
            max_tokens: 512,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              {
                role: 'user',
                content: `Merchant UI Language: ${lang}\nSpoken Transcript: "${transcript}"`,
              },
            ],
          }),
        });

        if (!groqRes.ok) {
          cachedChatModels = null;
          continue;
        }

        const completion = (await groqRes.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const rawContent = completion.choices?.[0]?.message?.content ?? '';

        const withoutThink = rawContent
          .replace(/<think>[\s\S]*?<\/think>/gi, '')
          .replace(/```json|```/gi, '')
          .trim();

        const jsonMatch = withoutThink.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          continue;
        }

        const candidateObj = JSON.parse(jsonMatch[0]) as Partial<ParsedAgentOutput>;
        if (typeof candidateObj === 'object' && candidateObj !== null) {
          parsedJson = candidateObj;
          break;
        }
      } catch {
        continue;
      }
    }

    const sourceObj = parsedJson ?? fallbackRuleParser(transcript, lang);

    const cleanQuantity =
      typeof sourceObj.quantity === 'number' &&
      Number.isFinite(sourceObj.quantity) &&
      sourceObj.quantity >= 1
        ? Math.min(Math.round(sourceObj.quantity), 9999)
        : 1;

    let rawItem =
      typeof sourceObj.item === 'string' && sourceObj.item.trim().length > 0
        ? sourceObj.item.trim()
        : defaultItemForLang(lang);

    // Strip duplicate leading digits or written number words when quantity > 1
    if (cleanQuantity > 1) {
      const leadingQtyPattern = new RegExp(
        `^(?:${cleanQuantity}\\s*[x×]?|two|three|four|five|six|seven|eight|nine|ten|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|ñaar|ñaari|niari|ñett|ñetti|nietti|ñent|juróom)\\s+`,
        'i'
      );
      rawItem = rawItem.replace(leadingQtyPattern, '').trim();
    }

    const cleanItem = toTitleCase(rawItem || defaultItemForLang(lang)).slice(0, 60);

    const cleanAmountXOF =
      typeof sourceObj.amountXOF === 'number' &&
      Number.isFinite(sourceObj.amountXOF) &&
      sourceObj.amountXOF >= 0
        ? Math.min(Math.round(sourceObj.amountXOF), 10_000_000)
        : 0;

    const cleanConfidence =
      sourceObj.confidence === 'high' ||
      sourceObj.confidence === 'medium' ||
      sourceObj.confidence === 'low'
        ? sourceObj.confidence
        : 'medium';

    return NextResponse.json({
      item: cleanItem,
      quantity: cleanQuantity,
      amountXOF: cleanAmountXOF,
      confidence: cleanConfidence,
    });
  } catch (error) {
    console.error('Parse intent error:', error instanceof Error ? error.message : 'Unknown');
    return NextResponse.json(
      { error: 'Failed to parse merchant voice intent.' },
      { status: 500 }
    );
  }
}