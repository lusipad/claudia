import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import {
  Copy,
  ChevronDown,
  GitBranch,
  ChevronUp,
  X,
  Hash,
  Wrench,
  ListTree,
  Eye,
  EyeOff
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover } from "@/components/ui/popover";
import { api, type Session } from "@/lib/api";
import { cn } from "@/lib/utils";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { StreamMessage } from "./StreamMessage";
import { FloatingPromptInput, type FloatingPromptInputRef } from "./FloatingPromptInput";
import { ErrorBoundary } from "./ErrorBoundary";
import { TimelineNavigator } from "./TimelineNavigator";
import { CheckpointSettings } from "./CheckpointSettings";
import { SlashCommandsManager } from "./SlashCommandsManager";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { TooltipProvider, TooltipSimple } from "@/components/ui/tooltip-modern";
import { SplitPane } from "@/components/ui/split-pane";
import { WebviewPreview } from "./WebviewPreview";
import type { ClaudeStreamMessage } from "./AgentExecution";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTrackEvent, useComponentMetrics, useWorkflowTracking } from "@/hooks";
import { SessionPersistenceService } from "@/services/sessionPersistence";

const TIMELINE_PANEL_WIDTH = 384;
const OUTLINE_PANEL_WIDTH = 320;
const CHAT_ZOOM_STORAGE_KEY = "chat_zoom_factor";
const CHAT_ZOOM_MIN = 0.75;
const CHAT_ZOOM_MAX = 1.5;
const CHAT_ZOOM_STEP = 0.05;
const DEFAULT_CHAT_ZOOM = 1;

const clampZoom = (value: number) =>
  Math.min(CHAT_ZOOM_MAX, Math.max(CHAT_ZOOM_MIN, Number.isFinite(value) ? value : DEFAULT_CHAT_ZOOM));

type OutlineItem = {
  id: string;
  label: string;
  level: number;
  displayIndex: number;
  originalIndex: number;
};

type DisplayableEntry = {
  message: ClaudeStreamMessage;
  originalIndex: number;
};

const TOOLS_WITH_WIDGETS = [
  "task",
  "edit",
  "multiedit",
  "todowrite",
  "ls",
  "read",
  "glob",
  "bash",
  "write",
  "grep",
];

const isToolInvocationOnly = (message: ClaudeStreamMessage): boolean => {
  if (message.type !== "assistant" || !message.message?.content) {
    return false;
  }

  const contents = Array.isArray(message.message.content)
    ? message.message.content
    : [message.message.content];

  if (contents.length === 0) {
    return false;
  }

  return contents.every((content: any) => {
    if (content.type === "tool_use" || content.type === "thinking") {
      return true;
    }

    if (content.type === "text") {
      const textValue = typeof content.text === "string"
        ? content.text
        : content.text?.text ?? "";
      return textValue.trim().length === 0;
    }

    return false;
  });
};

const shouldDisplayMessage = (
  messages: ClaudeStreamMessage[],
  message: ClaudeStreamMessage,
  index: number,
  hideToolMessages: boolean,
): boolean => {
  if (message.isMeta && !message.leafUuid && !message.summary) {
    return false;
  }

  if (message.type === "user" && message.message) {
    if (message.isMeta) {
      return false;
    }

    const msg = message.message;

    if (!msg.content || (Array.isArray(msg.content) && msg.content.length === 0)) {
      return false;
    }

    if (Array.isArray(msg.content)) {
      let hasVisibleContent = false;

      for (const content of msg.content) {
        if (content.type === "text") {
          hasVisibleContent = true;
          break;
        }

        if (content.type === "tool_result") {
          let willBeSkipped = false;

          if (content.tool_use_id) {
            for (let i = index - 1; i >= 0; i--) {
              const prevMsg = messages[i];

              if (
                prevMsg.type === "assistant" &&
                prevMsg.message?.content &&
                Array.isArray(prevMsg.message.content)
              ) {
                const toolUse = prevMsg.message.content.find(
                  (c: any) => c.type === "tool_use" && c.id === content.tool_use_id,
                );

                if (toolUse) {
                  const toolName = toolUse.name?.toLowerCase();

                  if (
                    (toolName && TOOLS_WITH_WIDGETS.includes(toolName)) ||
                    toolUse.name?.startsWith("mcp__")
                  ) {
                    willBeSkipped = true;
                  }

                  break;
                }
              }
            }
          }

          if (!willBeSkipped) {
            hasVisibleContent = true;
            break;
          }
        }
      }

      if (!hasVisibleContent) {
        return false;
      }
    }
  }

  if (hideToolMessages && isToolInvocationOnly(message)) {
    return false;
  }

  return true;
};

const buildDisplayableEntries = (
  messages: ClaudeStreamMessage[],
  hideToolMessages: boolean,
): DisplayableEntry[] => {
  const entries: DisplayableEntry[] = [];

  messages.forEach((message, index) => {
    if (shouldDisplayMessage(messages, message, index, hideToolMessages)) {
      entries.push({ message, originalIndex: index });
    }
  });

  return entries;
};

