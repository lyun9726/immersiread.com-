/**
 * Google Cloud TTS API Route
 * 
 * Converts text to speech using Google Cloud Text-to-Speech API.
 * This is a fallback for browsers that don't support Web Speech API.
 * 
 * Pricing: ~$4 per 1 million characters (standard voices)
 * Free tier: 1 million characters per month
 */

import { NextRequest, NextResponse } from "next/server";

// Google Cloud TTS API endpoint
const GOOGLE_TTS_API_URL = "https://texttospeech.googleapis.com/v1/text:synthesize";

// Default voice settings for different languages
const VOICE_CONFIGS: Record<string, { languageCode: string; name: string; ssmlGender: string }> = {
    "zh": { languageCode: "zh-CN", name: "cmn-CN-Wavenet-A", ssmlGender: "FEMALE" },
    "zh-CN": { languageCode: "zh-CN", name: "cmn-CN-Wavenet-A", ssmlGender: "FEMALE" },
    "zh-TW": { languageCode: "zh-TW", name: "cmn-TW-Wavenet-A", ssmlGender: "FEMALE" },
    "en": { languageCode: "en-US", name: "en-US-Wavenet-D", ssmlGender: "MALE" },
    "en-US": { languageCode: "en-US", name: "en-US-Wavenet-D", ssmlGender: "MALE" },
    "en-GB": { languageCode: "en-GB", name: "en-GB-Wavenet-A", ssmlGender: "FEMALE" },
    "ja": { languageCode: "ja-JP", name: "ja-JP-Wavenet-A", ssmlGender: "FEMALE" },
    "ko": { languageCode: "ko-KR", name: "ko-KR-Wavenet-A", ssmlGender: "FEMALE" },
    "es": { languageCode: "es-ES", name: "es-ES-Wavenet-B", ssmlGender: "MALE" },
    "fr": { languageCode: "fr-FR", name: "fr-FR-Wavenet-A", ssmlGender: "FEMALE" },
    "de": { languageCode: "de-DE", name: "de-DE-Wavenet-A", ssmlGender: "FEMALE" },
    "it": { languageCode: "it-IT", name: "it-IT-Wavenet-A", ssmlGender: "FEMALE" },
    "pt": { languageCode: "pt-BR", name: "pt-BR-Wavenet-A", ssmlGender: "FEMALE" },
    "ru": { languageCode: "ru-RU", name: "ru-RU-Wavenet-A", ssmlGender: "FEMALE" },
    "ar": { languageCode: "ar-XA", name: "ar-XA-Wavenet-A", ssmlGender: "FEMALE" },
    "hi": { languageCode: "hi-IN", name: "hi-IN-Wavenet-A", ssmlGender: "FEMALE" },
    "th": { languageCode: "th-TH", name: "th-TH-Standard-A", ssmlGender: "FEMALE" },
    "vi": { languageCode: "vi-VN", name: "vi-VN-Wavenet-A", ssmlGender: "FEMALE" },
};

// Default to Chinese if language not found
const DEFAULT_VOICE = VOICE_CONFIGS["zh"];

// Maximum text length per request (to control costs)
const MAX_TEXT_LENGTH = 5000;

export async function POST(request: NextRequest) {
    try {
        const GOOGLE_API_KEY = process.env.GOOGLE_CLOUD_TTS_API_KEY;

        if (!GOOGLE_API_KEY) {
            return NextResponse.json(
                { error: "Google Cloud TTS API key not configured" },
                { status: 500 }
            );
        }

        const body = await request.json();
        const { text, language = "zh", speakingRate = 1.0, pitch = 0 } = body;

        if (!text || typeof text !== "string") {
            return NextResponse.json(
                { error: "Text is required" },
                { status: 400 }
            );
        }

        // Limit text length to control costs
        const truncatedText = text.slice(0, MAX_TEXT_LENGTH);
        if (text.length > MAX_TEXT_LENGTH) {
            console.warn(`[Google TTS] Text truncated from ${text.length} to ${MAX_TEXT_LENGTH} characters`);
        }

        // Get voice configuration for the language
        const voiceConfig = VOICE_CONFIGS[language] || DEFAULT_VOICE;

        const requestBody = {
            input: { text: truncatedText },
            voice: {
                languageCode: voiceConfig.languageCode,
                name: voiceConfig.name,
                ssmlGender: voiceConfig.ssmlGender,
            },
            audioConfig: {
                audioEncoding: "MP3",
                speakingRate: Math.max(0.25, Math.min(4.0, speakingRate)), // Clamp to valid range
                pitch: Math.max(-20.0, Math.min(20.0, pitch)), // Clamp to valid range
            },
        };

        console.log(`[Google TTS] Synthesizing ${truncatedText.length} chars in ${voiceConfig.languageCode}`);

        const response = await fetch(`${GOOGLE_TTS_API_URL}?key=${GOOGLE_API_KEY}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error("[Google TTS] API Error:", errorData);
            return NextResponse.json(
                { error: "TTS synthesis failed", details: errorData },
                { status: response.status }
            );
        }

        const data = await response.json();

        if (!data.audioContent) {
            return NextResponse.json(
                { error: "No audio content returned" },
                { status: 500 }
            );
        }

        // Return base64 encoded audio
        return NextResponse.json({
            audioContent: data.audioContent, // Base64 encoded MP3
            format: "mp3",
            language: voiceConfig.languageCode,
            charactersUsed: truncatedText.length,
        });

    } catch (error) {
        console.error("[Google TTS] Error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

// GET endpoint to check TTS availability and remaining quota
export async function GET() {
    const GOOGLE_API_KEY = process.env.GOOGLE_CLOUD_TTS_API_KEY;

    return NextResponse.json({
        available: !!GOOGLE_API_KEY,
        provider: "google",
        supportedLanguages: Object.keys(VOICE_CONFIGS),
    });
}
