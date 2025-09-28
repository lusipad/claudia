import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, MessageSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
// import { Pagination } from "@/components/ui/pagination";
import { ClaudeMemoriesDropdown } from "@/components/ClaudeMemoriesDropdown";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatTimeAgo } from "@/lib/date-utils";
import { api, type Session, type ClaudeMdFile } from "@/lib/api";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface SessionListProps {
  /**
   * Array of sessions to display
   */
  sessions: Session[];
  /**
   * The current project path being viewed
   */
  projectPath: string;
  /**
   * Optional callback to go back to project list (deprecated - use tabs instead)
   */
  onBack?: () => void;
  /**
   * Callback when a session is clicked
   */
  onSessionClick?: (session: Session) => void;
  /**
   * Callback when a CLAUDE.md file should be edited
   */
  onEditClaudeFile?: (file: ClaudeMdFile) => void;
  /**
   * Optional className for styling
   */
  className?: string;
}

const ITEMS_PER_PAGE = 9;

/**
 * SessionList component - Displays paginated sessions for a specific project
 * 
 * @example
 * <SessionList
 *   sessions={sessions}
 *   projectPath="/Users/example/project"
 *   onBack={() => setSelectedProject(null)}
 *   onSessionClick={(session) => console.log('Selected session:', session)}
 * />
 */
