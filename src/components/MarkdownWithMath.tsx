import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

type Props = React.ComponentProps<typeof ReactMarkdown>;

/**
 * Converts LaTeX-style delimiters \(...\) and \[...\] to $...$ and $$...$$
 * so remark-math can parse them. remark-math only supports $ and $$ by default.
 */
function normalizeMathDelimiters(content: string): string {
  return content
    .replace(/\\\[([\s\S]*?)\\\]/g, "$$$$$1$$$$")
    .replace(/\\\(([\s\S]*?)\\\)/g, "$$$1$$");
}

export function MarkdownWithMath(props: Props) {
  const { children, ...rest } = props;
  const content = typeof children === "string" ? normalizeMathDelimiters(children) : children;

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} {...rest}>
      {content}
    </ReactMarkdown>
  );
}
