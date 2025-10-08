import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeHighlight from 'rehype-highlight'
import { memo } from 'react'
import 'highlight.js/styles/github-dark.css'

interface MarkdownMessageProps {
  content: string
  className?: string
}

export const MarkdownMessage = memo(({ content, className = '' }: MarkdownMessageProps) => {
  return (
    <ReactMarkdown
      className={`prose prose-sm max-w-none ${className}`}
      remarkPlugins={[remarkGfm, remarkBreaks]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        // コードブロックのスタイリング
        pre: ({ children, ...props }) => (
          <pre className="bg-black/5 dark:bg-white/5 rounded p-3 overflow-x-auto" {...props}>
            {children}
          </pre>
        ),
        code: ({ children, className, ...props }) => {
          const isInline = !className
          return isInline ? (
            <code className="bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded text-xs" {...props}>
              {children}
            </code>
          ) : (
            <code className={className} {...props}>
              {children}
            </code>
          )
        },
        // テーブルのスタイリング
        table: ({ children, ...props }) => (
          <div className="overflow-x-auto my-2">
            <table className="border-collapse border border-gray-300 dark:border-gray-700" {...props}>
              {children}
            </table>
          </div>
        ),
        th: ({ children, ...props }) => (
          <th className="border border-gray-300 dark:border-gray-700 px-3 py-1 bg-gray-100 dark:bg-gray-800" {...props}>
            {children}
          </th>
        ),
        td: ({ children, ...props }) => (
          <td className="border border-gray-300 dark:border-gray-700 px-3 py-1" {...props}>
            {children}
          </td>
        ),
        // リンクのスタイリング
        a: ({ children, href, ...props }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline hover:no-underline"
            {...props}
          >
            {children}
          </a>
        ),
        // リストのスタイリング
        ul: ({ children, ...props }) => (
          <ul className="list-disc list-inside space-y-1 my-2" {...props}>
            {children}
          </ul>
        ),
        ol: ({ children, ...props }) => (
          <ol className="list-decimal list-inside space-y-1 my-2" {...props}>
            {children}
          </ol>
        ),
        // 引用のスタイリング
        blockquote: ({ children, ...props }) => (
          <blockquote className="border-l-4 border-gray-300 dark:border-gray-700 pl-4 italic my-2" {...props}>
            {children}
          </blockquote>
        ),
        // 見出しのスタイリング
        h1: ({ children, ...props }) => (
          <h1 className="text-xl font-bold mt-4 mb-2" {...props}>
            {children}
          </h1>
        ),
        h2: ({ children, ...props }) => (
          <h2 className="text-lg font-bold mt-3 mb-2" {...props}>
            {children}
          </h2>
        ),
        h3: ({ children, ...props }) => (
          <h3 className="text-base font-bold mt-2 mb-1" {...props}>
            {children}
          </h3>
        ),
        // 段落のスタイリング
        p: ({ children, ...props }) => (
          <p className="my-1" {...props}>
            {children}
          </p>
        ),
        // 水平線のスタイリング
        hr: ({ ...props }) => (
          <hr className="my-4 border-gray-300 dark:border-gray-700" {...props} />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
})

MarkdownMessage.displayName = 'MarkdownMessage'