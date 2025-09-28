import React, { useState, useEffect, useMemo } from "react";
import { 
  Terminal, 
  User, 
  Bot, 
  AlertCircle, 
  CheckCircle2,
  Copy
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { getClaudeSyntaxTheme } from "@/lib/claudeSyntaxTheme";
import { useTheme } from "@/hooks";
import type { ClaudeStreamMessage } from "./AgentExecution";
import { Button } from "@/components/ui/button";
import { TooltipSimple } from "@/components/ui/tooltip-modern";
import {
  TodoWidget,
  TodoReadWidget,
  LSWidget,
  ReadWidget,
  ReadResultWidget,
  GlobWidget,
  BashWidget,
  WriteWidget,
  GrepWidget,
  EditWidget,
  EditResultWidget,
  MCPWidget,
  CommandWidget,
  CommandOutputWidget,
  SummaryWidget,
  MultiEditWidget,
  MultiEditResultWidget,
  SystemReminderWidget,
  TaskWidget,
  LSResultWidget,
  ThinkingWidget,
  WebSearchWidget,
  WebFetchWidget
} from "./ToolWidgets";

interface StreamMessageProps {
  message: ClaudeStreamMessage;
  className?: string;
  streamMessages: ClaudeStreamMessage[];
  onLinkDetected?: (url: string) => void;
  fontScale?: number;
  displayIndex?: number;
  originalIndex?: number;
}

/**
 * Component to render a single Claude Code stream message
 */
const StreamMessageComponent: React.FC<StreamMessageProps> = ({
  message,
  className,
  streamMessages,
  onLinkDetected,
  fontScale = 1,
  originalIndex,
}) => {
  // State to track tool results mapped by tool call ID
  const [toolResults, setToolResults] = useState<Map<string, any>>(new Map());
  
  // Get current theme
  const { theme } = useTheme();
  const syntaxTheme = getClaudeSyntaxTheme(theme);

  const scaleStyle = useMemo(
    () => ({ '--chat-font-scale': fontScale } as React.CSSProperties),
    [fontScale]
  );

  const wrapContent = (content: React.ReactNode) => (
    <div className="chat-font-scale" style={scaleStyle}>
      {content}
    </div>
  );
  
  // Extract all tool results from stream messages
  useEffect(() => {
    const results = new Map<string, any>();
    
    // Iterate through all messages to find tool results
    streamMessages.forEach(msg => {
      if (msg.type === "user" && msg.message?.content && Array.isArray(msg.message.content)) {
        msg.message.content.forEach((content: any) => {
          if (content.type === "tool_result" && content.tool_use_id) {
            results.set(content.tool_use_id, content);
          }
        });
      }
    });
    
    setToolResults(results);
  }, [streamMessages]);
  
  // Helper to get tool result for a specific tool call ID
  const getToolResult = (toolId: string | undefined): any => {
    if (!toolId) return null;
    return toolResults.get(toolId) || null;
  };

  // Format a concise, CLI-like tool invocation line (e.g., "* bash <command>")
  const formatToolInvocation = (name?: string, input?: any): string => {
    if (!name) return "* tool";
    const n = name.toLowerCase();

    try {
      // Known tools with readable summaries
      if (n === 'bash' && input?.command) {
        return `* bash ${String(input.command).trim()}`;
      }
      if (n === 'ls' && input?.path) {
        return `* ls ${String(input.path).trim()}`;
      }
      if (n === 'read' && input?.file_path) {
        return `* read ${String(input.file_path).trim()}`;
      }
      if (n === 'glob' && input?.pattern) {
        return `* glob ${String(input.pattern).trim()}`;
      }
      if (n === 'grep' && input?.pattern) {
        const path = input?.path ? ` ${String(input.path).trim()}` : '';
        return `* grep ${String(input.pattern).trim()}${path}`;
      }
      if (n === 'write' && input?.file_path) {
        const size = typeof input?.content === 'string' ? input.content.length : 0;
        return `* write ${String(input.file_path).trim()} (${size} bytes)`;
      }
      if (n === 'edit' && input?.file_path) {
        return `* edit ${String(input.file_path).trim()}`;
      }
      if (n === 'multiedit' && input?.file_path) {
        const edits = Array.isArray(input?.edits) ? input.edits.length : 0;
        return `* multiedit ${String(input.file_path).trim()} (${edits} edits)`;
      }
      if (n === 'todowrite') {
        const count = Array.isArray(input?.todos) ? input.todos.length : 0;
        return `* todowrite ${count} items`;
      }
      if (n === 'todoread') {
        return `* todoread`;
      }
      if (n === 'task') {
        const desc = input?.description || input?.prompt || '';
        const short = String(desc).trim().slice(0, 80);
        return `* task ${short}`;
      }
      if (name.startsWith('mcp__')) {
        const short = JSON.stringify(input || {}).slice(0, 120);
        return `* ${name} ${short}`;
      }

      // Generic fallback – one-line JSON input
      const compact = JSON.stringify(input || {});
      const short = compact.length > 160 ? compact.slice(0, 160) + '…' : compact;
      return `* ${name} ${short}`;
    } catch {
      return `* ${name}`;
    }
  };
  
  try {
    // Skip rendering for meta messages that don't have meaningful content
    if (message.isMeta && !message.leafUuid && !message.summary) {
      return null;
    }

    // Handle summary messages
    if (message.leafUuid && message.summary && (message as any).type === "summary") {
      return wrapContent(<SummaryWidget summary={message.summary} leafUuid={message.leafUuid} />);
    }

    // System initialization message (debug-only; hide in normal UI)
    if (message.type === "system" && message.subtype === "init") {
      return null;
    }

    // Assistant message
    if (message.type === "assistant" && message.message) {
      const msg = message.message;
      
      let renderedSomething = false;
      
      // Counter to tag markdown headings with deterministic anchors for outline navigation
      let headingOrdinal = 0;

      const buildMarkdownForMessage = (msg: ClaudeStreamMessage): string => {
        let markdown = "";
        if (msg.type === "assistant" && msg.message) {
          for (const content of msg.message.content || []) {
            if (content.type === "text") {
              const textContent = typeof content.text === 'string' 
                ? content.text 
                : (content.text?.text || JSON.stringify(content.text || content));
              markdown += `${textContent}\n\n`;
            } else if (content.type === "tool_use") {
              markdown += `### Tool: ${content.name}\n\n`;
              markdown += "```json\n" + JSON.stringify(content.input, null, 2) + "\n```\n\n";
            }
          }
        } else if (msg.type === "user" && msg.message) {
          for (const content of msg.message.content || []) {
            if (content.type === "text") {
              const textContent = typeof content.text === 'string' ? content.text : String(content.text || '');
              markdown += `${textContent}\n\n`;
            } else if (content.type === "tool_result") {
              let contentText = '';
              if (typeof content.content === 'string') {
                contentText = content.content;
              } else if (content.content && typeof content.content === 'object') {
                if (content.content.text) {
                  contentText = content.content.text;
                } else if (Array.isArray(content.content)) {
                  contentText = content.content
                    .map((c: any) => (typeof c === 'string' ? c : c.text || JSON.stringify(c)))
                    .join('\n');
                } else {
                  contentText = JSON.stringify(content.content, null, 2);
                }
              }
              markdown += `### Tool Result\n\n\`\`\`\n${contentText}\n\`\`\`\n\n`;
            }
          }
        }
        return markdown || JSON.stringify(msg, null, 2);
      };

      const copyThisMessage = async () => {
        try {
          const md = buildMarkdownForMessage(message);
          await navigator.clipboard.writeText(md);
        } catch (e) {
          console.error('Copy message failed', e);
        }
      };

      const renderedCard = (
        <Card className={cn("border-primary/20 bg-primary/5", className)}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Bot className="h-5 w-5 text-primary mt-0.5" />
              <div className="flex-1 space-y-2 min-w-0">
                {msg.content && Array.isArray(msg.content) && msg.content.map((content: any, idx: number) => {
                  // Text content - render as markdown
                  if (content.type === "text") {
                    // Ensure we have a string to render
                    const textContent = typeof content.text === 'string' 
                      ? content.text 
                      : (content.text?.text || JSON.stringify(content.text || content));
                    
                    renderedSomething = true;
                    return (
                      <div key={idx} className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            code({ node, inline, className, children, ...props }: any) {
                              const match = /language-(\w+)/.exec(className || '');
                              return !inline && match ? (
                                <SyntaxHighlighter
                                  style={syntaxTheme}
                                  language={match[1]}
                                  PreTag="div"
                                  customStyle={{
                                    fontSize: 'calc(var(--chat-font-scale, 1) * 1rem)',
                                    lineHeight: 'calc(1.6 * var(--chat-font-scale, 1))',
                                  }}
                                  {...props}
                                >
                                  {String(children).replace(/\n$/, '')}
                                </SyntaxHighlighter>
                              ) : (
                                <code className={className} {...props}>
                                  {children}
                                </code>
                              );
                            },
                            h1: ({ children, ...p }: any) => (
                              <h1 id={originalIndex !== undefined ? `outline-o${originalIndex}-${++headingOrdinal}` : undefined} {...p}>{children}</h1>
                            ),
                            h2: ({ children, ...p }: any) => (
                              <h2 id={originalIndex !== undefined ? `outline-o${originalIndex}-${++headingOrdinal}` : undefined} {...p}>{children}</h2>
                            ),
                            h3: ({ children, ...p }: any) => (
                              <h3 id={originalIndex !== undefined ? `outline-o${originalIndex}-${++headingOrdinal}` : undefined} {...p}>{children}</h3>
                            ),
                            h4: ({ children, ...p }: any) => (
                              <h4 id={originalIndex !== undefined ? `outline-o${originalIndex}-${++headingOrdinal}` : undefined} {...p}>{children}</h4>
                            ),
                            h5: ({ children, ...p }: any) => (
                              <h5 id={originalIndex !== undefined ? `outline-o${originalIndex}-${++headingOrdinal}` : undefined} {...p}>{children}</h5>
                            ),
                            h6: ({ children, ...p }: any) => (
                              <h6 id={originalIndex !== undefined ? `outline-o${originalIndex}-${++headingOrdinal}` : undefined} {...p}>{children}</h6>
                            ),
                          }}
                        >
                          {textContent}
                        </ReactMarkdown>
                      </div>
                    );
                  }
                  
                  // Thinking content - render with ThinkingWidget
                  if (content.type === "thinking") {
                    renderedSomething = true;
                    return (
                      <div key={idx}>
                        <ThinkingWidget 
                          thinking={content.thinking || ''} 
                          signature={content.signature}
                        />
                      </div>
                    );
                  }
                  
                  // Tool use - render custom widgets based on tool name
                  if (content.type === "tool_use") {
                    const toolName = content.name?.toLowerCase();
                    const input = content.input;
                    const toolId = content.id;
                    
                    // Get the tool result if available
                    const toolResult = getToolResult(toolId);
                    
                    // Function to render the appropriate tool widget
                    const renderToolWidget = () => {
                      // Task tool - for sub-agent tasks
                      if (toolName === "task" && input) {
                        renderedSomething = true;
                        return <TaskWidget description={input.description} prompt={input.prompt} result={toolResult} />;
                      }
                      
                      // Edit tool
                      if (toolName === "edit" && input?.file_path) {
                        renderedSomething = true;
                        return <EditWidget {...input} result={toolResult} />;
                      }
                      
                      // MultiEdit tool
                      if (toolName === "multiedit" && input?.file_path && input?.edits) {
                        renderedSomething = true;
                        return <MultiEditWidget {...input} result={toolResult} />;
                      }
                      
                      // MCP tools (starting with mcp__)
                      if (content.name?.startsWith("mcp__")) {
                        renderedSomething = true;
                        return <MCPWidget toolName={content.name} input={input} result={toolResult} />;
                      }
                      
                      // TodoWrite tool
                      if (toolName === "todowrite" && input?.todos) {
                        renderedSomething = true;
                        return <TodoWidget todos={input.todos} result={toolResult} />;
                      }
                      
                      // TodoRead tool
                      if (toolName === "todoread") {
                        renderedSomething = true;
                        return <TodoReadWidget todos={input?.todos} result={toolResult} />;
                      }
                      
                      // LS tool
                      if (toolName === "ls" && input?.path) {
                        renderedSomething = true;
                        return <LSWidget path={input.path} result={toolResult} />;
                      }
                      
                      // Read tool
                      if (toolName === "read" && input?.file_path) {
                        renderedSomething = true;
                        return <ReadWidget filePath={input.file_path} result={toolResult} />;
                      }
                      
                      // Glob tool
                      if (toolName === "glob" && input?.pattern) {
                        renderedSomething = true;
                        return <GlobWidget pattern={input.pattern} result={toolResult} />;
                      }
                      
                      // Bash tool
                      if (toolName === "bash" && input?.command) {
                        renderedSomething = true;
                        return <BashWidget command={input.command} description={input.description} result={toolResult} />;
                      }
                      
                      // Write tool
                      if (toolName === "write" && input?.file_path && input?.content) {
                        renderedSomething = true;
                        return <WriteWidget filePath={input.file_path} content={input.content} result={toolResult} />;
                      }
                      
                      // Grep tool
                      if (toolName === "grep" && input?.pattern) {
                        renderedSomething = true;
                        return <GrepWidget pattern={input.pattern} include={input.include} path={input.path} exclude={input.exclude} result={toolResult} />;
                      }
                      
                      // WebSearch tool
                      if (toolName === "websearch" && input?.query) {
                        renderedSomething = true;
                        return <WebSearchWidget query={input.query} result={toolResult} />;
                      }
                      
                      // WebFetch tool
                      if (toolName === "webfetch" && input?.url) {
                        renderedSomething = true;
                        return <WebFetchWidget url={input.url} prompt={input.prompt} result={toolResult} />;
                      }
                      
                      // Default - return null
                      return null;
                    };
                    
                    // Render the tool invocation line (CLI-like)
                    const invocation = formatToolInvocation(content.name, input);
                    const invocationLine = (
                      <div key={`${idx}-invocation`} className="text-xs font-mono text-muted-foreground">
                        {invocation}
                      </div>
                    );

                    // Render the tool widget
                    const widget = renderToolWidget();
                    if (widget) {
                      renderedSomething = true;
                      return (
                        <div key={idx} className="space-y-1">
                          {invocationLine}
                          {widget}
                        </div>
                      );
                    }
                    
                    // Fallback to basic tool display
                    renderedSomething = true;
                    return (
                      <div key={idx} className="space-y-2">
                        {invocationLine}
                        <div className="flex items-center gap-2">
                          <Terminal className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">
                            Using tool: <code className="font-mono">{content.name}</code>
                          </span>
                        </div>
                        {content.input && (
                          <div className="ml-6 p-2 bg-background rounded-md border">
                            <pre className="text-xs font-mono overflow-x-auto">
                              {JSON.stringify(content.input, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  }
                  
                  return null;
                })}

                {msg.usage && (
                  <div className="text-xs text-muted-foreground mt-2">
                    Tokens: {msg.usage.input_tokens} in, {msg.usage.output_tokens} out
                  </div>
                )}
              </div>
              <div className="ml-2">
                <TooltipSimple content="Copy message (Markdown)" side="top">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copyThisMessage}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </TooltipSimple>
              </div>
            </div>
          </CardContent>
        </Card>
      );
      
      if (!renderedSomething) return null;
      return wrapContent(renderedCard);
    }

    // User message - handle both nested and direct content structures
    if (message.type === "user") {
      // Don't render meta messages, which are for system use
      if (message.isMeta) return null;

      // Handle different message structures
      const msg = message.message || message;
      
      let renderedSomething = false;
      
      const buildUserMarkdown = (msg: ClaudeStreamMessage): string => {
        let md = '';
        const m = msg.message || msg;
        if (m && Array.isArray(m.content)) {
          for (const content of m.content) {
            if (content.type === 'text') {
              const text = typeof content.text === 'string' ? content.text : String(content.text || '');
              md += `${text}\n\n`;
            } else if (content.type === 'tool_result') {
              const c = content.content;
              let text = '';
              if (typeof c === 'string') text = c;
              else if (Array.isArray(c)) text = c.map((x: any) => (typeof x === 'string' ? x : x.text || JSON.stringify(x))).join('\n');
              else if (c?.text) text = c.text;
              else text = JSON.stringify(c || {}, null, 2);
              md += `### Tool Result\n\n\`\`\`\n${text}\n\`\`\`\n\n`;
            }
          }
        }
        return md || JSON.stringify(msg, null, 2);
      };

      const copyUserMessage = async () => {
        try {
          const md = buildUserMarkdown(message);
          await navigator.clipboard.writeText(md);
        } catch (e) {
          console.error('Copy message failed', e);
        }
      };

      const renderedCard = (
        <Card className={cn("border-muted-foreground/20 bg-muted/20", className)}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <User className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="flex-1 space-y-2 min-w-0">
                {/* Handle content that is a simple string (e.g. from user commands) */}
                {(typeof msg.content === 'string' || (msg.content && !Array.isArray(msg.content))) && (
                  (() => {
                    const contentStr = typeof msg.content === 'string' ? msg.content : String(msg.content);
                    if (contentStr.trim() === '') return null;
                    renderedSomething = true;
                    
                    // Check if it's a command message
                    const commandMatch = contentStr.match(/<command-name>(.+?)<\/command-name>[\s\S]*?<command-message>(.+?)<\/command-message>[\s\S]*?<command-args>(.*?)<\/command-args>/);
                    if (commandMatch) {
                      const [, commandName, commandMessage, commandArgs] = commandMatch;
                      return (
                        <CommandWidget 
                          commandName={commandName.trim()} 
                          commandMessage={commandMessage.trim()}
                          commandArgs={commandArgs?.trim()}
                        />
                      );
                    }
                    
                    // Check if it's command output
                    const stdoutMatch = contentStr.match(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/);
                    if (stdoutMatch) {
                      const [, output] = stdoutMatch;
                      return <CommandOutputWidget output={output} onLinkDetected={onLinkDetected} />;
                    }
                    
                    // Otherwise render as plain text
                    return (
                      <div className="text-sm">
                        {contentStr}
                      </div>
                    );
                  })()
                )}

                {/* Handle content that is an array of parts */}
                {Array.isArray(msg.content) && msg.content.map((content: any, idx: number) => {
                  // Tool result
                  if (content.type === "tool_result") {
                    // Skip duplicate tool_result if a dedicated widget is present
                    let hasCorrespondingWidget = false;
                    if (content.tool_use_id && streamMessages) {
                      for (let i = streamMessages.length - 1; i >= 0; i--) {
                        const prevMsg = streamMessages[i];
                        if (prevMsg.type === 'assistant' && prevMsg.message?.content && Array.isArray(prevMsg.message.content)) {
                          const toolUse = prevMsg.message.content.find((c: any) => c.type === 'tool_use' && c.id === content.tool_use_id);
                          if (toolUse) {
                            const toolName = toolUse.name?.toLowerCase();
                            const toolsWithWidgets = ['task','edit','multiedit','todowrite','todoread','ls','read','glob','bash','write','grep','websearch','webfetch'];
                            if (toolsWithWidgets.includes(toolName) || toolUse.name?.startsWith('mcp__')) {
                              hasCorrespondingWidget = true;
                            }
                            break;
                          }
                        }
                      }
                    }

                    if (hasCorrespondingWidget) {
                      return null;
                    }
                    // Extract the actual content string
                    let contentText = '';
                    if (typeof content.content === 'string') {
                      contentText = content.content;
                    } else if (content.content && typeof content.content === 'object') {
                      // Handle object with text property
                      if (content.content.text) {
                        contentText = content.content.text;
                      } else if (Array.isArray(content.content)) {
                        // Handle array of content blocks
                        contentText = content.content
                          .map((c: any) => (typeof c === 'string' ? c : c.text || JSON.stringify(c)))
                          .join('\n');
                      } else {
                        // Fallback to JSON stringify
                        contentText = JSON.stringify(content.content, null, 2);
                      }
                    }
                    
                    // Always show system reminders regardless of widget status
                    const reminderMatch = contentText.match(/<system-reminder>(.*?)<\/system-reminder>/s);
                    if (reminderMatch) {
                      const reminderMessage = reminderMatch[1].trim();
                      const beforeReminder = contentText.substring(0, reminderMatch.index || 0).trim();
                      const afterReminder = contentText.substring((reminderMatch.index || 0) + reminderMatch[0].length).trim();
                      
                      renderedSomething = true;
                      return (
                        <div key={idx} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            <span className="text-sm font-medium">Tool Result</span>
                          </div>
                          
                          {beforeReminder && (
                            <div className="ml-6 p-2 bg-background rounded-md border">
                              <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                                {beforeReminder}
                              </pre>
                            </div>
                          )}
                          
                          <div className="ml-6">
                            <SystemReminderWidget message={reminderMessage} />
                          </div>
                          
                          {afterReminder && (
                            <div className="ml-6 p-2 bg-background rounded-md border">
                              <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                                {afterReminder}
                              </pre>
                            </div>
                          )}
                        </div>
                      );
                    }
                    
                    // Check if this is an Edit tool result
                    const isEditResult = contentText.includes("has been updated. Here's the result of running `cat -n`");
                    
                    if (isEditResult) {
                      renderedSomething = true;
                      return (
                        <div key={idx} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            <span className="text-sm font-medium">Edit Result</span>
                          </div>
                          <EditResultWidget content={contentText} />
                        </div>
                      );
                    }
                    
                    // Check if this is a MultiEdit tool result
                    const isMultiEditResult = contentText.includes("has been updated with multiple edits") || 
                                             contentText.includes("MultiEdit completed successfully") ||
                                             contentText.includes("Applied multiple edits to");
                    
                    if (isMultiEditResult) {
                      renderedSomething = true;
                      return (
                        <div key={idx} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            <span className="text-sm font-medium">MultiEdit Result</span>
                          </div>
                          <MultiEditResultWidget content={contentText} />
                        </div>
                      );
                    }
                    
                    // Check if this is an LS tool result (directory tree structure)
                    const isLSResult = (() => {
                      if (!content.tool_use_id || typeof contentText !== 'string') return false;
                      
                      // Check if this result came from an LS tool by looking for the tool call
                      let isFromLSTool = false;
                      
                      // Search in previous assistant messages for the matching tool_use
                      if (streamMessages) {
                        for (let i = streamMessages.length - 1; i >= 0; i--) {
                          const prevMsg = streamMessages[i];
                          // Only check assistant messages
                          if (prevMsg.type === 'assistant' && prevMsg.message?.content && Array.isArray(prevMsg.message.content)) {
                            const toolUse = prevMsg.message.content.find((c: any) => 
                              c.type === 'tool_use' && 
                              c.id === content.tool_use_id &&
                              c.name?.toLowerCase() === 'ls'
                            );
                            if (toolUse) {
                              isFromLSTool = true;
                              break;
                            }
                          }
                        }
                      }
                      
                      // Only proceed if this is from an LS tool
                      if (!isFromLSTool) return false;
                      
                      // Additional validation: check for tree structure pattern
                      const lines = contentText.split('\n');
                      const hasTreeStructure = lines.some(line => /^\s*-\s+/.test(line));
                      const hasNoteAtEnd = lines.some(line => line.trim().startsWith('NOTE: do any of the files'));
                      
                      return hasTreeStructure || hasNoteAtEnd;
                    })();
                    
                    if (isLSResult) {
                      renderedSomething = true;
                      return (
                        <div key={idx} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            <span className="text-sm font-medium">Directory Contents</span>
                          </div>
                          <LSResultWidget content={contentText} />
                        </div>
                      );
                    }
                    
                    // Check if this is a Read tool result (contains line numbers with arrow separator)
                    const isReadResult = content.tool_use_id && typeof contentText === 'string' && 
                      /^\s*\d+→/.test(contentText);
                    
                    if (isReadResult) {
                      // Try to find the corresponding Read tool call to get the file path
                      let filePath: string | undefined;
                      
                      // Search in previous assistant messages for the matching tool_use
                      if (streamMessages) {
                        for (let i = streamMessages.length - 1; i >= 0; i--) {
                          const prevMsg = streamMessages[i];
                          // Only check assistant messages
                          if (prevMsg.type === 'assistant' && prevMsg.message?.content && Array.isArray(prevMsg.message.content)) {
                            const toolUse = prevMsg.message.content.find((c: any) => 
                              c.type === 'tool_use' && 
                              c.id === content.tool_use_id &&
                              c.name?.toLowerCase() === 'read'
                            );
                            if (toolUse?.input?.file_path) {
                              filePath = toolUse.input.file_path;
                              break;
                            }
                          }
                        }
                      }
                      
                      renderedSomething = true;
                      return (
                        <div key={idx} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            <span className="text-sm font-medium">Read Result</span>
                          </div>
                          <ReadResultWidget content={contentText} filePath={filePath} />
                        </div>
                      );
                    }
                    
                    // Handle empty tool results
                    if (!contentText || contentText.trim() === '') {
                      renderedSomething = true;
                      return (
                        <div key={idx} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            <span className="text-sm font-medium">Tool Result</span>
                          </div>
                          <div className="ml-6 p-3 bg-muted/50 rounded-md border text-sm text-muted-foreground italic">
                            Tool did not return any output
                          </div>
                        </div>
                      );
                    }
                    
                    renderedSomething = true;
                    return (
                      <div key={idx} className="space-y-2">
                        <div className="flex items-center gap-2">
                          {content.is_error ? (
                            <AlertCircle className="h-4 w-4 text-destructive" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          )}
                          <span className="text-sm font-medium">Tool Result</span>
                        </div>
                        <div className="ml-6 p-2 bg-background rounded-md border">
                          <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                            {contentText}
                          </pre>
                        </div>
                      </div>
                    );
                  }
                  
                  // Text content
                  if (content.type === "text") {
                    // Handle both string and object formats
                    const textContent = typeof content.text === 'string' 
                      ? content.text 
                      : (content.text?.text || JSON.stringify(content.text));
                    
                    renderedSomething = true;
                    return (
                      <div key={idx} className="text-sm">
                        {textContent}
                      </div>
                    );
                  }
                  
                  return null;
                })}
              </div>
              <div className="ml-2">
                <TooltipSimple content="Copy message (Markdown)" side="top">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copyUserMessage}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </TooltipSimple>
              </div>
            </div>
          </CardContent>
        </Card>
      );
      if (!renderedSomething) return null;
      return wrapContent(renderedCard);
    }

    // Result message - render with markdown
    if (message.type === "result") {
      const isError = message.is_error || message.subtype?.includes("error");

      if (!isError) {
        // Successful completion banner is hidden by default
        return null;
      }

      return wrapContent(
        <Card className={cn(
          isError ? "border-destructive/20 bg-destructive/5" : "border-green-500/20 bg-green-500/5",
          className
        )}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              {isError ? (
                <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
              )}
              <div className="flex-1 space-y-2">
                <h4 className="font-semibold text-sm">
                  {isError ? "Execution Failed" : "Execution Complete"}
                </h4>
                
                {message.result && (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code({ node, inline, className, children, ...props }: any) {
                          const match = /language-(\w+)/.exec(className || '');
                          return !inline && match ? (
                            <SyntaxHighlighter
                              style={syntaxTheme}
                              language={match[1]}
                              PreTag="div"
                              customStyle={{
                                fontSize: 'calc(var(--chat-font-scale, 1) * 1rem)',
                                lineHeight: 'calc(1.6 * var(--chat-font-scale, 1))',
                              }}
                              {...props}
                            >
                              {String(children).replace(/\n$/, '')}
                            </SyntaxHighlighter>
                          ) : (
                            <code className={className} {...props}>
                              {children}
                            </code>
                          );
                        }
                      }}
                    >
                      {message.result}
                    </ReactMarkdown>
                  </div>
                )}
                
                {message.error && (
                  <div className="text-sm text-destructive">{message.error}</div>
                )}
                
                <div className="text-xs text-muted-foreground space-y-1 mt-2">
                  {(message.cost_usd !== undefined || message.total_cost_usd !== undefined) && (
                    <div>Cost: ${((message.cost_usd || message.total_cost_usd)!).toFixed(4)} USD</div>
                  )}
                  {message.duration_ms !== undefined && (
                    <div>Duration: {(message.duration_ms / 1000).toFixed(2)}s</div>
                  )}
                  {message.num_turns !== undefined && (
                    <div>Turns: {message.num_turns}</div>
                  )}
                  {message.usage && (
                    <div>
                      Total tokens: {message.usage.input_tokens + message.usage.output_tokens} 
                      ({message.usage.input_tokens} in, {message.usage.output_tokens} out)
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    // Skip rendering if no meaningful content
    return null;
  } catch (error) {
    // If any error occurs during rendering, show a safe error message
    console.error("Error rendering stream message:", error, message);
    return (
      <Card className={cn("border-destructive/20 bg-destructive/5", className)}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium">Error rendering message</p>
              <p className="text-xs text-muted-foreground mt-1">
                {error instanceof Error ? error.message : 'Unknown error'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
};

export const StreamMessage = React.memo(StreamMessageComponent);
