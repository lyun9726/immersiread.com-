// lib/tts/polyphone/rules.ts
// 规则层：覆盖"词典没覆盖但很高频"的情况。
// 规则尽量写成：匹配 token 前后文 -> 选择读音

import type { Pinyin } from "./lexicon";

export type Token = {
    word: string;
    start: number;
    end: number;
};

export type PolyphoneDecision = {
    indexInText: number;   // 字在全文中的位置
    char: string;
    pinyin: Pinyin;
};

function isChineseChar(ch: string): boolean {
    return /[\u4e00-\u9fff]/.test(ch);
}

export function applyPolyphoneRules(text: string, tokens: Token[]): PolyphoneDecision[] {
    const decisions: PolyphoneDecision[] = [];

    // Rule 1: "得" - 常见：动词 + 得 -> de；"得到" -> dé
    const deWords = new Set(["得到", "得知", "得分", "得奖", "得意", "得力", "得手", "得罪", "心得", "所得", "获得", "取得"]);
    for (const t of tokens) {
        if (t.word.includes("得")) {
            const idx = t.start + t.word.indexOf("得");
            if (deWords.has(t.word)) {
                decisions.push({ indexInText: idx, char: "得", pinyin: "dé" });
            } else {
                decisions.push({ indexInText: idx, char: "得", pinyin: "de" });
            }
        }
    }

    // Rule 2: "着"
    // V+着(zhe) vs 着火/着急(zháo) vs 着手/着陆(zhuó)
    const zhaoWords = new Set(["着火", "着急", "着凉", "着迷"]);
    const zhuoWords = new Set(["着手", "着落", "着装", "着陆", "着重", "执着", "沉着"]);
    for (const t of tokens) {
        if (!t.word.includes("着")) continue;
        const idx = t.start + t.word.indexOf("着");

        if (zhaoWords.has(t.word)) {
            decisions.push({ indexInText: idx, char: "着", pinyin: "zháo" });
        } else if (zhuoWords.has(t.word)) {
            decisions.push({ indexInText: idx, char: "着", pinyin: "zhuó" });
        } else {
            // 很多情况下读 zhe
            decisions.push({ indexInText: idx, char: "着", pinyin: "zhe" });
        }
    }

    // Rule 3: "还"
    // 归还/偿还/返还/还款/还钱 -> huán；否则多数 hái
    const huanHints = ["归还", "偿还", "返还", "还款", "还钱", "还清", "还给", "还债", "还原", "还礼"];
    for (const t of tokens) {
        if (!t.word.includes("还")) continue;
        const idx = t.start + t.word.indexOf("还");
        const huan = huanHints.some(h => t.word.includes(h));
        decisions.push({ indexInText: idx, char: "还", pinyin: huan ? "huán" : "hái" });
    }

    // Rule 4: "中"
    // 命中/中奖/中招/中毒/中枪 -> zhòng；其余 zhōng
    const zhong4 = ["命中", "中奖", "中招", "中毒", "中枪", "中弹", "中标", "中计", "中选", "看中", "选中"];
    for (const t of tokens) {
        if (!t.word.includes("中")) continue;
        const idx = t.start + t.word.indexOf("中");
        const z = zhong4.some(h => t.word.includes(h));
        decisions.push({ indexInText: idx, char: "中", pinyin: z ? "zhòng" : "zhōng" });
    }

    // Rule 5: "了" - 大多数情况读 le，只有特定词读 liǎo
    const liaoWords = new Set(["了解", "了不起", "了结", "了断", "了却", "了然", "明了", "一目了然"]);
    for (const t of tokens) {
        if (!t.word.includes("了")) continue;
        const idx = t.start + t.word.indexOf("了");
        const liao = liaoWords.has(t.word) || liaoWords.has(t.word.replace(/\s/g, ''));
        decisions.push({ indexInText: idx, char: "了", pinyin: liao ? "liǎo" : "le" });
    }

    // Rule 6: "的/地/得" 结构助词
    // 的 在名词前读 de，"目的" 读 dì
    const diWords = new Set(["目的", "的确", "的当"]);
    for (const t of tokens) {
        if (!t.word.includes("的")) continue;
        const idx = t.start + t.word.indexOf("的");
        const di = diWords.has(t.word);
        decisions.push({ indexInText: idx, char: "的", pinyin: di ? "dì" : "de" });
    }

    // Rule 7: "长" - 长度/长期 cháng vs 成长/长大 zhǎng
    const zhangWords = new Set(["成长", "长大", "长高", "生长", "增长", "长辈", "长官", "班长", "队长", "校长", "市长", "部长", "局长", "厂长", "首长", "家长", "师长", "科长", "组长", "股长", "处长", "厅长", "社长"]);
    for (const t of tokens) {
        if (!t.word.includes("长")) continue;
        const idx = t.start + t.word.indexOf("长");
        const zhang = zhangWords.has(t.word) || t.word.endsWith("长");
        decisions.push({ indexInText: idx, char: "长", pinyin: zhang ? "zhǎng" : "cháng" });
    }

    // 去重：同一个位置不要重复写
    const seen = new Set<number>();
    return decisions.filter(d => {
        if (!isChineseChar(d.char)) return false;
        if (seen.has(d.indexInText)) return false;
        seen.add(d.indexInText);
        return true;
    });
}
