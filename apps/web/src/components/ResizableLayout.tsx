import React, { type ReactNode, useCallback, useRef, useState } from 'react'

interface ResizableLayoutProps {
  leftPanel: ReactNode
  centerPanel: ReactNode
  rightPanel: ReactNode
  defaultLeftWidth?: number
  defaultRightWidth?: number
  minPaneWidth?: number
}

export function ResizableLayout({
  leftPanel,
  centerPanel,
  rightPanel,
  defaultLeftWidth = 320, // 20rem
  defaultRightWidth = 384, // 24rem
  minPaneWidth = 200,
}: ResizableLayoutProps) {
  const [leftWidth, setLeftWidth] = useState(() => {
    const saved = localStorage.getItem('nousync-left-pane-width')
    return saved ? Number.parseInt(saved) : defaultLeftWidth
  })

  const [rightWidth, setRightWidth] = useState(() => {
    const saved = localStorage.getItem('nousync-right-pane-width')
    return saved ? Number.parseInt(saved) : defaultRightWidth
  })

  const [isResizing, setIsResizing] = useState<'left' | 'right' | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Save to localStorage whenever widths change
  const saveWidths = useCallback(() => {
    localStorage.setItem('nousync-left-pane-width', leftWidth.toString())
    localStorage.setItem('nousync-right-pane-width', rightWidth.toString())
  }, [leftWidth, rightWidth])

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!containerRef.current || !isResizing) return

      const containerRect = containerRef.current.getBoundingClientRect()

      if (isResizing === 'left') {
        const newWidth = e.clientX - containerRect.left
        if (
          newWidth >= minPaneWidth &&
          newWidth <= containerRect.width - rightWidth - minPaneWidth
        ) {
          setLeftWidth(newWidth)
        }
      } else if (isResizing === 'right') {
        const newWidth = containerRect.right - e.clientX
        if (
          newWidth >= minPaneWidth &&
          newWidth <= containerRect.width - leftWidth - minPaneWidth
        ) {
          setRightWidth(newWidth)
        }
      }
    },
    [isResizing, leftWidth, rightWidth, minPaneWidth],
  )

  const handleMouseUp = useCallback(() => {
    setIsResizing(null)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    saveWidths()
  }, [saveWidths])

  const startResize = useCallback((side: 'left' | 'right') => {
    setIsResizing(side)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  // Attach global event listeners when resizing
  React.useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)

      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isResizing, handleMouseMove, handleMouseUp])

  return (
    <div ref={containerRef} className="flex h-screen bg-background overflow-hidden">
      {/* Left Panel */}
      <div
        className="flex-shrink-0 border-r bg-muted/10 relative"
        style={{ width: `${leftWidth}px` }}
      >
        {leftPanel}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={leftWidth}
          aria-valuemin={200}
          aria-valuemax={600}
          tabIndex={0}
          className="absolute top-0 -right-1 w-2 h-full cursor-col-resize hover:bg-primary/20 transition-colors z-10"
          onMouseDown={() => startResize('left')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              startResize('left')
            }
          }}
        />
      </div>

      {/* Center Panel */}
      <div className="flex-1 flex flex-col min-w-0">{centerPanel}</div>

      {/* Right Panel */}
      <div
        className="flex-shrink-0 border-l bg-muted/10 relative"
        style={{ width: `${rightWidth}px` }}
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={rightWidth}
          aria-valuemin={300}
          aria-valuemax={800}
          tabIndex={0}
          className="absolute top-0 -left-1 w-2 h-full cursor-col-resize hover:bg-primary/20 transition-colors z-10"
          onMouseDown={() => startResize('right')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              startResize('right')
            }
          }}
        />
        {rightPanel}
      </div>
    </div>
  )
}
