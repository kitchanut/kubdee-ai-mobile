export const SHOPEE_POST_WORD_LIMIT = 150;
export const SHOPEE_POST_SAFE_WORD_LIMIT = 140;
export const SHOPEE_POST_CHARACTER_LIMIT = 150;
export const SHOPEE_POST_SAFE_CHARACTER_LIMIT = 140;
export const SHOPEE_AI_TOTAL_WORD_LIMIT = 130;
export const SHOPEE_AI_CAPTION_WORD_LIMIT = 90;
export const SHOPEE_AI_HASHTAG_WORD_LIMIT = 35;
export const SHOPEE_AI_CTA_WORD_LIMIT = 4;
export const SHOPEE_AI_MAX_HASHTAG_COUNT = 15;

type WordToken = {
  end: number;
  start: number;
};

type SegmenterSegment = {
  index: number;
  isWordLike?: boolean;
  segment: string;
};

type SegmenterInstance = {
  segment: (text: string) => Iterable<SegmenterSegment>;
};

type SegmenterConstructor = new (
  locale: string,
  options: { granularity: 'word' }
) => SegmenterInstance;

export type ShopeePostTextParts = {
  caption?: string | null;
  cta?: string | null;
  fallbackCaption?: string | null;
  hashtags?: string | null;
};

export type LimitShopeePostTextOptions = {
  captionWordLimit?: number;
  ctaWordLimit?: number;
  hashtagCountLimit?: number;
  hashtagWordLimit?: number;
  totalWordLimit?: number;
};

export type LimitedShopeePostTextParts = {
  caption: string;
  cta: string;
  hashtags: string;
  totalWordLimit: number;
  wasLimited: boolean;
  wordCount: number;
};

function cleanText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function hasWordCharacter(value: string): boolean {
  return /[\p{L}\p{M}\p{N}_]/u.test(value);
}

