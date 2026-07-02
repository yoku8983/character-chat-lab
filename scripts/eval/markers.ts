import { Persona } from "../../lib/types";

// 装飾表記（波ダッシュ・ふりがな括弧）を除いた実マッチ候補を返す
function normalizeMarker(raw: string): string[] {
  const s = raw.replace(/[〜～~]/g, "").trim();
  if (!s) return [];
  // "私（わたし）" のような括弧付きふりがな → 括弧前と括弧内の両方を候補に
  const paren = s.match(/^(.*?)[（(]([^）)]*)[）)]\s*$/);
  if (paren) {
    return [paren[1].trim(), paren[2].trim()].filter((c) => c.length > 0);
  }
  return [s];
}

export interface Markers {
  firstPerson: string[];
  sentenceEndings: string[];
  catchphrases: string[];
}

export function deriveMarkers(persona: Persona): Markers {
  const style = persona.identity.speaking_style;
  return {
    firstPerson: normalizeMarker(style.first_person),
    sentenceEndings: (style.sentence_endings ?? []).flatMap(normalizeMarker),
    catchphrases: (style.catchphrases ?? []).flatMap(normalizeMarker),
  };
}

export interface TurnHit {
  hasFirstPerson: boolean;
  hasSentenceEnding: boolean;
  hasCatchphrase: boolean;
}

export function scoreText(text: string, m: Markers): TurnHit {
  const hasFirstPerson = m.firstPerson.some((c) => text.includes(c));
  const hasSentenceEnding = m.sentenceEndings.some((e) => text.includes(e));
  const hasCatchphrase = m.catchphrases.some((c) => text.includes(c));
  return { hasFirstPerson, hasSentenceEnding, hasCatchphrase };
}

export interface RateSet {
  firstPerson: number;
  sentenceEnding: number;
  catchphrase: number;
}

export interface DriftStats {
  early: RateSet;
  late: RateSet;
  delta: RateSet;
}

function rate(hits: TurnHit[], key: keyof TurnHit): number {
  if (hits.length === 0) return 0;
  const count = hits.filter((h) => h[key]).length;
  return count / hits.length;
}

function rateSet(hits: TurnHit[]): RateSet {
  return {
    firstPerson: rate(hits, "hasFirstPerson"),
    sentenceEnding: rate(hits, "hasSentenceEnding"),
    catchphrase: rate(hits, "hasCatchphrase"),
  };
}

/**
 * ターン数の 1/3 を早期/後期の区切りとする。ターン数が少ない場合でも
 * early/late とも最低1件は確保する。
 */
function splitEarlyLate<T>(items: T[]): { early: T[]; late: T[] } {
  const n = items.length;
  if (n === 0) return { early: [], late: [] };

  const chunk = Math.max(1, Math.floor(n / 3));
  const early = items.slice(0, chunk);
  const late = items.slice(Math.max(n - chunk, chunk));
  return { early, late: late.length > 0 ? late : items.slice(n - 1) };
}

export function computeDrift(hits: TurnHit[]): DriftStats {
  const { early, late } = splitEarlyLate(hits);
  const earlyRates = rateSet(early);
  const lateRates = rateSet(late);
  const delta: RateSet = {
    firstPerson: lateRates.firstPerson - earlyRates.firstPerson,
    sentenceEnding: lateRates.sentenceEnding - earlyRates.sentenceEnding,
    catchphrase: lateRates.catchphrase - earlyRates.catchphrase,
  };
  return { early: earlyRates, late: lateRates, delta };
}
