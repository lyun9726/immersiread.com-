// lib/tts/polyphone/polyphoneChars.ts
// 只列"常用高频多音字"，避免全量造成性能开销。
// 你可以持续扩充这个集合。

export const POLYPHONE_CHARS = new Set<string>([
    "行", "乐", "重", "长", "还", "得", "着", "为", "处", "传", "藏", "数", "便", "更", "系", "薄", "中", "应", "都", "参", "差",
    "解", "角", "了", "落", "没", "难", "强", "省", "数", "种", "调", "相", "血", "压", "与", "载", "折", "扎", "转", "朝",
]);

export function hasPolyphoneChars(text: string): boolean {
    for (const ch of text) if (POLYPHONE_CHARS.has(ch)) return true;
    return false;
}