export const SessionList: React.FC<SessionListProps> = ({
  sessions,
  projectPath,
  onSessionClick,
  onEditClaudeFile,
  className,
}) => {
  const [pagesLoaded, setPagesLoaded] = useState(1);
  // Lazy-loaded session details cache keyed by session.id
  const [details, setDetails] = useState<Record<string, { count: number; lastText?: string; lastAt?: string }>>({});
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = React.useRef(false);
  
  // Calculate pagination
  const totalPages = Math.ceil(sessions.length / ITEMS_PER_PAGE) || 1;
  const visibleSessions = sessions.slice(0, pagesLoaded * ITEMS_PER_PAGE);
  
  // Reset to page 1 if sessions change
  useEffect(() => {
    setPagesLoaded(1);
  }, [sessions.length]);

  // Infinite lazy loading when reaching sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const hasMore = pagesLoaded < totalPages;
    if (!hasMore) return;

    const io = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry.isIntersecting && !loadingMoreRef.current) {
        loadingMoreRef.current = true;
        requestAnimationFrame(() => {
          setPagesLoaded((p) => Math.min(p + 1, totalPages));
          setTimeout(() => (loadingMoreRef.current = false), 200);
        });
      }
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [pagesLoaded, totalPages]);

  // Load extra details for the sessions visible on the current page (message count, last snippet, last activity)
  useEffect(() => {
    let cancelled = false;

    async function loadDetails(seq: Session) {
      try {
        const existing = details[seq.id];
        if (existing) return; // already cached
        const history = await api.loadSessionHistory(seq.id, seq.project_id);
        if (cancelled) return;

        let count = Array.isArray(history) ? history.length : 0;
        // Find last text-like snippet and timestamp
        let lastText: string | undefined;
        let lastAt: string | undefined;
        if (Array.isArray(history) && history.length > 0) {
          for (let i = history.length - 1; i >= 0; i--) {
            const entry: any = history[i];
            lastAt = entry.timestamp || lastAt;
            // Try common shapes
            if (typeof entry.message === 'string') {
              if (entry.message.trim()) { lastText = entry.message; break; }
            }
            const msg = entry.message || entry;
            if (msg?.content) {
              if (typeof msg.content === 'string' && msg.content.trim()) { lastText = msg.content; break; }
              if (Array.isArray(msg.content)) {
                // find last text block
                for (let j = msg.content.length - 1; j >= 0; j--) {
                  const c = msg.content[j];
                  if (typeof c === 'string' && c.trim()) { lastText = c; break; }
                  if (c?.type === 'text') {
                    const t = typeof c.text === 'string' ? c.text : (c.text?.text ?? '');
                    if (t.trim()) { lastText = t; break; }
                  }
                }
                if (lastText) break;
              }
            }
          }
        }

        setDetails(prev => ({ ...prev, [seq.id]: { count, lastText, lastAt } }));
      } catch (_e) {
        // ignore per-card errors; do not block UI
        setDetails(prev => ({ ...prev, [seq.id]: { count: 0 } }));
      }
    }

    // Queue loads for current sessions without details
    (async () => {
      for (const s of visibleSessions) {
        if (!details[s.id]) {
          await loadDetails(s);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [visibleSessions.map(s => s.id).join(','), sessions.length]);
  
  return (
    <TooltipProvider>
      <div className={cn("space-y-4", className)}>
      {/* CLAUDE.md Memories Dropdown */}
      {onEditClaudeFile && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <ClaudeMemoriesDropdown
            projectPath={projectPath}
            onEditFile={onEditClaudeFile}
          />
        </motion.div>
      )}

      <AnimatePresence mode="popLayout">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleSessions.map((session, index) => (
            <motion.div
              key={session.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{
                duration: 0.3,
                delay: index * 0.05,
                ease: [0.4, 0, 0.2, 1],
              }}
            >
              <Card
                className={cn(
                  "p-3 hover:bg-accent/50 transition-all duration-200 cursor-pointer group h-full",
                  session.todo_data && "bg-primary/5"
                )}
                onClick={() => {
                  // Emit a special event for Claude Code session navigation
                  const event = new CustomEvent('claude-session-selected', { 
                    detail: { session, projectPath } 
                  });
                  window.dispatchEvent(event);
                  onSessionClick?.(session);
                }}
              >
                <div className="flex flex-col h-full">
                  <div className="flex-1">
                    {/* Session header */}
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-start gap-1.5 flex-1 min-w-0">
                        <Clock className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-body-small font-medium">
                            Session on {session.message_timestamp 
                              ? new Date(session.message_timestamp).toLocaleDateString('en-US', { 
                                  month: 'short', 
                                  day: 'numeric',
                                  year: 'numeric'
                                })
                              : new Date(session.created_at * 1000).toLocaleDateString('en-US', { 
                                  month: 'short', 
                                  day: 'numeric',
                                  year: 'numeric'
                                })
                            }
                          </p>
                        </div>
                      </div>
                      {session.todo_data && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-caption font-medium bg-primary/10 text-primary">
                          Todo
                        </span>
                      )}
                    </div>
                    
                    {/* Markdown preview - clamp to 4 lines */}
                    {(() => {
                      const first = session.first_message?.trim();
                      const last = details[session.id]?.lastText?.trim();
                      const preview = (() => {
                        if (first && last && first !== last) return `${first}\n\n${last}`;
                        return first || last || '';
                      })();
                      if (!preview) {
                        return (
                          <p className="text-caption text-muted-foreground/60 italic mb-1">No messages yet</p>
                        );
                      }
                      return (
                        <div className="text-caption text-muted-foreground whitespace-pre-wrap overflow-hidden break-words line-clamp-4 prose prose-sm dark:prose-invert max-w-none mb-1 max-h-24">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code(props: any) {
                                const { inline, children, ...rest } = props as any;
                                // Render inline code compactly; blocks become inline-style for consistent clamping
                                if (!inline) {
                                  return <code className="bg-muted px-1 py-0.5 rounded" {...rest}>{children}</code>;
                                }
                                return <code className="bg-muted px-1 py-0.5 rounded" {...rest}>{children}</code>;
                              },
                              h1: ({children}) => <strong>{children}</strong>,
                              h2: ({children}) => <strong>{children}</strong>,
                              h3: ({children}) => <strong>{children}</strong>,
                              ul: ({children}) => <span>{children}</span>,
                              ol: ({children}) => <span>{children}</span>,
                              li: ({children}) => <span>• {children} </span>,
                              p: ({children}) => <span>{children} </span>,
                              table: () => <span className="opacity-70">[table]</span>,
                              thead: ({children}) => <span>{children}</span>,
                              tbody: ({children}) => <span>{children}</span>,
                              tr: ({children}) => <span> | {children} </span>,
                              th: ({children}) => <strong>{children}</strong>,
                              td: ({children}) => <span>{children}</span>,
                              hr: () => <span> — </span>,
                              blockquote: ({children}) => <span>“{children}” </span>,
                              br: () => <span> </span>,
                              img: () => <span className="opacity-70">[image]</span>,
                            }}
                          >
                            {preview}
                          </ReactMarkdown>
                        </div>
                      );
                    })()}
                  </div>
                  
                  {/* Metadata footer */}
                  <div className="flex items-center justify-between pt-2 border-t text-caption text-muted-foreground">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono">{session.id.slice(-8)}</span>
                      {details[session.id]?.count !== undefined && (
                        <span className="whitespace-nowrap">{details[session.id]!.count} msgs</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const last = details[session.id]?.lastAt;
                        const baseTs = last ? Date.parse(last) : (session.message_timestamp ? Date.parse(session.message_timestamp) : session.created_at * 1000);
                        return <span title={new Date(baseTs).toLocaleString()}>{formatTimeAgo(baseTs)}</span>;
                      })()}
                      {session.todo_data && (
                        <MessageSquare className="h-3 w-3 text-primary" />
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </AnimatePresence>
      
        {/* Lazy-load sentinel */}
        <div ref={sentinelRef} className="h-8" />
      </div>
    </TooltipProvider>
  );
}; 