const extractOutlineItemsFromEntry = (
  entry: DisplayableEntry,
  displayIndex: number,
): OutlineItem[] => {
  const { message, originalIndex } = entry;

  if (message.type !== "assistant" || !message.message?.content) {
    return [];
  }

  const contents = Array.isArray(message.message.content)
    ? message.message.content
    : [message.message.content];

  const textBlocks = contents
    .filter((content: any) => content.type === "text")
    .map((content: any) => {
      if (typeof content.text === "string") {
        return content.text;
      }

      if (content.text?.text) {
        return content.text.text;
      }

      return "";
    })
    .filter(Boolean);

  if (textBlocks.length === 0) {
    return [];
  }

  const items: OutlineItem[] = [];
  const combined = textBlocks.join("\n");
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  let headingCount = 0;

  while ((match = headingRegex.exec(combined)) !== null) {
    headingCount += 1;
    const level = Math.min(match[1].length, 6);
    const rawLabel = match[2].trim();
    const label = rawLabel
      .replace(/[#*`_>\-]/g, "")
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
      .trim();

    items.push({
      id: `outline-${displayIndex}-${headingCount}`,
      label: label || `Heading ${headingCount}`,
      level,
      displayIndex,
      originalIndex,
    });
  }

  if (headingCount === 0) {
    const fallback = combined.trim().split("\n")[0] || "";
    const label = fallback.substring(0, 80) || `Assistant message ${displayIndex + 1}`;

    items.push({
      id: `outline-${displayIndex}-fallback`,
      label,
      level: 1,
      displayIndex,
      originalIndex,
    });
  }

  return items;
};

const buildOutlineItems = (entries: DisplayableEntry[]): OutlineItem[] => {
  const items: OutlineItem[] = [];

  entries.forEach((entry, displayIndex) => {
    items.push(...extractOutlineItemsFromEntry(entry, displayIndex));
  });

  return items;
};

interface ClaudeCodeSessionProps {
  /**
   * Optional session to resume (when clicking from SessionList)
   */
  session?: Session;
  /**
   * Initial project path (for new sessions)
   */
  initialProjectPath?: string;
  /**
   * Callback to go back
   */
  onBack: () => void;
  /**
   * Callback to open hooks configuration
   */
  onProjectSettings?: (projectPath: string) => void;
  /**
   * Optional className for styling
   */
  className?: string;
  /**
   * Callback when streaming state changes
   */
  onStreamingChange?: (isStreaming: boolean, sessionId: string | null) => void;
  /**
   * Callback when project path changes
   */
  onProjectPathChange?: (path: string) => void;
}

/**
 * ClaudeCodeSession component for interactive Claude Code sessions
 * 
 * @example
 * <ClaudeCodeSession onBack={() => setView('projects')} />
 */
export const ClaudeCodeSession: React.FC<ClaudeCodeSessionProps> = ({
  session,
  initialProjectPath = "",
  className,
  onStreamingChange,
  onProjectPathChange,
}) => {
  const { t } = useTranslation();
  const [projectPath] = useState(initialProjectPath || session?.project_path || "");
  const [messages, setMessages] = useState<ClaudeStreamMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawJsonlOutput, setRawJsonlOutput] = useState<string[]>([]);
  const [copyPopoverOpen, setCopyPopoverOpen] = useState(false);
  const [isFirstPrompt, setIsFirstPrompt] = useState(!session);
  const [totalTokens, setTotalTokens] = useState(0);
  const [extractedSessionInfo, setExtractedSessionInfo] = useState<{ sessionId: string; projectId: string } | null>(null);
  const [claudeSessionId, setClaudeSessionId] = useState<string | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [timelineVersion, setTimelineVersion] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showForkDialog, setShowForkDialog] = useState(false);
  const [showSlashCommandsSettings, setShowSlashCommandsSettings] = useState(false);
  const [forkCheckpointId, setForkCheckpointId] = useState<string | null>(null);
  const [forkSessionName, setForkSessionName] = useState("");
  const [showOutline, setShowOutline] = useState(false);
  const [hideToolMessages, setHideToolMessages] = useState(false);
  const [displayableEntries, setDisplayableEntries] = useState<DisplayableEntry[]>([]);
  const [outlineItems, setOutlineItems] = useState<OutlineItem[]>([]);
  const [isDesktop, setIsDesktop] = useState(false);
  const [chatZoom, setChatZoom] = useState(DEFAULT_CHAT_ZOOM);
  const [isZoomPopoverOpen, setIsZoomPopoverOpen] = useState(false);

  // Queued prompts state
  const [queuedPrompts, setQueuedPrompts] = useState<Array<{ id: string; prompt: string; model: "sonnet" | "opus" }>>([]);
  
  // New state for preview feature
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [showPreviewPrompt, setShowPreviewPrompt] = useState(false);
  const [splitPosition, setSplitPosition] = useState(50);
  const [isPreviewMaximized, setIsPreviewMaximized] = useState(false);
  
  // Add collapsed state for queued prompts
  const [queuedPromptsCollapsed, setQueuedPromptsCollapsed] = useState(false);

  const parentRef = useRef<HTMLDivElement>(null);
  const unlistenRefs = useRef<UnlistenFn[]>([]);
  const hasActiveSessionRef = useRef(false);
  const floatingPromptRef = useRef<FloatingPromptInputRef>(null);
  const queuedPromptsRef = useRef<Array<{ id: string; prompt: string; model: "sonnet" | "opus" }>>([]);
  const isMountedRef = useRef(true);
  const isListeningRef = useRef(false);
  const sessionStartTime = useRef<number>(Date.now());
  const zoomPersistTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isIMEComposingRef = useRef(false);
  
  // Session metrics state for enhanced analytics
  const sessionMetrics = useRef({
    firstMessageTime: null as number | null,
    promptsSent: 0,
    toolsExecuted: 0,
    toolsFailed: 0,
    filesCreated: 0,
    filesModified: 0,
    filesDeleted: 0,
    codeBlocksGenerated: 0,
    errorsEncountered: 0,
    lastActivityTime: Date.now(),
    toolExecutionTimes: [] as number[],
    checkpointCount: 0,
    wasResumed: !!session,
    modelChanges: [] as Array<{ from: string; to: string; timestamp: number }>,
  });
  const pendingMessagesRef = useRef<ClaudeStreamMessage[]>([]);
  const pendingRawPayloadsRef = useRef<string[]>([]);
  const flushHandleRef = useRef<number | null>(null);
  const cancelScheduledFlush = useCallback(() => {
    if (flushHandleRef.current === null) {
      return;
    }

    if (flushHandleRef.current >= 0 && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(flushHandleRef.current);
    }

    flushHandleRef.current = null;
  }, []);
  const flushPendingMessages = useCallback(() => {
    const messagesToAppend = pendingMessagesRef.current;
    const rawToAppend = pendingRawPayloadsRef.current;

    pendingMessagesRef.current = [];
    pendingRawPayloadsRef.current = [];

    if (messagesToAppend.length > 0) {
      const appended = messagesToAppend.slice();
      setMessages(prev => (appended.length === 1 ? [...prev, appended[0]] : prev.concat(appended)));
    }

    if (rawToAppend.length > 0) {
      const appendedRaw = rawToAppend.slice();
      setRawJsonlOutput(prev => (appendedRaw.length === 1 ? [...prev, appendedRaw[0]] : prev.concat(appendedRaw)));
    }
  }, []);
  const scheduleFlush = useCallback(() => {
    if (flushHandleRef.current !== null) {
      return;
    }

    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      flushHandleRef.current = -1;
      Promise.resolve().then(() => {
        flushHandleRef.current = null;
        flushPendingMessages();
      });
      return;
    }

    flushHandleRef.current = window.requestAnimationFrame(() => {
      flushHandleRef.current = null;
      flushPendingMessages();
    });
  }, [flushPendingMessages]);
  const enqueueMessages = useCallback(
    (messagesToAdd: ClaudeStreamMessage[], rawPayloads: string[] = []) => {
      if (messagesToAdd.length > 0) {
        pendingMessagesRef.current.push(...messagesToAdd);
      }

      if (rawPayloads.length > 0) {
        pendingRawPayloadsRef.current.push(...rawPayloads);
      }

      if (messagesToAdd.length > 0 || rawPayloads.length > 0) {
        scheduleFlush();
      }
    },
    [scheduleFlush],
  );
  const replaceMessages = useCallback(
    (nextMessages: ClaudeStreamMessage[], nextRaw: string[]) => {
      cancelScheduledFlush();

      pendingMessagesRef.current = [];
      pendingRawPayloadsRef.current = [];

      setMessages(nextMessages);
      setRawJsonlOutput(nextRaw);
    },
    [cancelScheduledFlush],
  );
  useEffect(() => () => {
    cancelScheduledFlush();
    pendingMessagesRef.current = [];
    pendingRawPayloadsRef.current = [];
  }, [cancelScheduledFlush]);
  const displayableEntriesRef = useRef<DisplayableEntry[]>([]);
  const outlineItemsRef = useRef<OutlineItem[]>([]);
  const prevMessagesCountRef = useRef(0);
  const prevHideToolRef = useRef(hideToolMessages);
  const lastMessagesSnapshotRef = useRef<ClaudeStreamMessage[]>(messages);

  // Analytics tracking
  const trackEvent = useTrackEvent();
  useComponentMetrics('ClaudeCodeSession');
  // const aiTracking = useAIInteractionTracking('sonnet'); // Default model
  const workflowTracking = useWorkflowTracking('claude_session');
  
  // Call onProjectPathChange when component mounts with initial path
  useEffect(() => {
    if (onProjectPathChange && projectPath) {
      onProjectPathChange(projectPath);
    }
  }, []); // Only run on mount
  
  // Keep ref in sync with state
  useEffect(() => {
    queuedPromptsRef.current = queuedPrompts;
  }, [queuedPrompts]);

  useEffect(() => {
    let cancelled = false;

    const loadZoomPreference = async () => {
      let loaded: number | null = null;

      if (typeof window !== 'undefined') {
        const localValue = window.localStorage.getItem(CHAT_ZOOM_STORAGE_KEY);
        if (localValue) {
          const parsedLocal = clampZoom(parseFloat(localValue));
          if (!Number.isNaN(parsedLocal)) {
            loaded = parsedLocal;
          }
        }
      }

      try {
        const stored = await api.getSetting(CHAT_ZOOM_STORAGE_KEY);
        if (stored) {
          const parsedStored = clampZoom(parseFloat(stored));
          if (!Number.isNaN(parsedStored)) {
            loaded = parsedStored;
          }
        }
      } catch (error) {
        console.warn('Failed to load chat zoom preference:', error);
      }

      if (!cancelled && loaded !== null) {
        setChatZoom(loaded);
      }
    };

    loadZoomPreference();

    return () => {
      cancelled = true;
      if (zoomPersistTimeoutRef.current) {
        clearTimeout(zoomPersistTimeoutRef.current);
        zoomPersistTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }
    const mql = window.matchMedia('(min-width: 640px)');
    const update = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsDesktop(event.matches);
    };
    update(mql);
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', update);
      return () => mql.removeEventListener('change', update);
    } else {
      // Safari fallback
      // @ts-ignore
      mql.addListener(update);
      return () => {
        // @ts-ignore
        mql.removeListener(update);
      };
    }
  }, []);

  // Get effective session info (from prop or extracted) - use useMemo to ensure it updates
  const effectiveSession = useMemo(() => {
    if (session) return session;
    if (extractedSessionInfo) {
      return {
        id: extractedSessionInfo.sessionId,
        project_id: extractedSessionInfo.projectId,
        project_path: projectPath,
        created_at: Date.now(),
      } as Session;
    }
    return null;
  }, [session, extractedSessionInfo, projectPath]);

  useEffect(() => {
    const prevCount = prevMessagesCountRef.current;
    const newCount = messages.length;
    const messagesChanged = lastMessagesSnapshotRef.current !== messages;
    const replaced = messagesChanged && newCount === prevCount && newCount !== 0;
    const hideChanged = prevHideToolRef.current !== hideToolMessages;
    const prevEntries = displayableEntriesRef.current;
    const prevDisplayableLength = prevEntries.length;

    const shouldRebuild = hideChanged || newCount < prevCount || replaced;

    let updatedEntries: DisplayableEntry[] | null = null;
    let rebuilt = false;

    if (shouldRebuild) {
      updatedEntries = buildDisplayableEntries(messages, hideToolMessages);
      rebuilt = true;
    } else if (newCount > prevCount) {
      const nextEntries = prevEntries.slice();
      let added = false;

      for (let i = prevCount; i < newCount; i++) {
        const message = messages[i];
        if (shouldDisplayMessage(messages, message, i, hideToolMessages)) {
          nextEntries.push({ message, originalIndex: i });
          added = true;
        }
      }

      if (added) {
        updatedEntries = nextEntries;
      }
    } else if (newCount === 0 && prevEntries.length !== 0) {
      updatedEntries = [];
      rebuilt = true;
    }

    if (updatedEntries) {
      displayableEntriesRef.current = updatedEntries;
      setDisplayableEntries(updatedEntries);

      if (rebuilt) {
        const rebuiltOutline = updatedEntries.length > 0 ? buildOutlineItems(updatedEntries) : [];
        outlineItemsRef.current = rebuiltOutline;
        setOutlineItems(rebuiltOutline);
      } else {
        const appendedCount = updatedEntries.length - prevDisplayableLength;

        if (appendedCount > 0) {
          const baseIndex = updatedEntries.length - appendedCount;
          const appendedOutline: OutlineItem[] = [];

          for (let i = 0; i < appendedCount; i++) {
            const entry = updatedEntries[baseIndex + i];
            appendedOutline.push(...extractOutlineItemsFromEntry(entry, baseIndex + i));
          }

          if (appendedOutline.length > 0) {
            const nextOutline = outlineItemsRef.current.concat(appendedOutline);
            outlineItemsRef.current = nextOutline;
            setOutlineItems(nextOutline);
          }
        }
      }
    } else if (rebuilt) {
      if (outlineItemsRef.current.length > 0) {
        outlineItemsRef.current = [];
        setOutlineItems([]);
      }
    }

    if (!updatedEntries && shouldRebuild && displayableEntriesRef.current.length === 0) {
      if (outlineItemsRef.current.length > 0) {
        outlineItemsRef.current = [];
        setOutlineItems([]);
      }
    }

    prevMessagesCountRef.current = newCount;
    prevHideToolRef.current = hideToolMessages;
    lastMessagesSnapshotRef.current = messages;
  }, [messages, hideToolMessages]);

  useEffect(() => {
    if (showOutline && outlineItems.length === 0) {
      setShowOutline(false);
    }
  }, [outlineItems.length, showOutline]);

  const rightOffset = (showTimeline ? TIMELINE_PANEL_WIDTH : 0) + (showOutline ? OUTLINE_PANEL_WIDTH : 0);
  const zoomPercent = Math.round(chatZoom * 100);
  const canIncreaseZoom = chatZoom < CHAT_ZOOM_MAX - 0.001;
  const canDecreaseZoom = chatZoom > CHAT_ZOOM_MIN + 0.001;
  const isZoomDefault = Math.abs(chatZoom - DEFAULT_CHAT_ZOOM) < 0.001;

  const rowVirtualizer = useVirtualizer({
    count: displayableEntries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 150 * chatZoom,
    overscan: 5,
    getItemKey: (index) => {
      const entry = displayableEntries[index];
      return entry ? `${entry.originalIndex}-${hideToolMessages ? 'hide' : 'show'}` : index;
    },
  });

  useEffect(() => {
    if (typeof rowVirtualizer.measure === 'function') {
      rowVirtualizer.measure();
    }
  }, [chatZoom, rowVirtualizer]);

  // Debug logging
  useEffect(() => {
    console.log('[ClaudeCodeSession] State update:', {
      projectPath,
      session,
      extractedSessionInfo,
      effectiveSession,
      messagesCount: messages.length,
      isLoading
    });
  }, [projectPath, session, extractedSessionInfo, effectiveSession, messages.length, isLoading]);

  // Load session history if resuming
  useEffect(() => {
    if (session) {
      // Set the claudeSessionId immediately when we have a session
      setClaudeSessionId(session.id);
      
      // Load session history first, then check for active session
      const initializeSession = async () => {
        await loadSessionHistory();
        // After loading history, check if the session is still active
        if (isMountedRef.current) {
          await checkForActiveSession();
        }
      };
      
      initializeSession();
    }
  }, [session]); // Remove hasLoadedSession dependency to ensure it runs on mount

  // Report streaming state changes
  useEffect(() => {
    onStreamingChange?.(isLoading, claudeSessionId);
  }, [isLoading, claudeSessionId, onStreamingChange]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (displayableEntries.length > 0) {
      // Use a more precise scrolling method to ensure content is fully visible
      setTimeout(() => {
        const scrollElement = parentRef.current;
        if (scrollElement) {
          // First, scroll using virtualizer to get close to the bottom
          rowVirtualizer.scrollToIndex(displayableEntries.length - 1, { align: 'end', behavior: 'auto' });

          // Then use direct scroll to ensure we reach the absolute bottom
          requestAnimationFrame(() => {
            scrollElement.scrollTo({
              top: scrollElement.scrollHeight,
              behavior: 'smooth'
            });
          });
        }
      }, 50);
    }
  }, [displayableEntries.length, rowVirtualizer]);

  // Calculate total tokens from messages
  useEffect(() => {
    const tokens = messages.reduce((total, msg) => {
      if (msg.message?.usage) {
        return total + msg.message.usage.input_tokens + msg.message.usage.output_tokens;
      }
      if (msg.usage) {
        return total + msg.usage.input_tokens + msg.usage.output_tokens;
      }
      return total;
    }, 0);
    setTotalTokens(tokens);
  }, [messages]);

  const loadSessionHistory = async () => {
    if (!session) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      const history = await api.loadSessionHistory(session.id, session.project_id);
      
      // Save session data for restoration
      if (history && history.length > 0) {
        SessionPersistenceService.saveSession(
          session.id,
          session.project_id,
          session.project_path,
          history.length
        );
      }
      
      // Convert history to messages format
      const loadedMessages: ClaudeStreamMessage[] = history.map(entry => ({
        ...entry,
        type: entry.type || "assistant"
      }));
      
      replaceMessages(loadedMessages, history.map(h => JSON.stringify(h)));
      
      // After loading history, we're continuing a conversation
      setIsFirstPrompt(false);
      
      // Scroll to bottom after loading history
      setTimeout(() => {
        if (loadedMessages.length > 0) {
          const scrollElement = parentRef.current;
          if (scrollElement) {
            // Use the same improved scrolling method
            rowVirtualizer.scrollToIndex(loadedMessages.length - 1, { align: 'end', behavior: 'auto' });
            requestAnimationFrame(() => {
              scrollElement.scrollTo({
                top: scrollElement.scrollHeight,
                behavior: 'auto'
              });
            });
          }
        }
      }, 100);
    } catch (err) {
      console.error("Failed to load session history:", err);
      setError(t("errors.failedToLoadHistory"));
    } finally {
      setIsLoading(false);
    }
  };

  const checkForActiveSession = async () => {
    // If we have a session prop, check if it's still active
    if (session) {
      try {
        const activeSessions = await api.listRunningClaudeSessions();
        const activeSession = activeSessions.find((s: any) => {
          if ('process_type' in s && s.process_type && 'ClaudeSession' in s.process_type) {
            return (s.process_type as any).ClaudeSession.session_id === session.id;
          }
          return false;
        });
        
        if (activeSession) {
          // Session is still active, reconnect to its stream
          console.log('[ClaudeCodeSession] Found active session, reconnecting:', session.id);
          // IMPORTANT: Set claudeSessionId before reconnecting
          setClaudeSessionId(session.id);
          
          // Don't add buffered messages here - they've already been loaded by loadSessionHistory
          // Just set up listeners for new messages
          
          // Set up listeners for the active session
          reconnectToSession(session.id);
        }
      } catch (err) {
        console.error('Failed to check for active sessions:', err);
      }
    }
  };

  const reconnectToSession = async (sessionId: string) => {
    console.log('[ClaudeCodeSession] Reconnecting to session:', sessionId);
    
    // Prevent duplicate listeners
    if (isListeningRef.current) {
      console.log('[ClaudeCodeSession] Already listening to session, skipping reconnect');
      return;
    }
    
    // Clean up previous listeners
    unlistenRefs.current.forEach(unlisten => unlisten());
    unlistenRefs.current = [];
    
    // IMPORTANT: Set the session ID before setting up listeners
    setClaudeSessionId(sessionId);
    
    // Mark as listening
    isListeningRef.current = true;
    
    // Set up session-specific listeners
    const processedPayloads = new Set<string>();
    const processedMessageIds = new Set<string>();

    const outputUnlisten = await listen<string>(`claude-output:${sessionId}`, async (event) => {
      try {
        console.log('[ClaudeCodeSession] Received claude-output on reconnect:', event.payload);
        
        if (!isMountedRef.current) return;

        if (processedPayloads.has(event.payload)) {
          console.log('[ClaudeCodeSession] Skipping duplicate payload on reconnect');
          return;
        }

        // Parse and display
        const message = JSON.parse(event.payload) as ClaudeStreamMessage;

        const messageId = message.timestamp ||
          (message.message?.usage ? `${message.type}-${message.message.usage.input_tokens}-${message.message.usage.output_tokens}` : null) ||
          (message.session_id ? `${message.type}-${message.session_id}` : null) ||
          `${message.type}-${Date.now()}-${Math.random()}`;

        if (processedMessageIds.has(messageId)) {
          console.log('[ClaudeCodeSession] Skipping duplicate message on reconnect');
          return;
        }

        processedPayloads.add(event.payload);
        processedMessageIds.add(messageId);
        enqueueMessages([message], [event.payload]);
      } catch (err) {
        console.error("Failed to parse message:", err, event.payload);
      }
    });

    const errorUnlisten = await listen<string>(`claude-error:${sessionId}`, (event) => {
      console.error("Claude error:", event.payload);
      if (isMountedRef.current) {
        setError(event.payload);
      }
    });

    const completeUnlisten = await listen<boolean>(`claude-complete:${sessionId}`, async (event) => {
      console.log('[ClaudeCodeSession] Received claude-complete on reconnect:', event.payload);
      if (isMountedRef.current) {
        setIsLoading(false);
        hasActiveSessionRef.current = false;
      }
    });

    unlistenRefs.current = [outputUnlisten, errorUnlisten, completeUnlisten];
    
    // Mark as loading to show the session is active
    if (isMountedRef.current) {
      setIsLoading(true);
      hasActiveSessionRef.current = true;
    }
  };

  // Project path selection handled by parent tab controls

  const handleSendPrompt = async (prompt: string, model: "sonnet" | "opus") => {
    console.log('[ClaudeCodeSession] handleSendPrompt called with:', { prompt, model, projectPath, claudeSessionId, effectiveSession });
    
    if (!projectPath) {
      setError("Please select a project directory first");
      return;
    }

    // If already loading, queue the prompt
    if (isLoading) {
      const newPrompt = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        prompt,
        model
      };
      setQueuedPrompts(prev => [...prev, newPrompt]);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      hasActiveSessionRef.current = true;
      
      // For resuming sessions, ensure we have the session ID
      if (effectiveSession && !claudeSessionId) {
        setClaudeSessionId(effectiveSession.id);
      }
      
      // Only clean up and set up new listeners if not already listening
      if (!isListeningRef.current) {
        // Clean up previous listeners
        unlistenRefs.current.forEach(unlisten => unlisten());
        unlistenRefs.current = [];
        
        // Mark as setting up listeners
        isListeningRef.current = true;
        
        // --------------------------------------------------------------------
        // 1️⃣  Event Listener Setup Strategy
        // --------------------------------------------------------------------
        // Claude Code may emit a *new* session_id even when we pass --resume. If
        // we listen only on the old session-scoped channel we will miss the
        // stream until the user navigates away & back. To avoid this we:
        //   • Always start with GENERIC listeners (no suffix) so we catch the
        //     very first "system:init" message regardless of the session id.
        //   • Once that init message provides the *actual* session_id, we
        //     dynamically switch to session-scoped listeners and stop the
        //     generic ones to prevent duplicate handling.
        // --------------------------------------------------------------------

        console.log('[ClaudeCodeSession] Setting up generic event listeners first');

        let currentSessionId: string | null = claudeSessionId || effectiveSession?.id || null;

        let genericOutputUnlisten: UnlistenFn | null = null;
        let genericErrorUnlisten: UnlistenFn | null = null;
        let genericCompleteUnlisten: UnlistenFn | null = null;

        const removeFromActive = (fn: UnlistenFn | null) => {
          if (!fn) return;
          unlistenRefs.current = unlistenRefs.current.filter((listener) => listener !== fn);
        };

        const stopGenericListeners = () => {
          if (genericOutputUnlisten) {
            const fn = genericOutputUnlisten;
            genericOutputUnlisten = null;
            fn();
            removeFromActive(fn);
          }
          if (genericErrorUnlisten) {
            const fn = genericErrorUnlisten;
            genericErrorUnlisten = null;
            fn();
            removeFromActive(fn);
          }
          if (genericCompleteUnlisten) {
            const fn = genericCompleteUnlisten;
            genericCompleteUnlisten = null;
            fn();
            removeFromActive(fn);
          }
        };

        const attachSessionSpecificListeners = async (sid: string) => {
          console.log('[ClaudeCodeSession] Attaching session-specific listeners for', sid);

          // Immediately stop generic listeners to avoid duplicate handling
          stopGenericListeners();

          unlistenRefs.current.forEach((u) => u());
          unlistenRefs.current = [];

          const specificOutputUnlisten = await listen<string>(`claude-output:${sid}`, (evt) => {
            console.log('[ClaudeCodeSession] Received session-specific message:', sid);
            handleStreamMessage(evt.payload);
          });

          const specificErrorUnlisten = await listen<string>(`claude-error:${sid}`, (evt) => {
            console.error('Claude error (scoped):', evt.payload);
            setError(evt.payload);
          });

          const specificCompleteUnlisten = await listen<boolean>(`claude-complete:${sid}`, (evt) => {
            console.log('[ClaudeCodeSession] Received claude-complete (scoped):', evt.payload);
            processComplete(evt.payload);
          });

          unlistenRefs.current = [specificOutputUnlisten, specificErrorUnlisten, specificCompleteUnlisten];
        };

        // Generic listeners (catch-all)
        genericOutputUnlisten = await listen<string>('claude-output', async (event) => {
          console.log('[ClaudeCodeSession] Received generic message');
          handleStreamMessage(event.payload);

          // Attempt to extract session_id on the fly (for the very first init)
          try {
            const msg = JSON.parse(event.payload) as ClaudeStreamMessage;
            if (msg.type === 'system' && msg.subtype === 'init' && msg.session_id) {
              if (!currentSessionId || currentSessionId !== msg.session_id) {
                console.log('[ClaudeCodeSession] Detected new session_id from generic listener:', msg.session_id);
                currentSessionId = msg.session_id;
                setClaudeSessionId(msg.session_id);

                // If we haven't extracted session info before, do it now
                if (!extractedSessionInfo) {
                  const projectId = projectPath.replace(/[^a-zA-Z0-9]/g, '-');
                  setExtractedSessionInfo({ sessionId: msg.session_id, projectId });

                  // Save session data for restoration
                  SessionPersistenceService.saveSession(
                    msg.session_id,
                    projectId,
                    projectPath,
                    messages.length
                  );
                }

                // Switch to session-specific listeners and clean up generic ones
                console.log('[ClaudeCodeSession] Switching to session-specific listeners...');
                await attachSessionSpecificListeners(msg.session_id);
              }
            }
          } catch {
            /* ignore parse errors */
          }
        });

        // Helper to process any JSONL stream message string
        // Use Sets to track processed payloads and IDs to prevent duplicates
        const processedPayloads = new Set<string>();
        const processedMessages = new Set<string>();
        let completionHandled = false;

        function handleStreamMessage(payload: string) {
          try {
            // Don't process if component unmounted
            if (!isMountedRef.current) return;

            // Skip duplicate payloads (same message delivered on multiple channels)
            if (processedPayloads.has(payload)) {
              console.log('[ClaudeCodeSession] Skipping duplicate payload');
              return;
            }

            // Parse the message to get a unique identifier
            const message = JSON.parse(payload) as ClaudeStreamMessage;

            // Create a unique message ID for deduplication
            const messageId = message.timestamp ||
                            (message.message?.usage ? `${message.type}-${message.message.usage.input_tokens}-${message.message.usage.output_tokens}` : null) ||
                            (message.session_id ? `${message.type}-${message.session_id}` : null) ||
                            `${message.type}-${Date.now()}-${Math.random()}`;

            // Check if we've already processed this message
            if (processedMessages.has(messageId)) {
              console.log('[ClaudeCodeSession] Skipping duplicate message:', messageId);
              return;
            }

            // Mark this message as processed
            processedPayloads.add(payload);
            processedMessages.add(messageId);

            enqueueMessages([message], [payload]);

            // Track enhanced tool execution
            if (message.type === 'assistant' && message.message?.content) {
              const toolUses = message.message.content.filter((c: any) => c.type === 'tool_use');
              toolUses.forEach((toolUse: any) => {
                // Increment tools executed counter
                sessionMetrics.current.toolsExecuted += 1;
                sessionMetrics.current.lastActivityTime = Date.now();
                
                // Track file operations
                const toolName = toolUse.name?.toLowerCase() || '';
                if (toolName.includes('create') || toolName.includes('write')) {
                  sessionMetrics.current.filesCreated += 1;
                } else if (toolName.includes('edit') || toolName.includes('multiedit') || toolName.includes('search_replace')) {
                  sessionMetrics.current.filesModified += 1;
                } else if (toolName.includes('delete')) {
                  sessionMetrics.current.filesDeleted += 1;
                }
                
                // Track tool start - we'll track completion when we get the result
                workflowTracking.trackStep(toolUse.name);
              });
            }
            
            // Track tool results
            if (message.type === 'user' && message.message?.content) {
              const toolResults = message.message.content.filter((c: any) => c.type === 'tool_result');
              toolResults.forEach((result: any) => {
                const isError = result.is_error || false;
                // Note: We don't have execution time here, but we can track success/failure
                if (isError) {
                  sessionMetrics.current.toolsFailed += 1;
                  sessionMetrics.current.errorsEncountered += 1;
                  
                  trackEvent.enhancedError({
                    error_type: 'tool_execution',
                    error_code: 'tool_failed',
                    error_message: result.content,
                    context: `Tool execution failed`,
                    user_action_before_error: 'executing_tool',
                    recovery_attempted: false,
                    recovery_successful: false,
                    error_frequency: 1,
                    stack_trace_hash: undefined
                  });
                }
              });
            }
            
            // Track code blocks generated
            if (message.type === 'assistant' && message.message?.content) {
              const codeBlocks = message.message.content.filter((c: any) => 
                c.type === 'text' && c.text?.includes('```')
              );
              if (codeBlocks.length > 0) {
                // Count code blocks in text content
                codeBlocks.forEach((block: any) => {
                  const matches = (block.text.match(/```/g) || []).length;
                  sessionMetrics.current.codeBlocksGenerated += Math.floor(matches / 2);
                });
              }
            }
            
            // Track errors in system messages
            if (message.type === 'system' && (message.subtype === 'error' || message.error)) {
              sessionMetrics.current.errorsEncountered += 1;
            }
            
          } catch (err) {
            console.error('Failed to parse message:', err, payload);
          }
        }

        // Helper to handle completion events (both generic and scoped)
        const processComplete = async (success: boolean) => {
          if (completionHandled) {
            return;
          }
          completionHandled = true;
          // Ensure generic listeners are torn down when execution finishes
          stopGenericListeners();
          setIsLoading(false);
          hasActiveSessionRef.current = false;
          isListeningRef.current = false; // Reset listening state
          
          // Track enhanced session stopped metrics when session completes
          if (effectiveSession && claudeSessionId) {
            const sessionStartTimeValue = messages.length > 0 ? messages[0].timestamp || Date.now() : Date.now();
            const duration = Date.now() - sessionStartTimeValue;
            const metrics = sessionMetrics.current;
            const timeToFirstMessage = metrics.firstMessageTime 
              ? metrics.firstMessageTime - sessionStartTime.current 
              : undefined;
            const idleTime = Date.now() - metrics.lastActivityTime;
            const avgResponseTime = metrics.toolExecutionTimes.length > 0
              ? metrics.toolExecutionTimes.reduce((a, b) => a + b, 0) / metrics.toolExecutionTimes.length
              : undefined;
            
            trackEvent.enhancedSessionStopped({
              // Basic metrics
              duration_ms: duration,
              messages_count: messages.length,
              reason: success ? 'completed' : 'error',
              
              // Timing metrics
              time_to_first_message_ms: timeToFirstMessage,
              average_response_time_ms: avgResponseTime,
              idle_time_ms: idleTime,
              
              // Interaction metrics
              prompts_sent: metrics.promptsSent,
              tools_executed: metrics.toolsExecuted,
              tools_failed: metrics.toolsFailed,
              files_created: metrics.filesCreated,
              files_modified: metrics.filesModified,
              files_deleted: metrics.filesDeleted,
              
              // Content metrics
              total_tokens_used: totalTokens,
              code_blocks_generated: metrics.codeBlocksGenerated,
              errors_encountered: metrics.errorsEncountered,
              
              // Session context
              model: metrics.modelChanges.length > 0 
                ? metrics.modelChanges[metrics.modelChanges.length - 1].to 
                : 'sonnet',
              has_checkpoints: metrics.checkpointCount > 0,
              checkpoint_count: metrics.checkpointCount,
              was_resumed: metrics.wasResumed,
              
              // Agent context (if applicable)
              agent_type: undefined, // TODO: Pass from agent execution
              agent_name: undefined, // TODO: Pass from agent execution
              agent_success: success,
              
              // Stop context
              stop_source: 'completed',
              final_state: success ? 'success' : 'failed',
              has_pending_prompts: queuedPrompts.length > 0,
              pending_prompts_count: queuedPrompts.length,
            });
          }

          if (effectiveSession && success) {
            try {
              const settings = await api.getCheckpointSettings(
                effectiveSession.id,
                effectiveSession.project_id,
                projectPath
              );

              if (settings.auto_checkpoint_enabled) {
                await api.checkAutoCheckpoint(
                  effectiveSession.id,
                  effectiveSession.project_id,
                  projectPath,
                  prompt
                );
                // Reload timeline to show new checkpoint
                setTimelineVersion((v) => v + 1);
              }
            } catch (err) {
              console.error('Failed to check auto checkpoint:', err);
            }
          }

          // Process queued prompts after completion
          if (queuedPromptsRef.current.length > 0) {
            const [nextPrompt, ...remainingPrompts] = queuedPromptsRef.current;
            setQueuedPrompts(remainingPrompts);
            
            // Small delay to ensure UI updates
            setTimeout(() => {
              handleSendPrompt(nextPrompt.prompt, nextPrompt.model);
            }, 100);
          }
        };

        genericErrorUnlisten = await listen<string>('claude-error', (evt) => {
          console.error('Claude error:', evt.payload);
          setError(evt.payload);
        });

        genericCompleteUnlisten = await listen<boolean>('claude-complete', (evt) => {
          console.log('[ClaudeCodeSession] Received claude-complete (generic):', evt.payload);
          processComplete(evt.payload);
        });

        // Store the generic unlisteners for now; they may be replaced later.
        unlistenRefs.current = [
          genericOutputUnlisten,
          genericErrorUnlisten,
          genericCompleteUnlisten,
        ].filter((fn): fn is UnlistenFn => Boolean(fn));

        // --------------------------------------------------------------------
        // 2️⃣  Auto-checkpoint logic moved after listener setup (unchanged)
        // --------------------------------------------------------------------

        // Add the user message immediately to the UI (after setting up listeners)
        const userMessage: ClaudeStreamMessage = {
          type: "user",
          message: {
            content: [
              {
                type: "text",
                text: prompt
              }
            ]
          }
        };
        enqueueMessages([userMessage]);
        
        // Update session metrics
        sessionMetrics.current.promptsSent += 1;
        sessionMetrics.current.lastActivityTime = Date.now();
        if (!sessionMetrics.current.firstMessageTime) {
          sessionMetrics.current.firstMessageTime = Date.now();
        }
        
        // Track model changes
        const lastModel = sessionMetrics.current.modelChanges.length > 0 
          ? sessionMetrics.current.modelChanges[sessionMetrics.current.modelChanges.length - 1].to
          : (sessionMetrics.current.wasResumed ? 'sonnet' : model); // Default to sonnet if resumed
        
        if (lastModel !== model) {
          sessionMetrics.current.modelChanges.push({
            from: lastModel,
            to: model,
            timestamp: Date.now()
          });
        }
        
        // Track enhanced prompt submission
        const codeBlockMatches = prompt.match(/```[\s\S]*?```/g) || [];
        const hasCode = codeBlockMatches.length > 0;
        const conversationDepth = messages.filter(m => m.user_message).length;
        const sessionAge = sessionStartTime.current ? Date.now() - sessionStartTime.current : 0;
        const wordCount = prompt.split(/\s+/).filter(word => word.length > 0).length;
        
        trackEvent.enhancedPromptSubmitted({
          prompt_length: prompt.length,
          model: model,
          has_attachments: false, // TODO: Add attachment support when implemented
          source: 'keyboard', // TODO: Track actual source (keyboard vs button)
          word_count: wordCount,
          conversation_depth: conversationDepth,
          prompt_complexity: wordCount < 20 ? 'simple' : wordCount < 100 ? 'moderate' : 'complex',
          contains_code: hasCode,
          language_detected: hasCode ? codeBlockMatches?.[0]?.match(/```(\w+)/)?.[1] : undefined,
          session_age_ms: sessionAge
        });

        // Execute the appropriate command
        if (effectiveSession && !isFirstPrompt) {
          console.log('[ClaudeCodeSession] Resuming session:', effectiveSession.id);
          trackEvent.sessionResumed(effectiveSession.id);
          trackEvent.modelSelected(model);
          await api.resumeClaudeCode(projectPath, effectiveSession.id, prompt, model);
        } else {
          console.log('[ClaudeCodeSession] Starting new session');
          setIsFirstPrompt(false);
          trackEvent.sessionCreated(model, 'prompt_input');
          trackEvent.modelSelected(model);
          await api.executeClaudeCode(projectPath, prompt, model);
        }
      }
    } catch (err) {
      console.error("Failed to send prompt:", err);
      setError(t("errors.failedToSendPrompt"));
      setIsLoading(false);
      hasActiveSessionRef.current = false;
    }
  };

  const handleCopyAsJsonl = async () => {
    const jsonl = rawJsonlOutput.join('\n');
    await navigator.clipboard.writeText(jsonl);
    setCopyPopoverOpen(false);
  };

  const handleCopyAsMarkdown = async () => {
    let markdown = `# Claude Code Session\n\n`;
    markdown += `**Project:** ${projectPath}\n`;
    markdown += `**Date:** ${new Date().toISOString()}\n\n`;
    markdown += `---\n\n`;

    for (const msg of messages) {
      if (msg.type === "system" && msg.subtype === "init") {
        markdown += `## System Initialization\n\n`;
        markdown += `- Session ID: \`${msg.session_id || 'N/A'}\`\n`;
        markdown += `- Model: \`${msg.model || 'default'}\`\n`;
        if (msg.cwd) markdown += `- Working Directory: \`${msg.cwd}\`\n`;
        if (msg.tools?.length) markdown += `- Tools: ${msg.tools.join(', ')}\n`;
        markdown += `\n`;
      } else if (msg.type === "assistant" && msg.message) {
        markdown += `## Assistant\n\n`;
        for (const content of msg.message.content || []) {
          if (content.type === "text") {
            const textContent = typeof content.text === 'string' 
              ? content.text 
              : (content.text?.text || JSON.stringify(content.text || content));
            markdown += `${textContent}\n\n`;
          } else if (content.type === "tool_use") {
            markdown += `### Tool: ${content.name}\n\n`;
            markdown += `\`\`\`json\n${JSON.stringify(content.input, null, 2)}\n\`\`\`\n\n`;
          }
        }
        if (msg.message.usage) {
          markdown += `*Tokens: ${msg.message.usage.input_tokens} in, ${msg.message.usage.output_tokens} out*\n\n`;
        }
      } else if (msg.type === "user" && msg.message) {
        markdown += `## User\n\n`;
        for (const content of msg.message.content || []) {
          if (content.type === "text") {
            const textContent = typeof content.text === 'string' 
              ? content.text 
              : (content.text?.text || JSON.stringify(content.text));
            markdown += `${textContent}\n\n`;
          } else if (content.type === "tool_result") {
            markdown += `### Tool Result\n\n`;
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
            markdown += `\`\`\`\n${contentText}\n\`\`\`\n\n`;
          }
        }
      } else if (msg.type === "result") {
        markdown += `## Execution Result\n\n`;
        if (msg.result) {
          markdown += `${msg.result}\n\n`;
        }
        if (msg.error) {
          markdown += `**Error:** ${msg.error}\n\n`;
        }
      }
    }

    await navigator.clipboard.writeText(markdown);
    setCopyPopoverOpen(false);
  };

  const handleCheckpointSelect = async () => {
    // Reload messages from the checkpoint
    await loadSessionHistory();
    // Ensure timeline reloads to highlight current checkpoint
    setTimelineVersion((v) => v + 1);
  };
  
  const handleCheckpointCreated = () => {
    // Update checkpoint count in session metrics
    sessionMetrics.current.checkpointCount += 1;
  };

  const handleOutlineNavigate = (displayIndex: number) => {
    rowVirtualizer.scrollToIndex(displayIndex, { align: 'start', behavior: 'smooth' });
    if (!isDesktop) {
      setShowOutline(false);
    }
  };

  const persistChatZoom = (value: number) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CHAT_ZOOM_STORAGE_KEY, value.toString());
    }
    if (zoomPersistTimeoutRef.current) {
      clearTimeout(zoomPersistTimeoutRef.current);
    }
    zoomPersistTimeoutRef.current = setTimeout(() => {
      api.saveSetting(CHAT_ZOOM_STORAGE_KEY, value.toString()).catch((error) => {
        console.warn('Failed to persist chat zoom preference:', error);
      });
    }, 300);
  };

  const applyZoom = (value: number) => {
    const clamped = clampZoom(value);
    setChatZoom(clamped);
    persistChatZoom(clamped);
  };

  const increaseZoom = () => applyZoom(chatZoom + CHAT_ZOOM_STEP);
  const decreaseZoom = () => applyZoom(chatZoom - CHAT_ZOOM_STEP);
  const resetZoom = () => applyZoom(DEFAULT_CHAT_ZOOM);
  const handleZoomSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = parseFloat(event.target.value);
    if (!Number.isNaN(parsed)) {
      applyZoom(parsed);
    }
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const modKey = isMac ? event.metaKey : event.ctrlKey;
      if (!modKey) return;

      if (event.key === '=' || event.key === '+') {
        event.preventDefault();
        increaseZoom();
      } else if (event.key === '-') {
        event.preventDefault();
        decreaseZoom();
      } else if (event.key === '0') {
        event.preventDefault();
        resetZoom();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [increaseZoom, decreaseZoom, resetZoom]);

  const handleCancelExecution = async () => {
    if (!claudeSessionId || !isLoading) return;
    
    try {
      const sessionStartTime = messages.length > 0 ? messages[0].timestamp || Date.now() : Date.now();
      const duration = Date.now() - sessionStartTime;
      
      await api.cancelClaudeExecution(claudeSessionId);
      
      // Calculate metrics for enhanced analytics
      const metrics = sessionMetrics.current;
      const timeToFirstMessage = metrics.firstMessageTime 
        ? metrics.firstMessageTime - sessionStartTime.current 
        : undefined;
      const idleTime = Date.now() - metrics.lastActivityTime;
      const avgResponseTime = metrics.toolExecutionTimes.length > 0
        ? metrics.toolExecutionTimes.reduce((a, b) => a + b, 0) / metrics.toolExecutionTimes.length
        : undefined;
      
      // Track enhanced session stopped
      trackEvent.enhancedSessionStopped({
        // Basic metrics
        duration_ms: duration,
        messages_count: messages.length,
        reason: 'user_stopped',
        
        // Timing metrics
        time_to_first_message_ms: timeToFirstMessage,
        average_response_time_ms: avgResponseTime,
        idle_time_ms: idleTime,
        
        // Interaction metrics
        prompts_sent: metrics.promptsSent,
        tools_executed: metrics.toolsExecuted,
        tools_failed: metrics.toolsFailed,
        files_created: metrics.filesCreated,
        files_modified: metrics.filesModified,
        files_deleted: metrics.filesDeleted,
        
        // Content metrics
        total_tokens_used: totalTokens,
        code_blocks_generated: metrics.codeBlocksGenerated,
        errors_encountered: metrics.errorsEncountered,
        
        // Session context
        model: metrics.modelChanges.length > 0 
          ? metrics.modelChanges[metrics.modelChanges.length - 1].to 
          : 'sonnet', // Default to sonnet
        has_checkpoints: metrics.checkpointCount > 0,
        checkpoint_count: metrics.checkpointCount,
        was_resumed: metrics.wasResumed,
        
        // Agent context (if applicable)
        agent_type: undefined, // TODO: Pass from agent execution
        agent_name: undefined, // TODO: Pass from agent execution
        agent_success: undefined, // TODO: Pass from agent execution
        
        // Stop context
        stop_source: 'user_button',
        final_state: 'cancelled',
        has_pending_prompts: queuedPrompts.length > 0,
        pending_prompts_count: queuedPrompts.length,
      });
      
      // Clean up listeners
      unlistenRefs.current.forEach(unlisten => unlisten());
      unlistenRefs.current = [];
      
      // Reset states
      setIsLoading(false);
      hasActiveSessionRef.current = false;
      isListeningRef.current = false;
      setError(null);
      
      // Clear queued prompts
      setQueuedPrompts([]);
      
      // Add a message indicating the session was cancelled
      const cancelMessage: ClaudeStreamMessage = {
        type: "system",
        subtype: "info",
        result: "Session cancelled by user",
        timestamp: new Date().toISOString()
      };
      enqueueMessages([cancelMessage]);
    } catch (err) {
      console.error("Failed to cancel execution:", err);
      
      // Even if backend fails, we should update UI to reflect stopped state
      // Add error message but still stop the UI loading state
      const errorMessage: ClaudeStreamMessage = {
        type: "system",
        subtype: "error",
        result: `Failed to cancel execution: ${err instanceof Error ? err.message : 'Unknown error'}. The process may still be running in the background.`,
        timestamp: new Date().toISOString()
      };
      enqueueMessages([errorMessage]);
      
      // Clean up listeners anyway
      unlistenRefs.current.forEach(unlisten => unlisten());
      unlistenRefs.current = [];
      
      // Reset states to allow user to continue
      setIsLoading(false);
      hasActiveSessionRef.current = false;
      isListeningRef.current = false;
      setError(null);
    }
  };

  const handleFork = (checkpointId: string) => {
    setForkCheckpointId(checkpointId);
    setForkSessionName(`Fork-${new Date().toISOString().slice(0, 10)}`);
    setShowForkDialog(true);
  };

  const handleCompositionStart = () => {
    isIMEComposingRef.current = true;
  };

  const handleCompositionEnd = () => {
    setTimeout(() => {
      isIMEComposingRef.current = false;
    }, 0);
  };

  const handleConfirmFork = async () => {
    if (!forkCheckpointId || !forkSessionName.trim() || !effectiveSession) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      const newSessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await api.forkFromCheckpoint(
        forkCheckpointId,
        effectiveSession.id,
        effectiveSession.project_id,
        projectPath,
        newSessionId,
        forkSessionName
      );
      
      // Open the new forked session
      // You would need to implement navigation to the new session
      console.log("Forked to new session:", newSessionId);
      
      setShowForkDialog(false);
      setForkCheckpointId(null);
      setForkSessionName("");
    } catch (err) {
      console.error("Failed to fork checkpoint:", err);
      setError("Failed to fork checkpoint");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle URL detection from terminal output
  const handleLinkDetected = (url: string) => {
    if (!showPreview && !showPreviewPrompt) {
      setPreviewUrl(url);
      setShowPreviewPrompt(true);
    }
  };

  const handleClosePreview = () => {
    setShowPreview(false);
    setIsPreviewMaximized(false);
    // Keep the previewUrl so it can be restored when reopening
  };

  const handlePreviewUrlChange = (url: string) => {
    console.log('[ClaudeCodeSession] Preview URL changed to:', url);
    setPreviewUrl(url);
  };

  const handleTogglePreviewMaximize = () => {
    setIsPreviewMaximized(!isPreviewMaximized);
    // Reset split position when toggling maximize
    if (isPreviewMaximized) {
      setSplitPosition(50);
    }
  };

  // Cleanup event listeners and track mount state
  useEffect(() => {
    isMountedRef.current = true;
    
    return () => {
      console.log('[ClaudeCodeSession] Component unmounting, cleaning up listeners');
      isMountedRef.current = false;
      isListeningRef.current = false;
      
      // Track session completion with engagement metrics
      if (effectiveSession) {
        trackEvent.sessionCompleted();
        
        // Track session engagement
        const sessionDuration = sessionStartTime.current ? Date.now() - sessionStartTime.current : 0;
        const messageCount = messages.filter(m => m.user_message).length;
        const toolsUsed = new Set<string>();
        messages.forEach(msg => {
          if (msg.type === 'assistant' && msg.message?.content) {
            const tools = msg.message.content.filter((c: any) => c.type === 'tool_use');
            tools.forEach((tool: any) => toolsUsed.add(tool.name));
          }
        });
        
        // Calculate engagement score (0-100)
        const engagementScore = Math.min(100, 
          (messageCount * 10) + 
          (toolsUsed.size * 5) + 
          (sessionDuration > 300000 ? 20 : sessionDuration / 15000) // 5+ min session gets 20 points
        );
        
        trackEvent.sessionEngagement({
          session_duration_ms: sessionDuration,
          messages_sent: messageCount,
          tools_used: Array.from(toolsUsed),
          files_modified: 0, // TODO: Track file modifications
          engagement_score: Math.round(engagementScore)
        });
      }
      
      // Clean up listeners
      unlistenRefs.current.forEach(unlisten => unlisten());
      unlistenRefs.current = [];
      
      // Clear checkpoint manager when session ends
      if (effectiveSession) {
        api.clearCheckpointManager(effectiveSession.id).catch(err => {
          console.error("Failed to clear checkpoint manager:", err);
        });
      }
    };
  }, [effectiveSession, projectPath]);

  const messagesList = (
    <div
      ref={parentRef}
      className="flex-1 overflow-y-auto relative pb-20"
      style={{
        contain: 'strict',
        zoom: chatZoom,
      }}
    >
      <div
        className="relative w-full max-w-6xl mx-auto px-4 pt-8 pb-4"
        style={{
          height: `${Math.max(rowVirtualizer.getTotalSize(), 100)}px`,
          minHeight: '100px',
        }}
      >
        <AnimatePresence>
          {rowVirtualizer.getVirtualItems().map((virtualItem) => {
            const entry = displayableEntries[virtualItem.index];
            const message = entry?.message;
            if (!message) return null;
            return (
              <motion.div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={(el) => el && rowVirtualizer.measureElement(el)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="absolute inset-x-4 pb-4"
                style={{
                  top: virtualItem.start,
                }}
              >
                <StreamMessage 
                  message={message} 
                  streamMessages={messages}
                  onLinkDetected={handleLinkDetected}
                  fontScale={chatZoom}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Loading indicator under the latest message */}
      {isLoading && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          className="flex items-center justify-center py-4 mb-20"
        >
          <div className="rotating-symbol text-primary" />
        </motion.div>
      )}

      {/* Error indicator */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive mb-20 w-full max-w-6xl mx-auto"
        >
          {error}
        </motion.div>
      )}
    </div>
  );

  const projectPathInput = null; // Removed project path display

  // If preview is maximized, render only the WebviewPreview in full screen
  if (showPreview && isPreviewMaximized) {
    return (
      <AnimatePresence>
        <motion.div 
          className="fixed inset-0 z-50 bg-background"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <WebviewPreview
            initialUrl={previewUrl}
            onClose={handleClosePreview}
            isMaximized={isPreviewMaximized}
            onToggleMaximize={handleTogglePreviewMaximize}
            onUrlChange={handlePreviewUrlChange}
            className="h-full"
          />
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <TooltipProvider>
      <div className={cn("flex flex-col h-full bg-background", className)}>
        <div className="w-full h-full flex flex-col">

        {/* Main Content Area */}
        <div
          className="flex-1 overflow-hidden transition-all duration-300"
          style={isDesktop && rightOffset ? { marginRight: rightOffset } : undefined}
        >
          {showPreview ? (
            // Split pane layout when preview is active
            <SplitPane
              left={
                <div className="h-full flex flex-col">
                  {projectPathInput}
                  {messagesList}
                </div>
              }
              right={
                <WebviewPreview
                  initialUrl={previewUrl}
                  onClose={handleClosePreview}
                  isMaximized={isPreviewMaximized}
                  onToggleMaximize={handleTogglePreviewMaximize}
                  onUrlChange={handlePreviewUrlChange}
                />
              }
              initialSplit={splitPosition}
              onSplitChange={setSplitPosition}
              minLeftWidth={400}
              minRightWidth={400}
              className="h-full"
            />
          ) : (
            // Original layout when no preview
            <div className="h-full flex flex-col max-w-6xl mx-auto px-6">
              {projectPathInput}
              {messagesList}
              
              {isLoading && messages.length === 0 && (
                <div className="flex items-center justify-center h-full">
                  <div className="flex items-center gap-3">
                    <div className="rotating-symbol text-primary" />
                    <span className="text-sm text-muted-foreground">
                      {session ? "Loading session history..." : "Initializing Claude Code..."}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Floating Prompt Input - Always visible */}
        <ErrorBoundary>
          {/* Queued Prompts Display */}
          <AnimatePresence>
            {queuedPrompts.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="fixed bottom-24 left-1/2 -translate-x-1/2 z-30 w-full max-w-3xl px-4"
              >
                <div className="bg-background/95 backdrop-blur-md border rounded-lg shadow-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      Queued Prompts ({queuedPrompts.length})
                    </div>
                    <TooltipSimple content={queuedPromptsCollapsed ? "Expand queue" : "Collapse queue"} side="top">
                      <motion.div
                        whileTap={{ scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                      >
                        <Button variant="ghost" size="icon" onClick={() => setQueuedPromptsCollapsed(prev => !prev)}>
                          {queuedPromptsCollapsed ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </Button>
                      </motion.div>
                    </TooltipSimple>
                  </div>
                  {!queuedPromptsCollapsed && queuedPrompts.map((queuedPrompt, index) => (
                    <motion.div
                      key={queuedPrompt.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15, delay: index * 0.02 }}
                      className="flex items-start gap-2 bg-muted/50 rounded-md p-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-muted-foreground">#{index + 1}</span>
                          <span className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                            {queuedPrompt.model === "opus" ? "Opus" : "Sonnet"}
                          </span>
                        </div>
                        <p className="text-sm line-clamp-2 break-words">{queuedPrompt.prompt}</p>
                      </div>
                      <motion.div
                        whileTap={{ scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 flex-shrink-0"
                          onClick={() => setQueuedPrompts(prev => prev.filter(p => p.id !== queuedPrompt.id))}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </motion.div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Navigation Arrows - positioned above prompt bar with spacing */}
          {displayableEntries.length > 5 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ delay: 0.5 }}
              className="fixed bottom-32 right-6 z-50"
            >
              <div className="flex items-center bg-background/95 backdrop-blur-md border rounded-full shadow-lg overflow-hidden">
                <TooltipSimple content="Scroll to top" side="top">
                  <motion.div
                    whileTap={{ scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                      // Use virtualizer to scroll to the first item
                      if (displayableEntries.length > 0) {
                        // Scroll to top of the container
                        parentRef.current?.scrollTo({
                          top: 0,
                          behavior: 'smooth'
                        });
                        
                        // After smooth scroll completes, trigger a small scroll to ensure rendering
                        setTimeout(() => {
                          if (parentRef.current) {
                            // Scroll down 1px then back to 0 to trigger virtualizer update
                            parentRef.current.scrollTop = 1;
                            requestAnimationFrame(() => {
                              if (parentRef.current) {
                                parentRef.current.scrollTop = 0;
                              }
                            });
                          }
                        }, 500); // Wait for smooth scroll to complete
                      }
                    }}
                      className="px-3 py-2 hover:bg-accent rounded-none"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                  </motion.div>
                </TooltipSimple>
                <div className="w-px h-4 bg-border" />
                <TooltipSimple content="Scroll to bottom" side="top">
                  <motion.div
                    whileTap={{ scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        // Use the improved scrolling method for manual scroll to bottom
                        if (displayableEntries.length > 0) {
                          const scrollElement = parentRef.current;
                          if (scrollElement) {
                            // First, scroll using virtualizer to get close to the bottom
                            rowVirtualizer.scrollToIndex(displayableEntries.length - 1, { align: 'end', behavior: 'auto' });

                            // Then use direct scroll to ensure we reach the absolute bottom
                            requestAnimationFrame(() => {
                              scrollElement.scrollTo({
                                top: scrollElement.scrollHeight,
                                behavior: 'smooth'
                              });
                            });
                          }
                        }
                      }}
                      className="px-3 py-2 hover:bg-accent rounded-none"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </motion.div>
                </TooltipSimple>
              </div>
            </motion.div>
          )}

          <div
            className="fixed bottom-0 left-0 right-0 transition-all duration-300 z-50"
            style={isDesktop && rightOffset ? { right: rightOffset } : undefined}
          >
            <FloatingPromptInput
              ref={floatingPromptRef}
              onSend={handleSendPrompt}
              onCancel={handleCancelExecution}
              isLoading={isLoading}
              disabled={!projectPath}
              projectPath={projectPath}
              extraMenuItems={
                <>
                  {effectiveSession && (
                    <TooltipSimple content="Session Timeline" side="top">
                      <motion.div
                        whileTap={{ scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (!isDesktop && !showTimeline) {
                              setShowOutline(false);
                            }
                            setShowTimeline(!showTimeline);
                          }}
                          className="h-9 w-9 text-muted-foreground hover:text-foreground"
                        >
                          <GitBranch className={cn("h-3.5 w-3.5", showTimeline && "text-primary")} />
                        </Button>
                      </motion.div>
                    </TooltipSimple>
                  )}
                  <>
                    <TooltipSimple content="Adjust chat zoom" side="top">
                      <motion.div
                        whileTap={{ scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-muted-foreground hover:text-foreground"
                          onClick={() => setIsZoomPopoverOpen(true)}
                        >
                          <span className="text-xs font-semibold">A</span>
                        </Button>
                      </motion.div>
                    </TooltipSimple>

                    <Dialog open={isZoomPopoverOpen} onOpenChange={setIsZoomPopoverOpen}>
                      <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle>调整字体大小</DialogTitle>
                          <DialogDescription>
                            调整聊天界面的字体大小，范围从 75% 到 150%
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-6 py-4">
                          <div className="flex items-center justify-between gap-4">
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-20"
                              onClick={decreaseZoom}
                              disabled={!canDecreaseZoom}
                            >
                              A-
                            </Button>
                            <div className="text-center">
                              <span className="text-2xl font-bold">{zoomPercent}%</span>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-20"
                              onClick={increaseZoom}
                              disabled={!canIncreaseZoom}
                            >
                              A+
                            </Button>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="zoom-slider">滑动调节</Label>
                            <input
                              id="zoom-slider"
                              type="range"
                              min={CHAT_ZOOM_MIN}
                              max={CHAT_ZOOM_MAX}
                              step={CHAT_ZOOM_STEP}
                              value={chatZoom}
                              onChange={handleZoomSliderChange}
                              className="w-full accent-primary"
                            />
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>75%</span>
                              <span>100%</span>
                              <span>150%</span>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>预览</Label>
                            <div
                              className="p-4 border rounded-lg bg-muted/50"
                              style={{ fontSize: `${chatZoom}rem` }}
                            >
                              <p className="text-sm">这是预览文本</p>
                              <p className="text-xs text-muted-foreground">调整后的字体效果</p>
                            </div>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            variant="outline"
                            onClick={() => {
                              resetZoom();
                            }}
                            disabled={isZoomDefault}
                          >
                            重置为默认
                          </Button>
                          <Button
                            onClick={() => setIsZoomPopoverOpen(false)}
                          >
                            确定
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </>
                  <TooltipSimple content={showOutline ? "Hide outline" : outlineItems.length === 0 ? "No outline available" : "Show outline"} side="top">
                    <motion.div
                      whileTap={{ scale: 0.97 }}
                      transition={{ duration: 0.15 }}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (outlineItems.length === 0) return;
                          if (!isDesktop && !showOutline) {
                            setShowTimeline(false);
                          }
                          setShowOutline(!showOutline);
                        }}
                        className={cn(
                          "h-9 w-9 text-muted-foreground hover:text-foreground",
                          showOutline && "text-primary"
                        )}
                        disabled={outlineItems.length === 0}
                      >
                        <ListTree className="h-3.5 w-3.5" />
                      </Button>
                    </motion.div>
                  </TooltipSimple>
                  <TooltipSimple content={hideToolMessages ? "Show tool calls" : "Hide tool calls"} side="top">
                    <motion.div
                      whileTap={{ scale: 0.97 }}
                      transition={{ duration: 0.15 }}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setHideToolMessages((prev) => !prev)}
                        className={cn(
                          "h-9 w-9 text-muted-foreground hover:text-foreground",
                          hideToolMessages && "text-primary"
                        )}
                      >
                        {hideToolMessages ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      </Button>
                    </motion.div>
                  </TooltipSimple>
                  {messages.length > 0 && (
                    <Popover
                      trigger={
                        <TooltipSimple content="Copy conversation" side="top">
                          <motion.div
                            whileTap={{ scale: 0.97 }}
                            transition={{ duration: 0.15 }}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 text-muted-foreground hover:text-foreground"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </motion.div>
                        </TooltipSimple>
                      }
                      content={
                        <div className="w-44 p-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCopyAsMarkdown}
                            className="w-full justify-start text-xs"
                          >
                            Copy as Markdown
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCopyAsJsonl}
                            className="w-full justify-start text-xs"
                          >
                            Copy as JSONL
                          </Button>
                        </div>
                      }
                      open={copyPopoverOpen}
                      onOpenChange={setCopyPopoverOpen}
                      side="top"
                      align="end"
                    />
                  )}
                  <TooltipSimple content="Checkpoint Settings" side="top">
                    <motion.div
                      whileTap={{ scale: 0.97 }}
                      transition={{ duration: 0.15 }}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowSettings(!showSettings)}
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      >
                        <Wrench className={cn("h-3.5 w-3.5", showSettings && "text-primary")} />
                      </Button>
                    </motion.div>
                  </TooltipSimple>
                </>
              }
            />
          </div>

          {/* Token Counter - positioned under the Send button */}
          {totalTokens > 0 && (
            <div className="fixed bottom-0 left-0 right-0 z-30 pointer-events-none">
              <div className="max-w-6xl mx-auto">
                <div className="flex justify-end px-4 pb-2">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="bg-background/95 backdrop-blur-md border rounded-full px-3 py-1 shadow-lg pointer-events-auto"
                  >
                    <div className="flex items-center gap-1.5 text-xs">
                      <Hash className="h-3 w-3 text-muted-foreground" />
                      <span className="font-mono">{totalTokens.toLocaleString()}</span>
                      <span className="text-muted-foreground">tokens</span>
                    </div>
                  </motion.div>
                </div>
              </div>
            </div>
          )}
        </ErrorBoundary>

        <AnimatePresence>
          {showOutline && (
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed top-0 h-full w-full sm:w-80 bg-background border-l border-border shadow-xl z-30 overflow-hidden"
              style={{ right: isDesktop && showTimeline ? TIMELINE_PANEL_WIDTH : 0 }}
            >
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <h3 className="text-lg font-semibold">Outline</h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowOutline(false)}
                    className="h-8 w-8"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-1">
                  {outlineItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No outline items yet. Generate headings in your conversation to populate this view.</p>
                  ) : (
                    <div className="space-y-1">
                      {outlineItems.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => handleOutlineNavigate(item.displayIndex)}
                          className="w-full text-left px-2 py-1 rounded-md hover:bg-accent text-sm transition-colors"
                          style={{ paddingLeft: `${Math.min(item.level - 1, 5) * 12 + 8}px` }}
                        >
                          <span className="block truncate text-foreground">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Timeline */}
        <AnimatePresence>
          {showTimeline && effectiveSession && (
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed right-0 top-0 h-full w-full sm:w-96 bg-background border-l border-border shadow-xl z-40 overflow-hidden"
            >
              <div className="h-full flex flex-col">
                {/* Timeline Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <h3 className="text-lg font-semibold">Session Timeline</h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowTimeline(false)}
                    className="h-8 w-8"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                
                {/* Timeline Content */}
                <div className="flex-1 overflow-y-auto p-4">
                  <TimelineNavigator
                    sessionId={effectiveSession.id}
                    projectId={effectiveSession.project_id}
                    projectPath={projectPath}
                    currentMessageIndex={messages.length - 1}
                    onCheckpointSelect={handleCheckpointSelect}
                    onFork={handleFork}
                    onCheckpointCreated={handleCheckpointCreated}
                    refreshVersion={timelineVersion}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Fork Dialog */}
      <Dialog open={showForkDialog} onOpenChange={setShowForkDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fork Session</DialogTitle>
            <DialogDescription>
              Create a new session branch from the selected checkpoint.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="fork-name">New Session Name</Label>
              <Input
                id="fork-name"
                placeholder="e.g., Alternative approach"
                value={forkSessionName}
                onChange={(e) => setForkSessionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isLoading) {
                    if (e.nativeEvent.isComposing || isIMEComposingRef.current) {
                      return;
                    }
                    handleConfirmFork();
                  }
                }}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowForkDialog(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmFork}
              disabled={isLoading || !forkSessionName.trim()}
            >
              Create Fork
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      {showSettings && effectiveSession && (
        <Dialog open={showSettings} onOpenChange={setShowSettings}>
          <DialogContent className="max-w-2xl">
            <CheckpointSettings
              sessionId={effectiveSession.id}
              projectId={effectiveSession.project_id}
              projectPath={projectPath}
              onClose={() => setShowSettings(false)}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Slash Commands Settings Dialog */}
      {showSlashCommandsSettings && (
        <Dialog open={showSlashCommandsSettings} onOpenChange={setShowSlashCommandsSettings}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>Slash Commands</DialogTitle>
              <DialogDescription>
                Manage project-specific slash commands for {projectPath}
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto">
              <SlashCommandsManager projectPath={projectPath} />
            </div>
          </DialogContent>
        </Dialog>
      )}
      </div>
    </TooltipProvider>
  );
};
