import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'

interface MarkdownContentProps {
  content: string
  variant?: 'body' | 'compact'
  tone?: 'default' | 'muted'
  className?: string
}

function createComponents(compact: boolean, muted: boolean): Components {
  const headingColor = muted ? 'text-kw-text-muted' : 'text-kw-text-primary'
  const strongColor = muted ? 'text-kw-text-muted' : 'text-kw-text-primary'
  const quoteColor = muted ? 'text-kw-text-faint' : 'text-kw-text-secondary'
  const codeColor = muted ? 'text-kw-text-muted' : 'text-kw-text-secondary'
  const preColor = muted ? 'text-kw-text-muted' : 'text-kw-text-secondary'
  const preBackground = muted ? 'bg-kw-surface-subtle' : 'bg-kw-surface-subtle'
  const theadColor = muted ? 'text-kw-text-muted' : 'text-kw-text-secondary'
  const linkClass = muted
    ? 'font-medium text-kw-text-muted underline decoration-kw-border-strong underline-offset-2 hover:text-kw-text-secondary'
    : 'font-medium text-kw-accent-foreground underline decoration-kw-accent-subtle underline-offset-2 hover:text-kw-accent'

  return {
    h1: ({ children }) => (
      <h1
        className={`${compact ? 'text-base' : 'text-xl'} mb-3 mt-5 font-semibold leading-7 ${headingColor} first:mt-0`}
      >
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2
        className={`${compact ? 'text-sm' : 'text-lg'} mb-2 mt-5 font-semibold leading-7 ${headingColor} first:mt-0`}
      >
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3
        className={`${compact ? 'text-[13px]' : 'text-base'} mb-2 mt-4 font-semibold leading-6 ${headingColor} first:mt-0`}
      >
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4 className={`mb-2 mt-4 font-semibold ${headingColor} first:mt-0`}>{children}</h4>
    ),
    p: ({ children }) => (
      <p className={`${compact ? 'my-2 leading-6' : 'my-3 leading-7'} first:mt-0 last:mb-0`}>
        {children}
      </p>
    ),
    ul: ({ children, className }) => (
      <ul className={`${className ?? ''} my-3 list-disc space-y-1 pl-5 marker:text-kw-text-faint`}>
        {children}
      </ul>
    ),
    ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-5">{children}</ol>,
    li: ({ children }) => <li className="pl-1">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote className={`my-3 border-l-2 border-kw-border-strong pl-4 ${quoteColor}`}>
        {children}
      </blockquote>
    ),
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noreferrer" className={linkClass}>
        {children}
      </a>
    ),
    hr: () => <hr className="my-5 border-kw-border-default" />,
    strong: ({ children }) => (
      <strong className={`font-semibold ${strongColor}`}>{children}</strong>
    ),
    code: ({ className, children }) => (
      <code
        className={`${className ?? ''} rounded-sm bg-kw-surface-subtle px-1 py-0.5 font-mono font-normal text-[0.9em] ${codeColor}`}
      >
        {children}
      </code>
    ),
    pre: ({ children }) => (
      <pre
        className={`my-3 max-w-full overflow-x-auto rounded-md border border-kw-border-default ${preBackground} p-3 font-mono font-normal text-[0.9em] leading-5 ${preColor} [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-[1em]`}
      >
        {children}
      </pre>
    ),
    table: ({ children }) => (
      <div className="my-4 max-w-full overflow-x-auto rounded-md border border-kw-border-default">
        <table className="w-full min-w-max border-collapse text-left">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className={`bg-kw-surface-subtle ${theadColor}`}>{children}</thead>,
    th: ({ children }) => (
      <th className="border-b border-r border-kw-border-default px-3 py-2 font-semibold last:border-r-0">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border-b border-r border-kw-border-default px-3 py-2 align-top last:border-r-0">
        {children}
      </td>
    ),
    input: ({ checked }) => (
      <input type="checkbox" checked={checked} readOnly className="mr-2 size-3.5 accent-kw-accent" />
    )
  }
}

export function MarkdownContent({
  content,
  variant = 'body',
  tone = 'default',
  className = ''
}: MarkdownContentProps): React.JSX.Element {
  const compact = variant === 'compact'
  const muted = tone === 'muted'

  return (
    <div
      className={`kw-markdown kowork-markdown ${compact ? 'text-[13px]' : 'text-[15px]'} min-w-0 break-words font-[450] ${muted ? 'text-kw-text-muted' : 'text-kw-text-secondary'} [overflow-wrap:anywhere] ${className}`}
      data-tone={muted ? 'muted' : undefined}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={createComponents(compact, muted)}
        skipHtml
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
