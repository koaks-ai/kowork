import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownContentProps {
  content: string
  variant?: 'body' | 'compact'
  className?: string
}

function createComponents(compact: boolean): Components {
  return {
    h1: ({ children }) => (
      <h1
        className={`${compact ? 'text-base' : 'text-xl'} mb-3 mt-5 font-semibold leading-7 text-neutral-900 first:mt-0`}
      >
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2
        className={`${compact ? 'text-sm' : 'text-lg'} mb-2 mt-5 font-semibold leading-7 text-neutral-900 first:mt-0`}
      >
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3
        className={`${compact ? 'text-[13px]' : 'text-base'} mb-2 mt-4 font-semibold leading-6 text-neutral-900 first:mt-0`}
      >
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4 className="mb-2 mt-4 font-semibold text-neutral-900 first:mt-0">{children}</h4>
    ),
    p: ({ children }) => (
      <p className={`${compact ? 'my-2 leading-6' : 'my-3 leading-7'} first:mt-0 last:mb-0`}>
        {children}
      </p>
    ),
    ul: ({ children, className }) => (
      <ul className={`${className ?? ''} my-3 list-disc space-y-1 pl-5 marker:text-neutral-400`}>
        {children}
      </ul>
    ),
    ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-5">{children}</ol>,
    li: ({ children }) => <li className="pl-1">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote className="my-3 border-l-2 border-neutral-300 pl-4 text-neutral-600">
        {children}
      </blockquote>
    ),
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-800"
      >
        {children}
      </a>
    ),
    hr: () => <hr className="my-5 border-neutral-200" />,
    strong: ({ children }) => (
      <strong className="font-semibold text-neutral-900">{children}</strong>
    ),
    code: ({ className, children }) => (
      <code
        className={`${className ?? ''} rounded bg-neutral-100 px-1 py-0.5 font-mono text-[0.9em] text-neutral-800`}
      >
        {children}
      </code>
    ),
    pre: ({ children }) => (
      <pre className="my-3 max-w-full overflow-x-auto rounded-md border border-neutral-200 bg-[#f7f7f6] p-3 font-mono text-xs leading-5 text-neutral-700 [&_code]:bg-transparent [&_code]:p-0">
        {children}
      </pre>
    ),
    table: ({ children }) => (
      <div className="my-4 max-w-full overflow-x-auto rounded-md border border-neutral-200">
        <table className="w-full min-w-max border-collapse text-left text-xs">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-neutral-100 text-neutral-700">{children}</thead>,
    th: ({ children }) => (
      <th className="border-b border-r border-neutral-200 px-3 py-2 font-semibold last:border-r-0">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border-b border-r border-neutral-200 px-3 py-2 align-top last:border-r-0">
        {children}
      </td>
    ),
    input: ({ checked }) => (
      <input type="checkbox" checked={checked} readOnly className="mr-2 size-3.5 accent-blue-600" />
    )
  }
}

export function MarkdownContent({
  content,
  variant = 'body',
  className = ''
}: MarkdownContentProps): React.JSX.Element {
  const compact = variant === 'compact'

  return (
    <div
      className={`${compact ? 'text-[13px]' : 'text-[15px]'} min-w-0 break-words text-neutral-800 [overflow-wrap:anywhere] ${className}`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={createComponents(compact)} skipHtml>
        {content}
      </ReactMarkdown>
    </div>
  )
}
