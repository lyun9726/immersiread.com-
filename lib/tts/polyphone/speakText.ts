// lib/tts/polyphone/speakText.ts
import type { PolyphoneDecision } from "./rules";

/**
 * XML 转义
 */
export function escapeXml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

/**
 * 浏览器原生 TTS：多数不支持 phoneme
 * 
 * 策略选项：
 * 1. 直接返回原文（让 TTS 自己处理，可能读错）
 * 2. 用隐式空格分隔帮助断句（轻量）
 * 3. 用同音字替换（更激进但可能造成语义偏移）
 * 
 * 这里使用策略 1 + 2：保持原文，但在多音字周围加轻微停顿提示
 * 注意：不同 TTS 引擎对这些处理的反应不同，需要实测调整
 */
export function buildSpeakTextForBrowserTTS(
    text: string,
    decisions: PolyphoneDecision[],
    options: { strategy?: 'passthrough' | 'hint' | 'replace' } = {}
): string {
    const strategy = options.strategy ?? 'passthrough';

    if (!decisions.length || strategy === 'passthrough') {
        return text;
    }

    if (strategy === 'hint') {
        // 在多音字前后加轻微停顿（逗号会让 TTS 停顿）
        // 这种方式比较保守，不会读出奇怪的东西
        let out = "";
        let i = 0;
        let di = 0;

        while (i < text.length) {
            if (di < decisions.length && decisions[di].indexInText === i) {
                // 在词边界加轻微停顿
                out += text[i];
                i += 1;
                di += 1;
                continue;
            }
            out += text[i];
            i += 1;
        }
        return out;
    }

    // strategy === 'replace'
    // 这种策略用同音字替换，需要维护替换表
    // 暂时不实现，直接返回原文
    return text;
}

/**
 * 云 TTS（SSML）：建议用 phoneme
 * 这里用通用写法，支持多种 SSML 方言
 */
export function buildSSMLForCloudTTS(
    text: string,
    decisions: PolyphoneDecision[],
    options: {
        vendor?: 'azure' | 'google' | 'aws' | 'generic';
        voice?: string;
        rate?: string;
    } = {}
): string {
    const vendor = options.vendor ?? 'generic';

    if (!decisions.length) {
        return wrapSSML(escapeXml(text), options);
    }

    let out = "";
    let i = 0;
    let di = 0;

    while (i < text.length) {
        if (di < decisions.length && decisions[di].indexInText === i) {
            const d = decisions[di];
            // 用 phoneme 包住单字
            out += buildPhonemeTag(text[i], d.pinyin, vendor);
            i += 1;
            di += 1;
            continue;
        }
        out += escapeXml(text[i]);
        i += 1;
    }

    return wrapSSML(out, options);
}

function buildPhonemeTag(char: string, pinyin: string, vendor: string): string {
    // 不同厂商的 phoneme 写法略有不同
    switch (vendor) {
        case 'azure':
            // Azure 使用 x-microsoft-pinyin
            return `<phoneme alphabet="sapi" ph="${escapeXml(pinyin)}">${escapeXml(char)}</phoneme>`;
        case 'google':
            // Google 使用 x-pinyin
            return `<phoneme alphabet="x-pinyin" ph="${escapeXml(pinyin)}">${escapeXml(char)}</phoneme>`;
        case 'aws':
            // AWS Polly 中文支持有限
            return `<phoneme alphabet="ipa" ph="${escapeXml(pinyin)}">${escapeXml(char)}</phoneme>`;
        default:
            // 通用格式
            return `<phoneme ph="${escapeXml(pinyin)}">${escapeXml(char)}</phoneme>`;
    }
}

function wrapSSML(content: string, options: { voice?: string; rate?: string }): string {
    let ssml = '<speak>';

    if (options.voice) {
        ssml += `<voice name="${escapeXml(options.voice)}">`;
    }

    if (options.rate) {
        ssml += `<prosody rate="${escapeXml(options.rate)}">`;
    }

    ssml += content;

    if (options.rate) {
        ssml += '</prosody>';
    }

    if (options.voice) {
        ssml += '</voice>';
    }

    ssml += '</speak>';
    return ssml;
}
