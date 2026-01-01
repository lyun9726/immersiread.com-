// lib/tts/polyphone/tokenize.ts
import type { Token } from "./rules";

/**
 * 简易分词：按中文连续块 + 英文数字块 + 标点分割。
 * MVP 够用；想更准就换成 pkuseg/hanlp。
 */
export function simpleTokenize(text: string): Token[] {
    const tokens: Token[] = [];
    const re = /[\u4e00-\u9fff]+|[a-zA-Z0-9]+|[^\s]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        tokens.push({ word: m[0], start: m.index, end: m.index + m[0].length });
    }
    return tokens;
}

/**
 * 改进版分词：尝试匹配词典中的词
 * 使用最长匹配策略
 */
export function dictionaryAwareTokenize(text: string, dictionary: Set<string>): Token[] {
    const tokens: Token[] = [];
    let i = 0;

    while (i < text.length) {
        // 跳过空白
        if (/\s/.test(text[i])) {
            i++;
            continue;
        }

        // 尝试最长匹配
        let matched = false;
        for (let len = Math.min(6, text.length - i); len >= 2; len--) {
            const candidate = text.substring(i, i + len);
            if (dictionary.has(candidate)) {
                tokens.push({ word: candidate, start: i, end: i + len });
                i += len;
                matched = true;
                break;
            }
        }

        if (!matched) {
            // 单字或非中文
            const char = text[i];
            if (/[\u4e00-\u9fff]/.test(char)) {
                // 单个汉字
                tokens.push({ word: char, start: i, end: i + 1 });
            } else if (/[a-zA-Z0-9]/.test(char)) {
                // 英文/数字连续块
                const match = text.substring(i).match(/^[a-zA-Z0-9]+/);
                if (match) {
                    tokens.push({ word: match[0], start: i, end: i + match[0].length });
                    i += match[0].length;
                    continue;
                }
            }
            i++;
        }
    }

    return tokens;
}
