import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { api } from './api';

// Use the same message interface as AgentExecution for consistency
export interface ClaudeStreamMessage {
  type: "system" | "assistant" | "user" | "result";
  subtype?: string;
  message?: {
    content?: any[];
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
  };
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  [key: string]: any;
}

interface CachedSessionOutput {
  output: string;
  messages: ClaudeStreamMessage[];
  lastUpdated: number;
  status: string;
}

interface OutputCacheContextType {
  getCachedOutput: (sessionId: number) => CachedSessionOutput | null;
  setCachedOutput: (sessionId: number, data: CachedSessionOutput) => void;
  updateSessionStatus: (sessionId: number, status: string) => void;
  clearCache: (sessionId?: number) => void;
  isPolling: boolean;
  startBackgroundPolling: () => void;
  stopBackgroundPolling: () => void;
}

const OutputCacheContext = createContext<OutputCacheContextType | null>(null);

export function useOutputCache() {
  const context = useContext(OutputCacheContext);
  if (!context) {
    throw new Error('useOutputCache must be used within an OutputCacheProvider');
  }
  return context;
}

interface OutputCacheProviderProps {
  children: React.ReactNode;
}

export function OutputCacheProvider({ children }: OutputCacheProviderProps) {
  // Keep cache in a ref to avoid re-rendering the whole app tree on every poll
  const cacheRef = useRef<Map<number, CachedSessionOutput>>(new Map());
  const [isPolling, setIsPolling] = useState(false);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  const getCachedOutput = useCallback((sessionId: number): CachedSessionOutput | null => {
    return cacheRef.current.get(sessionId) || null;
  }, []);

  const setCachedOutput = useCallback((sessionId: number, data: CachedSessionOutput) => {
    const next = new Map(cacheRef.current);
    next.set(sessionId, data);
    cacheRef.current = next;
  }, []);

  const updateSessionStatus = useCallback((sessionId: number, status: string) => {
    const prev = cacheRef.current;
    const existing = prev.get(sessionId);
    if (existing) {
      const updated = new Map(prev);
      updated.set(sessionId, { ...existing, status });
      cacheRef.current = updated;
    }
  }, []);

  const clearCache = useCallback((sessionId?: number) => {
    if (sessionId) {
      const updated = new Map(cacheRef.current);
      updated.delete(sessionId);
      cacheRef.current = updated;
    } else {
      cacheRef.current = new Map();
    }
  }, []);

  const parseOutput = useCallback((rawOutput: string): ClaudeStreamMessage[] => {
    if (!rawOutput) return [];

    const lines = rawOutput.split('\n').filter(line => line.trim());
    const parsedMessages: ClaudeStreamMessage[] = [];

    for (const line of lines) {
      try {
        const message = JSON.parse(line) as ClaudeStreamMessage;
        parsedMessages.push(message);
      } catch (err) {
        console.error("Failed to parse message:", err, line);
        // Add a fallback message for unparseable content
        parsedMessages.push({
          type: 'result',
          subtype: 'error',
          error: 'Failed to parse message',
          raw_content: line
        });
      }
    }

    return parsedMessages;
  }, []);

  const updateSessionCache = useCallback(async (sessionId: number, status: string) => {
    try {
      const rawOutput = await api.getSessionOutput(sessionId);
      const messages = parseOutput(rawOutput);
      
      setCachedOutput(sessionId, {
        output: rawOutput,
        messages,
        lastUpdated: Date.now(),
        status
      });
    } catch (error) {
      console.warn(`Failed to update cache for session ${sessionId}:`, error);
    }
  }, [parseOutput, setCachedOutput]);

  const pollRunningSessions = useCallback(async () => {
    try {
      const runningSessions = await api.listRunningAgentSessions();
      
      // Update cache for all running sessions
      for (const session of runningSessions) {
        if (session.id && session.status === 'running') {
          await updateSessionCache(session.id, session.status);
        }
      }

      // Clean up cache for sessions that are no longer running
      const runningIds = new Set(runningSessions.map(s => s.id).filter(Boolean));
      const prev = cacheRef.current;
      const updated = new Map<number, CachedSessionOutput>();
      for (const [sessionId, data] of prev) {
        if (runningIds.has(sessionId) || data.status !== 'running') {
          updated.set(sessionId, data);
        }
      }
      cacheRef.current = updated;
    } catch (error) {
      console.warn('Failed to poll running sessions:', error);
    }
  }, [updateSessionCache]);

  const startBackgroundPolling = useCallback(() => {
    if (pollingInterval) return;

    setIsPolling(true);
    const interval = setInterval(pollRunningSessions, 3000); // Poll every 3 seconds
    setPollingInterval(interval);
  }, [pollingInterval, pollRunningSessions]);

  const stopBackgroundPolling = useCallback(() => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
    setIsPolling(false);
  }, [pollingInterval]);

  // Auto-start polling when provider mounts
  useEffect(() => {
    startBackgroundPolling();
    return () => stopBackgroundPolling();
  }, [startBackgroundPolling, stopBackgroundPolling]);

  const value: OutputCacheContextType = useMemo(() => ({
    getCachedOutput,
    setCachedOutput,
    updateSessionStatus,
    clearCache,
    isPolling,
    startBackgroundPolling,
    stopBackgroundPolling,
  }), [getCachedOutput, setCachedOutput, updateSessionStatus, clearCache, isPolling, startBackgroundPolling, stopBackgroundPolling]);

  return (
    <OutputCacheContext.Provider value={value}>
      {children}
    </OutputCacheContext.Provider>
  );
}
