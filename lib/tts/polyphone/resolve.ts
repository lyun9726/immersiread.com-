// lib/tts/polyphone/resolve.ts
import { POLYPHONE_LEXICON, type Pinyin } from "./lexicon";
import type { Token, PolyphoneDecision } from "./rules";
import { applyPolyphoneRules } from "./rules";

/**
 * 用户覆盖（可接 localStorage / indexedDB / 后端）
 * key 可以是：bookId + word 或 bookId + contextHash
 */
export type UserOverride = {
    phrase: string;                 // 词/短语，如"银行"
    map: Record<string, Pinyin>;    // {"行":"háng"}
};

export type ResolveResult = {
    decisions: PolyphoneDecision[];
};

/**
 * 词典命中：如果 token.word 在 lexicon 里，给出对应字的读音
 */
function lexiconDecisions(text: string, tokens: Token[]): PolyphoneDecision[] {
    const out: PolyphoneDecision[] = [];
    for (const t of tokens) {
        const map = POLYPHONE_LEXICON[t.word];
        if (!map) continue;

        for (const [ch, pinyin] of Object.entries(map)) {
            const posInWord = t.word.indexOf(ch);
            if (posInWord >= 0) {
                out.push({ indexInText: t.start + posInWord, char: ch, pinyin });
            }
        }
    }
    return out;
}

function userOverrideDecisions(text: string, tokens: Token[], overrides: UserOverride[]): PolyphoneDecision[] {
    const out: PolyphoneDecision[] = [];
    if (!overrides?.length) return out;

    for (const t of tokens) {
        for (const ov of overrides) {
            if (t.word !== ov.phrase) continue;
            for (const [ch, pinyin] of Object.entries(ov.map)) {
                const posInWord = t.word.indexOf(ch);
                if (posInWord >= 0) out.push({ indexInText: t.start + posInWord, char: ch, pinyin });
            }
        }
    }
    return out;
}

/**
 * 仲裁：同一个 indexInText 只能有一个读音
 * 优先级：用户覆盖 > 词典 > 规则
 */
export function resolvePolyphones(
    text: string,
    tokens: Token[],
    userOverrides: UserOverride[] = []
): ResolveResult {
    const user = userOverrideDecisions(text, tokens, userOverrides);
    const lex = lexiconDecisions(text, tokens);
    const rule = applyPolyphoneRules(text, tokens);

    const chosen = new Map<number, PolyphoneDecision>();

    // 顺序很重要：后写覆盖前写
    for (const d of rule) chosen.set(d.indexInText, d);
    for (const d of lex) chosen.set(d.indexInText, d);
    for (const d of user) chosen.set(d.indexInText, d);

    return { decisions: [...chosen.values()].sort((a, b) => a.indexInText - b.indexInText) };
}
