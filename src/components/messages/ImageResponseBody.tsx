import { MarkdownWithMath } from "@/components/MarkdownWithMath";
import { extractMessageBody } from "@/lib/messages/extractMessageBody";
import { cn } from "@/lib/utils";

type ImageResponseBodyProps = {
  content: string;
  className?: string;
};

/** Match markdown images, plain image URLs, or data URIs. */
const MARKDOWN_IMAGE_RE = /!\[.*?\]\((https?:\/\/[^\s)]+|data:image\/[^\s)]+)\)/g;
const PLAIN_URL_RE = /^(https?:\/\/\S+\.(?:png|jpe?g|gif|webp|svg|bmp)(?:\?\S*)?)$/im;
const DATA_URI_RE = /^(data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+)$/m;

function extractImageUrls(text: string): string[] {
  const urls: string[] = [];
  // 1. Markdown images
  for (const match of text.matchAll(MARKDOWN_IMAGE_RE)) {
    if (match[1]) urls.push(match[1]);
  }
  if (urls.length > 0) return urls;

  // 2. Plain image URLs
  const plainMatch = text.match(PLAIN_URL_RE);
  if (plainMatch?.[1]) return [plainMatch[1]];

  // 3. Data URIs
  const dataMatch = text.match(DATA_URI_RE);
  if (dataMatch?.[1]) return [dataMatch[1]];

  // 4. Any https URL that might be an image (last resort)
  const anyUrl = text.match(/^(https?:\/\/\S+)$/m);
  if (anyUrl?.[1]) return [anyUrl[1]];

  return [];
}

export function ImageResponseBody({ content, className }: ImageResponseBodyProps) {
  const body = extractMessageBody(content);
  const imageUrls = extractImageUrls(body);

  if (imageUrls.length > 0) {
    return (
      <div className={cn("space-y-3", className)}>
        {imageUrls.map((url) => (
          <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block">
            <img
              src={url}
              alt="Generated image"
              className="w-full rounded-lg border border-slate-200 shadow-sm"
              loading="lazy"
            />
          </a>
        ))}
        {/* Show any remaining text that isn't just the image URL */}
        {body.replace(MARKDOWN_IMAGE_RE, "").trim() &&
          !PLAIN_URL_RE.test(body.trim()) &&
          !DATA_URI_RE.test(body.trim()) && (
            <div className="text-xs text-slate-500 mt-2">
              <MarkdownWithMath>{body.replace(MARKDOWN_IMAGE_RE, "").trim()}</MarkdownWithMath>
            </div>
          )}
      </div>
    );
  }

  // Fallback: render as markdown (might contain inline images)
  return (
    <div className={cn(className)}>
      <MarkdownWithMath>{body}</MarkdownWithMath>
    </div>
  );
}
