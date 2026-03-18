import { cn } from "@/lib/utils";

type SafeHtmlPreviewProps = {
  html: string;
  title?: string;
  className?: string;
};

const PREVIEW_CSP =
  "default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'; font-src data: https:; media-src data: https: http:;";

const PREVIEW_BASE_STYLES = `
  :root, html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: 100%;
    height: 100%;
    overflow: hidden !important;
  }
  *, *::before, *::after {
    box-sizing: border-box;
    max-width: 100%;
  }
`;

function stripDisallowedMarkup(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript:/gi, "");
}

function injectPreviewHead(documentHtml: string): string {
  const headPayload = [
    `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}" />`,
    `<style>${PREVIEW_BASE_STYLES}</style>`,
  ].join("\n");

  if (/<head[\s>]/i.test(documentHtml)) {
    return documentHtml.replace(/<head([^>]*)>/i, `<head$1>\n${headPayload}`);
  }

  if (/<html[\s>]/i.test(documentHtml)) {
    return documentHtml.replace(/<html([^>]*)>/i, `<html$1>\n<head>\n${headPayload}\n</head>`);
  }

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${headPayload}
  </head>
  <body>
${documentHtml}
  </body>
</html>`;
}

function buildSrcDoc(html: string): string {
  const sanitized = stripDisallowedMarkup(html.trim());
  const looksLikeFullDocument = /<(?:!doctype|html)\b/i.test(sanitized);
  if (looksLikeFullDocument) {
    return injectPreviewHead(sanitized);
  }

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}" />
    <style>${PREVIEW_BASE_STYLES}</style>
  </head>
  <body>
${sanitized}
  </body>
</html>`;
}

export function SafeHtmlPreview({ html, title = "HTML preview", className }: SafeHtmlPreviewProps) {
  return (
    <div
      className={cn("my-2 w-full min-w-0 rounded-md border border-slate-200 bg-white", className)}
    >
      <iframe
        title={title}
        srcDoc={buildSrcDoc(html)}
        sandbox=""
        loading="lazy"
        referrerPolicy="no-referrer"
        className="h-150 w-full rounded-md border-0 overflow-hidden"
      />
    </div>
  );
}