function getSegmenter(): SegmenterInstance | null {
  const Segmenter = (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter;
  if (!Segmenter) return null;

  try {
    return new Segmenter('th', { granularity: 'word' });
  } catch {
    return null;
  }
}

function getWordTokens(text: string): WordToken[] {
  const cleanValue = cleanText(text);
  if (!cleanValue) return [];

  const segmenter = getSegmenter();
  if (segmenter) {
    return Array.from(segmenter.segment(cleanValue))
      .filter((part) => (part.isWordLike ?? hasWordCharacter(part.segment)) && hasWordCharacter(part.segment))
      .map((part) => ({
        start: part.index,
        end: part.index + part.segment.length,
      }));
  }

  const tokens: WordToken[] = [];
  const matcher = /#[\p{L}\p{M}\p{N}_]+|[\p{L}\p{M}\p{N}_]+/gu;
  for (const match of cleanValue.matchAll(matcher)) {
    const start = match.index ?? 0;
    tokens.push({
      start,
      end: start + match[0].length,
    });
  }
  return tokens;
}

export function countShopeePostWords(text: string | null | undefined): number {
  return getWordTokens(cleanText(text)).length;
}

export function countShopeePostCharacters(text: string | null | undefined): number {
  return Array.from(cleanText(text)).length;
}

function trimTextToWordLimit(value: string | null | undefined, maxWords: number): string {
  const cleanValue = cleanText(value);
  const safeMaxWords = Math.max(0, Math.floor(maxWords));
  if (!cleanValue || safeMaxWords <= 0) return '';

  const tokens = getWordTokens(cleanValue);
  if (tokens.length <= safeMaxWords) return cleanValue;

  const cutoff = tokens[safeMaxWords - 1]?.end ?? cleanValue.length;
  return cleanValue.slice(0, cutoff).replace(/[\s,，、.!?;:]+$/u, '').trim();
}

function cleanHashtagToken(value: string): string {
  const token = value.trim().replace(/^#+/u, '').replace(/[^\p{L}\p{M}\p{N}_]+/gu, '');
  return token ? `#${token}` : '';
}

export function getShopeeSafeHashtagCount(count: number | null | undefined): number {
  const safeCount = Number.isFinite(count) ? Math.floor(Number(count)) : 0;
  return Math.max(1, Math.min(safeCount || 8, SHOPEE_AI_MAX_HASHTAG_COUNT));
}

export function normalizeShopeeHashtags(
  value: string | null | undefined,
  maxTags = SHOPEE_AI_MAX_HASHTAG_COUNT
): string {
  const seen = new Set<string>();
  const tags = cleanText(value)
    .split(/[\s,，、]+/u)
    .map(cleanHashtagToken)
    .filter((tag) => {
      if (!tag || seen.has(tag.toLowerCase())) return false;
      seen.add(tag.toLowerCase());
      return true;
    });

  return tags.slice(0, Math.max(0, maxTags)).join(' ');
}

function countParts(parts: Pick<LimitedShopeePostTextParts, 'caption' | 'cta' | 'hashtags'>): number {
  return countShopeePostWords([parts.caption, parts.cta, parts.hashtags].filter(Boolean).join(' '));
}

export function limitShopeePostTextParts(
  parts: ShopeePostTextParts,
  options: LimitShopeePostTextOptions = {}
): LimitedShopeePostTextParts {
  const totalWordLimit = Math.max(1, Math.floor(options.totalWordLimit ?? SHOPEE_POST_SAFE_WORD_LIMIT));
  const hashtagCountLimit = Math.max(0, Math.floor(options.hashtagCountLimit ?? SHOPEE_AI_MAX_HASHTAG_COUNT));
  const captionWordLimit = Math.max(0, Math.floor(options.captionWordLimit ?? totalWordLimit));
  const ctaWordLimit = Math.max(0, Math.floor(options.ctaWordLimit ?? SHOPEE_AI_CTA_WORD_LIMIT));
  const hashtagWordLimit = Math.max(0, Math.floor(options.hashtagWordLimit ?? totalWordLimit));

  const originalCaption = cleanText(parts.caption) || cleanText(parts.fallbackCaption);
  const originalCta = cleanText(parts.cta);
  const originalHashtags = normalizeShopeeHashtags(parts.hashtags, Number.MAX_SAFE_INTEGER);
  const limitedHashtags = normalizeShopeeHashtags(parts.hashtags, hashtagCountLimit);
  const originalWordCount = countParts({
    caption: originalCaption,
    cta: originalCta,
    hashtags: originalHashtags,
  });

  let caption = trimTextToWordLimit(originalCaption, captionWordLimit);
  let cta = trimTextToWordLimit(originalCta, ctaWordLimit);
  let hashtags = trimTextToWordLimit(limitedHashtags, hashtagWordLimit);

  if (countParts({ caption, cta, hashtags }) > totalWordLimit) {
    const remainingForHashtags = Math.max(0, totalWordLimit - countParts({ caption, cta, hashtags: '' }));
    hashtags = trimTextToWordLimit(hashtags, remainingForHashtags);
  }

  if (countParts({ caption, cta, hashtags }) > totalWordLimit) {
    const remainingForCaption = Math.max(0, totalWordLimit - countParts({ caption: '', cta, hashtags: '' }));
    caption = trimTextToWordLimit(caption, remainingForCaption);
    hashtags = '';
  }

  if (countParts({ caption, cta, hashtags }) > totalWordLimit) {
    const remainingForCta = Math.max(0, totalWordLimit - countShopeePostWords(caption));
    cta = trimTextToWordLimit(cta, remainingForCta);
    hashtags = '';
  }

  const wordCount = countParts({ caption, cta, hashtags });
  const wasLimited =
    originalWordCount > wordCount ||
    originalCaption !== caption ||
    originalCta !== cta ||
    originalHashtags !== hashtags;

  return {
    caption,
    cta,
    hashtags,
    totalWordLimit,
    wasLimited,
    wordCount,
  };
}
