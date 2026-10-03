import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

/**
 * Renders agent-written markdown (council findings, case files) as readable document text.
 * Raw HTML in the source is not rendered (react-markdown default), so agent output cannot inject markup.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="oracle-prose text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children }) => <span className="underline">{children}</span>,
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-[13px]">{children}</table>
            </div>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
