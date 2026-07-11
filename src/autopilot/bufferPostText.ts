// Pure text builders for Buffer posts (Facebook / Instagram / YouTube),
// shared between the auto pilot posting loop (autoProductPosting.ts) and the
// per-platform post screens (SocialPostScreen.tsx). They take a plain
// source object so both GoogleFlowRunnerProduct and GeneratedMediaAsset data
// can feed them without coupling to either type.
export interface BufferPostTextSource {
  caption?: string | null;
  hashtags?: string | null;
  productUrl?: string | null;
  name?: string | null;
}

// Post body = caption + hashtags; the affiliate link goes into the post's
// first comment instead ("พิกัดอยู่คอมเมนต์แรก" — links in the Facebook post
// body get reach-suppressed, so this is the standard affiliate tactic).
export function buildBufferPostText(source: BufferPostTextSource): string {
  return [source.caption?.trim(), source.hashtags?.trim()]
    .filter((part): part is string => !!part)
    .join('\n\n');
}

// Fallback composition with the link in the post body, for when Buffer
// rejects the first comment (free-plan limitation, confirmed live 2026-07-11).
export function buildBufferPostTextWithLink(source: BufferPostTextSource): string {
  const productUrl = source.productUrl?.trim();
  return [source.caption?.trim(), productUrl ? `พิกัด: ${productUrl}` : null, source.hashtags?.trim()]
    .filter((part): part is string => !!part)
    .join('\n\n');
}

export function buildProductLinkFirstComment(source: BufferPostTextSource): string | undefined {
  const productUrl = source.productUrl?.trim();
  return productUrl ? `พิกัด: ${productUrl}` : undefined;
}

// YouTube caps titles at 100 characters (enforced server-side too).
export const YOUTUBE_TITLE_MAX_LENGTH = 100;

export function buildYoutubeTitle(source: BufferPostTextSource): string {
  return (source.name?.trim() || source.caption?.trim().split('\n')[0] || 'วิดีโอสินค้า').slice(
    0,
    YOUTUBE_TITLE_MAX_LENGTH
  );
}
