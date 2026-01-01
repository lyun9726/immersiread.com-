// lib/tts/polyphone/index.ts
import { simpleTokenize, dictionaryAwareTokenize } from "./tokenize";
import { resolvePolyphones, type UserOverride } from "./resolve";
import { buildSpeakTextForBrowserTTS, buildSSMLForCloudTTS, escapeXml } from "./speakText";
import { hasPolyphoneChars, POLYPHONE_CHARS } from "./polyphoneChars";
import { POLYPHONE_LEXICON } from "./lexicon";

export type PolyphoneOutput = {
    /** 标准化后的文本 */
    normalizedText: string;
    /** 浏览器 TTS 用的文本（目前与原文相同，因为浏览器不支持 phoneme） */
    speakText: string;
    /** 云 TTS 用的 SSML */
    ssml: string;
    /** 定音决策列表，用于调试和 UI 显示 */
    decisions: { indexInText: number; char: string; pinyin: string }[];
    /** 是否包含多音字 */
    hasPolyphones: boolean;
};

export type BuildTTSInputOptions = {
    /** 用户自定义读音覆盖 */
    userOverrides?: UserOverride[];
    /** SSML 厂商（影响 phoneme 标签格式） */
    ssmlVendor?: 'azure' | 'google' | 'aws' | 'generic';
    /** SSML 语音名称 */
    voice?: string;
    /** SSML 语速 */
    rate?: string;
    /** 是否使用词典感知分词（更准但稍慢） */
    useDictionaryTokenize?: boolean;
};

/**
 * 构建 TTS 输入
 * 
 * @param text 原始文本
 * @param options 配置选项
 * @returns 包含多种格式输出的对象
 * 
 * @example
 * ```ts
 * const { speakText, ssml, decisions } = buildTTSInput("我去银行办理业务");
 * 
 * // 浏览器 TTS
 * utterance.text = speakText;
 * 
 * // 云 TTS
 * await callAzureTTS(ssml);
 * 
 * // 调试
 * console.log("定音:", decisions);
 * ```
 */
export function buildTTSInput(
    text: string,
    options: BuildTTSInputOptions = {}
): PolyphoneOutput {
    const normalizedText = normalize(text);

    // 性能优化：没多音字直接返回
    if (!hasPolyphoneChars(normalizedText)) {
        return {
            normalizedText,
            speakText: normalizedText,
            ssml: `<speak>${escapeXml(normalizedText)}</speak>`,
            decisions: [],
            hasPolyphones: false,
        };
    }

    // 分词
    const tokens = options.useDictionaryTokenize
        ? dictionaryAwareTokenize(normalizedText, new Set(Object.keys(POLYPHONE_LEXICON)))
        : simpleTokenize(normalizedText);

    // 解析多音字
    const { decisions } = resolvePolyphones(
        normalizedText,
        tokens,
        options.userOverrides ?? []
    );

    return {
        normalizedText,
        speakText: buildSpeakTextForBrowserTTS(normalizedText, decisions),
        ssml: buildSSMLForCloudTTS(normalizedText, decisions, {
            vendor: options.ssmlVendor,
            voice: options.voice,
            rate: options.rate,
        }),
        decisions,
        hasPolyphones: true,
    };
}

/**
 * 检测文本是否包含多音字
 */
export { hasPolyphoneChars };

/**
 * 多音字集合（用于 UI 高亮等）
 */
export { POLYPHONE_CHARS };

/**
 * 重新导出类型
 */
export type { UserOverride } from "./resolve";
export type { PolyphoneDecision, Token } from "./rules";

/**
 * 文本标准化
 */
function normalize(s: string): string {
    return s
        .replace(/\s+/g, " ")
        .replace(/，/g, "，") // 保留中文标点
        .replace(/。/g, "。")
        .replace(/！/g, "！")
        .replace(/？/g, "？")
        .trim();
}
