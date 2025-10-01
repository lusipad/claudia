import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  RotateCcw,
  MessageSquare,
  FileCode,
  Search,
  Clock,
  AlertTriangle,
  X,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { api, type Checkpoint, type RestoreMode } from "@/lib/api";

interface RewindPanelProps {
  /** 是否显示面板 */
  open: boolean;
  /** 关闭面板的回调 */
  onClose: () => void;
  /** 当前会话 ID */
  sessionId: string;
  /** 项目 ID */
  projectId: string;
  /** 项目路径 */
  projectPath: string;
  /** 当前消息索引 */
  currentMessageIndex: number;
}

/**
 * Rewind 快速访问面板
 *
 * 对齐官方 Claude Code Rewind 功能：
 * - 双击 Esc 触发
 * - 快速访问最近检查点
 * - 键盘导航支持
 * - 轻量级浮层设计
 */
export const RewindPanel: React.FC<RewindPanelProps> = ({
  open,
  onClose,
  sessionId,
  projectId,
  projectPath,
  currentMessageIndex,
}) => {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [filteredCheckpoints, setFilteredCheckpoints] = useState<Checkpoint[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [restoreMode, setRestoreMode] = useState<RestoreMode>("both");
  const [isLoading, setIsLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 加载检查点
  useEffect(() => {
    if (open) {
      loadCheckpoints();
      setSearchQuery("");
      setSelectedIndex(0);
      // 聚焦搜索框
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [open, sessionId, projectId, projectPath]);

  // 过滤检查点
  useEffect(() => {
    if (!searchQuery) {
      // 只显示最近 15 个
      setFilteredCheckpoints(checkpoints.slice(0, 15));
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = checkpoints.filter((cp) => {
        const description = cp.description?.toLowerCase() || "";
        const prompt = cp.metadata.userPrompt.toLowerCase();
        const id = cp.id.toLowerCase();
        return description.includes(query) || prompt.includes(query) || id.includes(query);
      }).slice(0, 15);
      setFilteredCheckpoints(filtered);
    }
    setSelectedIndex(0);
  }, [searchQuery, checkpoints]);

  const loadCheckpoints = async () => {
    try {
      setIsLoading(true);
      const cps = await api.listCheckpoints(sessionId, projectId, projectPath);
      // 按时间倒序排列
      const sorted = [...cps].sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      setCheckpoints(sorted);
    } catch (error) {
      console.error("Failed to load checkpoints:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async (checkpoint: Checkpoint) => {
    try {
      setIsLoading(true);

      // 创建备份
      await api.createCheckpoint(
        sessionId,
        projectId,
        projectPath,
        currentMessageIndex,
        `备份（Rewind前）- ${new Date().toLocaleString()}`
      );

      // 恢复
      await api.restoreCheckpointWithMode(
        checkpoint.id,
        sessionId,
        projectId,
        projectPath,
        restoreMode
      );

      onClose();
      // 刷新页面或通知父组件
      window.location.reload();
    } catch (error) {
      console.error("Failed to restore checkpoint:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // 键盘导航
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          Math.min(prev + 1, filteredCheckpoints.length - 1)
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && filteredCheckpoints[selectedIndex]) {
        e.preventDefault();
        handleRestore(filteredCheckpoints[selectedIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, selectedIndex, filteredCheckpoints, onClose]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
        {/* 背景遮罩 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* 面板 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -20 }}
          transition={{ duration: 0.15 }}
          className="relative w-full max-w-2xl mx-4"
        >
          <div className="bg-background border rounded-lg shadow-2xl overflow-hidden">
            {/* 头部 */}
            <div className="border-b p-4 bg-muted/30">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  <h2 className="text-lg font-semibold">Rewind</h2>
                  <Badge variant="outline" className="text-xs">
                    Esc×2
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* 搜索框 */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  type="text"
                  placeholder="搜索检查点..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* 恢复模式快速选择 */}
              <div className="flex items-center gap-2 mt-3">
                <span className="text-xs text-muted-foreground">模式:</span>
                <div className="flex gap-1">
                  <Button
                    variant={restoreMode === "both" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setRestoreMode("both")}
                    className="h-7 text-xs"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    完整
                  </Button>
                  <Button
                    variant={restoreMode === "conversation_only" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setRestoreMode("conversation_only")}
                    className="h-7 text-xs"
                  >
                    <MessageSquare className="h-3 w-3 mr-1" />
                    对话
                  </Button>
                  <Button
                    variant={restoreMode === "code_only" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setRestoreMode("code_only")}
                    className="h-7 text-xs"
                  >
                    <FileCode className="h-3 w-3 mr-1" />
                    代码
                  </Button>
                </div>
              </div>
            </div>

            {/* 检查点列表 */}
            <div className="max-h-[60vh] overflow-y-auto">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground">
                  加载中...
                </div>
              ) : filteredCheckpoints.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  {searchQuery ? "未找到匹配的检查点" : "暂无检查点"}
                </div>
              ) : (
                <div className="divide-y">
                  {filteredCheckpoints.map((checkpoint, index) => (
                    <motion.div
                      key={checkpoint.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.02 }}
                      className={cn(
                        "p-4 cursor-pointer transition-colors",
                        selectedIndex === index
                          ? "bg-primary/10 border-l-2 border-primary"
                          : "hover:bg-muted/50"
                      )}
                      onClick={() => handleRestore(checkpoint)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-mono text-muted-foreground">
                              {checkpoint.id.slice(0, 8)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(checkpoint.timestamp), {
                                addSuffix: true,
                                locale: zhCN,
                              })}
                            </span>
                            {checkpoint.metadata.hasBashOperations && (
                              <Badge variant="outline" className="text-xs h-5">
                                <AlertTriangle className="h-3 w-3 mr-1 text-orange-600" />
                                Bash
                              </Badge>
                            )}
                          </div>

                          {checkpoint.description && (
                            <p className="text-sm font-medium mb-1">
                              {checkpoint.description}
                            </p>
                          )}

                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {checkpoint.metadata.userPrompt}
                          </p>

                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <span>{checkpoint.metadata.totalTokens.toLocaleString()} tokens</span>
                            <span>{checkpoint.metadata.fileChanges} files</span>
                          </div>
                        </div>

                        {selectedIndex === index && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <ArrowUp className="h-3 w-3" />
                            <ArrowDown className="h-3 w-3" />
                            <span className="ml-1">Enter</span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* 底部提示 */}
            <div className="border-t p-3 bg-muted/30">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-4">
                  <span>↑↓ 导航</span>
                  <span>Enter 恢复</span>
                  <span>Esc 关闭</span>
                </div>
                <span>{filteredCheckpoints.length} / {checkpoints.length} 检查点</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};