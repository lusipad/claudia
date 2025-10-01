import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  GitBranch,
  Save,
  RotateCcw,
  GitFork,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Hash,
  FileCode,
  Diff,
  MessageSquare,
  Info,
  AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { api, type Checkpoint, type TimelineNode, type SessionTimeline, type CheckpointDiff, type RestoreMode } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useTrackEvent } from "@/hooks";

interface TimelineNavigatorProps {
  sessionId: string;
  projectId: string;
  projectPath: string;
  currentMessageIndex: number;
  onCheckpointSelect: (checkpoint: Checkpoint) => void;
  onFork: (checkpointId: string) => void;
  /**
   * Incrementing value provided by parent to force timeline reload when checkpoints
   * are created elsewhere (e.g., auto-checkpoint after tool execution).
   */
  refreshVersion?: number;
  /**
   * Callback when a new checkpoint is created
   */
  onCheckpointCreated?: () => void;
  className?: string;
}

/**
 * Visual timeline navigator for checkpoint management
 */
export const TimelineNavigator: React.FC<TimelineNavigatorProps> = ({
  sessionId,
  projectId,
  projectPath,
  currentMessageIndex,
  onCheckpointSelect,
  onFork,
  refreshVersion = 0,
  onCheckpointCreated,
  className
}) => {
  const { t } = useTranslation();
  const [timeline, setTimeline] = useState<SessionTimeline | null>(null);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<Checkpoint | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDiffDialog, setShowDiffDialog] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [checkpointDescription, setCheckpointDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diff, setDiff] = useState<CheckpointDiff | null>(null);
  const [compareCheckpoint, setCompareCheckpoint] = useState<Checkpoint | null>(null);
  const [checkpointToRestore, setCheckpointToRestore] = useState<Checkpoint | null>(null);
  const [restoreMode, setRestoreMode] = useState<RestoreMode>("both");

  // Analytics tracking
  const trackEvent = useTrackEvent();

  // IME composition state
  const isIMEComposingRef = React.useRef(false);

  // Load timeline on mount and whenever refreshVersion bumps
  useEffect(() => {
    loadTimeline();
  }, [sessionId, projectId, projectPath, refreshVersion]);

  const loadTimeline = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const timelineData = await api.getSessionTimeline(sessionId, projectId, projectPath);
      setTimeline(timelineData);
      
      // Auto-expand nodes with current checkpoint
      if (timelineData.currentCheckpointId && timelineData.rootNode) {
        const pathToNode = findPathToCheckpoint(timelineData.rootNode, timelineData.currentCheckpointId);
        setExpandedNodes(new Set(pathToNode));
      }
    } catch (err) {
      console.error("Failed to load timeline:", err);
      setError(t("errors.failedToLoadTimeline"));
    } finally {
      setIsLoading(false);
    }
  };

  const findPathToCheckpoint = (node: TimelineNode, checkpointId: string, path: string[] = []): string[] => {
    if (node.checkpoint.id === checkpointId) {
      return path;
    }
    
    for (const child of node.children) {
      const childPath = findPathToCheckpoint(child, checkpointId, [...path, node.checkpoint.id]);
      if (childPath.length > path.length) {
        return childPath;
      }
    }
    
    return path;
  };

  const handleCreateCheckpoint = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const sessionStartTime = Date.now(); // Using current time as we don't have session start time
      
      await api.createCheckpoint(
        sessionId,
        projectId,
        projectPath,
        currentMessageIndex,
        checkpointDescription || undefined
      );
      
      // Track checkpoint creation
      const checkpointNumber = timeline ? timeline.totalCheckpoints + 1 : 1;
      trackEvent.checkpointCreated({
        checkpoint_number: checkpointNumber,
        session_duration_at_checkpoint: Date.now() - sessionStartTime
      });
      
      // Call parent callback if provided
      if (onCheckpointCreated) {
        onCheckpointCreated();
      }
      
      setCheckpointDescription("");
      setShowCreateDialog(false);
      await loadTimeline();
    } catch (err) {
      console.error("Failed to create checkpoint:", err);
      setError(t("errors.failedToCreateCheckpoint"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestoreCheckpoint = async (checkpoint: Checkpoint) => {
    // Show restore mode selection dialog
    setCheckpointToRestore(checkpoint);
    setRestoreMode("both");
    setShowRestoreDialog(true);
  };

  const confirmRestore = async () => {
    if (!checkpointToRestore) return;

    try {
      setIsLoading(true);
      setError(null);
      setShowRestoreDialog(false);

      const checkpointTime = new Date(checkpointToRestore.timestamp).getTime();
      const timeSinceCheckpoint = Date.now() - checkpointTime;

      // First create a checkpoint of current state (PreRestore type)
      await api.createCheckpoint(
        sessionId,
        projectId,
        projectPath,
        currentMessageIndex,
        `备份（恢复前）- ${new Date().toLocaleString()}`
      );

      // Then restore with selected mode
      await api.restoreCheckpointWithMode(
        checkpointToRestore.id,
        sessionId,
        projectId,
        projectPath,
        restoreMode
      );

      // Track checkpoint restoration
      trackEvent.checkpointRestored({
        checkpoint_id: checkpointToRestore.id,
        time_since_checkpoint_ms: timeSinceCheckpoint
      });

      await loadTimeline();
      onCheckpointSelect(checkpointToRestore);
    } catch (err) {
      console.error("Failed to restore checkpoint:", err);
      setError(t("errors.failedToRestoreCheckpoint"));
    } finally {
      setIsLoading(false);
      setCheckpointToRestore(null);
    }
  };

  const handleFork = async (checkpoint: Checkpoint) => {
    onFork(checkpoint.id);
  };

  const handleCompositionStart = () => {
    isIMEComposingRef.current = true;
  };

  const handleCompositionEnd = () => {
    setTimeout(() => {
      isIMEComposingRef.current = false;
    }, 0);
  };

  const handleCompare = async (checkpoint: Checkpoint) => {
    if (!selectedCheckpoint) {
      setSelectedCheckpoint(checkpoint);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const diffData = await api.getCheckpointDiff(
        selectedCheckpoint.id,
        checkpoint.id,
        sessionId,
        projectId
      );
      
      setDiff(diffData);
      setCompareCheckpoint(checkpoint);
      setShowDiffDialog(true);
    } catch (err) {
      console.error("Failed to get diff:", err);
      setError(t("errors.failedToCompareCheckpoints"));
    } finally {
      setIsLoading(false);
    }
  };

  const toggleNodeExpansion = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  const renderTimelineNode = (node: TimelineNode, depth: number = 0) => {
    const isExpanded = expandedNodes.has(node.checkpoint.id);
    const hasChildren = node.children.length > 0;
    const isCurrent = timeline?.currentCheckpointId === node.checkpoint.id;
    const isSelected = selectedCheckpoint?.id === node.checkpoint.id;

    return (
      <div key={node.checkpoint.id} className="relative">
        {/* Connection line */}
        {depth > 0 && (
          <div 
            className="absolute left-0 top-0 w-6 h-6 border-l-2 border-b-2 border-muted-foreground/30"
            style={{ 
              left: `${(depth - 1) * 24}px`,
              borderBottomLeftRadius: '8px'
            }}
          />
        )}
        
        {/* Node content */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2, delay: depth * 0.05 }}
          className={cn(
            "flex items-start gap-2 py-2",
            depth > 0 && "ml-6"
          )}
          style={{ paddingLeft: `${depth * 24}px` }}
        >
          {/* Expand/collapse button */}
          {hasChildren && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 -ml-1"
              onClick={() => toggleNodeExpansion(node.checkpoint.id)}
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </Button>
          )}
          
          {/* Checkpoint card */}
          <Card 
            className={cn(
              "flex-1 cursor-pointer transition-all hover:shadow-md",
              isCurrent && "border-primary ring-2 ring-primary/20",
              isSelected && "border-blue-500 bg-blue-500/5",
              !hasChildren && "ml-5"
            )}
            onClick={() => setSelectedCheckpoint(node.checkpoint)}
          >
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {isCurrent && (
                      <Badge variant="default" className="text-xs">Current</Badge>
                    )}
                    <span className="text-xs font-mono text-muted-foreground">
                      {node.checkpoint.id.slice(0, 8)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(node.checkpoint.timestamp), { addSuffix: true })}
                    </span>
                  </div>
                  
                  {node.checkpoint.description && (
                    <p className="text-sm font-medium mb-1">{node.checkpoint.description}</p>
                  )}
                  
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {node.checkpoint.metadata.userPrompt || "No prompt"}
                  </p>

                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Hash className="h-3 w-3" />
                      {node.checkpoint.metadata.totalTokens.toLocaleString()} tokens
                    </span>
                    <span className="flex items-center gap-1">
                      <FileCode className="h-3 w-3" />
                      {node.checkpoint.metadata.fileChanges} files
                    </span>
                    {node.checkpoint.metadata.hasBashOperations && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge variant="outline" className="text-xs gap-1 text-orange-600 border-orange-600">
                              <AlertTriangle className="h-3 w-3" />
                              Bash
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            此检查点包含 Bash 操作，副作用可能未完全跟踪
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </div>
                
                {/* Actions */}
                <div className="flex items-center gap-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRestoreCheckpoint(node.checkpoint);
                          }}
                        >
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Restore to this checkpoint</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFork(node.checkpoint);
                          }}
                        >
                          <GitFork className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Fork from this checkpoint</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCompare(node.checkpoint);
                          }}
                        >
                          <Diff className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Compare with another checkpoint</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        
        {/* Children */}
        {isExpanded && hasChildren && (
          <div className="relative">
            {/* Vertical line for children */}
            {node.children.length > 1 && (
              <div 
                className="absolute top-0 bottom-0 w-0.5 bg-muted-foreground/30"
                style={{ left: `${(depth + 1) * 24 - 1}px` }}
              />
            )}
            
            {node.children.map((child) => 
              renderTimelineNode(child, depth + 1)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Experimental Feature Warning */}
      <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
          <div className="text-xs">
            <p className="font-medium text-yellow-600">Experimental Feature</p>
            <p className="text-yellow-600/80">
              Checkpointing may affect directory structure or cause data loss. Use with caution.
            </p>
          </div>
        </div>
      </div>
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-sm font-medium">Timeline</h3>
          {timeline && (
            <Badge variant="outline" className="text-xs">
              {timeline.totalCheckpoints} checkpoints
            </Badge>
          )}
        </div>
        
        <Button
          size="sm"
          variant="default"
          onClick={() => setShowCreateDialog(true)}
          disabled={isLoading}
        >
          <Save className="h-3 w-3 mr-1" />
          Checkpoint
        </Button>
      </div>
      
      {/* Error display */}
      {error && (
        <div className="flex items-center gap-2 text-xs text-destructive">
          <AlertCircle className="h-3 w-3" />
          {error}
        </div>
      )}
      
      {/* Timeline tree */}
      {timeline?.rootNode ? (
        <div className="relative overflow-x-auto">
          {renderTimelineNode(timeline.rootNode)}
        </div>
      ) : (
        <div className="text-center py-8 text-sm text-muted-foreground">
          {isLoading ? "Loading timeline..." : "No checkpoints yet"}
        </div>
      )}
      
      {/* Create checkpoint dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Checkpoint</DialogTitle>
            <DialogDescription>
              Save the current state of your session with an optional description.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                placeholder="e.g., Before major refactoring"
                value={checkpointDescription}
                onChange={(e) => setCheckpointDescription(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isLoading) {
                    if (e.nativeEvent.isComposing || isIMEComposingRef.current) {
                      return;
                    }
                    handleCreateCheckpoint();
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
              onClick={() => setShowCreateDialog(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateCheckpoint}
              disabled={isLoading}
            >
              Create Checkpoint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Diff dialog */}
      <Dialog open={showDiffDialog} onOpenChange={setShowDiffDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Checkpoint Comparison</DialogTitle>
            <DialogDescription>
              Changes between "{selectedCheckpoint?.description || selectedCheckpoint?.id.slice(0, 8)}" 
              and "{compareCheckpoint?.description || compareCheckpoint?.id.slice(0, 8)}"
            </DialogDescription>
          </DialogHeader>
          
          {diff && (
            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-3">
                    <div className="text-xs text-muted-foreground">Modified Files</div>
                    <div className="text-2xl font-bold">{diff.modifiedFiles.length}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <div className="text-xs text-muted-foreground">Added Files</div>
                    <div className="text-2xl font-bold text-green-600">{diff.addedFiles.length}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <div className="text-xs text-muted-foreground">Deleted Files</div>
                    <div className="text-2xl font-bold text-red-600">{diff.deletedFiles.length}</div>
                  </CardContent>
                </Card>
              </div>
              
              {/* Token delta */}
              <div className="flex items-center justify-center">
                <Badge variant={diff.tokenDelta > 0 ? "default" : "secondary"}>
                  {diff.tokenDelta > 0 ? "+" : ""}{diff.tokenDelta.toLocaleString()} tokens
                </Badge>
              </div>
              
              {/* File lists */}
              {diff.modifiedFiles.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Modified Files</h4>
                  <div className="space-y-1">
                    {diff.modifiedFiles.map((file) => (
                      <div key={file.path} className="flex items-center justify-between text-xs">
                        <span className="font-mono">{file.path}</span>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-green-600">+{file.additions}</span>
                          <span className="text-red-600">-{file.deletions}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {diff.addedFiles.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Added Files</h4>
                  <div className="space-y-1">
                    {diff.addedFiles.map((file) => (
                      <div key={file} className="text-xs font-mono text-green-600">
                        + {file}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {diff.deletedFiles.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Deleted Files</h4>
                  <div className="space-y-1">
                    {diff.deletedFiles.map((file) => (
                      <div key={file} className="text-xs font-mono text-red-600">
                        - {file}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDiffDialog(false);
                setDiff(null);
                setCompareCheckpoint(null);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore confirmation dialog with mode selection */}
      <Dialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>恢复检查点</DialogTitle>
            <DialogDescription>
              选择恢复模式以精确控制恢复内容
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Checkpoint info */}
            {checkpointToRestore && (
              <div className="rounded-lg border p-4 bg-muted/50">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-mono text-muted-foreground">
                        {checkpointToRestore.id.slice(0, 8)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(checkpointToRestore.timestamp), { addSuffix: true })}
                      </span>
                    </div>
                    {checkpointToRestore.description && (
                      <p className="text-sm font-medium mb-1">
                        {checkpointToRestore.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {checkpointToRestore.metadata.userPrompt}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span>{checkpointToRestore.metadata.totalTokens.toLocaleString()} tokens</span>
                      <span>{checkpointToRestore.metadata.fileChanges} files</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Restore mode selection */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">恢复模式</Label>
              <RadioGroup value={restoreMode} onValueChange={(value) => setRestoreMode(value as RestoreMode)}>
                <div className="grid gap-3">
                  {/* Both mode */}
                  <label
                    htmlFor="mode-both"
                    className={cn(
                      "flex items-start gap-4 rounded-lg border-2 p-4 cursor-pointer transition-all",
                      restoreMode === "both"
                        ? "border-primary bg-primary/5"
                        : "border-muted hover:border-muted-foreground/50"
                    )}
                  >
                    <RadioGroupItem value="both" id="mode-both" className="mt-1" />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <RotateCcw className="h-4 w-4" />
                        <span className="font-medium">完整恢复</span>
                        <Badge variant="secondary" className="text-xs">默认</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        恢复代码和对话历史到检查点状态
                      </p>
                      <div className="flex items-start gap-2 mt-2 text-xs text-muted-foreground">
                        <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        <span>适用于：完全回退到过去某个时间点</span>
                      </div>
                    </div>
                  </label>

                  {/* Conversation only mode */}
                  <label
                    htmlFor="mode-conversation"
                    className={cn(
                      "flex items-start gap-4 rounded-lg border-2 p-4 cursor-pointer transition-all",
                      restoreMode === "conversation_only"
                        ? "border-primary bg-primary/5"
                        : "border-muted hover:border-muted-foreground/50"
                    )}
                  >
                    <RadioGroupItem value="conversation_only" id="mode-conversation" className="mt-1" />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        <span className="font-medium">仅恢复对话</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        恢复对话历史，保持当前代码状态不变
                      </p>
                      <div className="flex items-start gap-2 mt-2 text-xs text-muted-foreground">
                        <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        <span>适用于：想用不同方式提问，但保留已完成的代码修改</span>
                      </div>
                    </div>
                  </label>

                  {/* Code only mode */}
                  <label
                    htmlFor="mode-code"
                    className={cn(
                      "flex items-start gap-4 rounded-lg border-2 p-4 cursor-pointer transition-all",
                      restoreMode === "code_only"
                        ? "border-primary bg-primary/5"
                        : "border-muted hover:border-muted-foreground/50"
                    )}
                  >
                    <RadioGroupItem value="code_only" id="mode-code" className="mt-1" />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <FileCode className="h-4 w-4" />
                        <span className="font-medium">仅恢复代码</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        恢复文件状态，保持对话历史不变
                      </p>
                      <div className="flex items-start gap-2 mt-2 text-xs text-muted-foreground">
                        <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        <span>适用于：撤销错误的代码改动，但不丢失讨论内容</span>
                      </div>
                    </div>
                  </label>
                </div>
              </RadioGroup>
            </div>

            {/* Bash operations warning */}
            {checkpointToRestore?.metadata.hasBashOperations && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Bash 操作警告</AlertTitle>
                <AlertDescription>
                  此检查点包含 Bash 命令操作，其副作用（如 npm install、git 操作）可能未完全跟踪。
                  恢复后请验证项目状态。
                </AlertDescription>
              </Alert>
            )}

            {/* Safety info */}
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>自动备份</AlertTitle>
              <AlertDescription>
                恢复前会自动创建当前状态的备份检查点，您可以随时回退到此刻。
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowRestoreDialog(false);
                setCheckpointToRestore(null);
              }}
              disabled={isLoading}
            >
              取消
            </Button>
            <Button
              onClick={confirmRestore}
              disabled={isLoading}
            >
              {isLoading ? "恢复中..." : "确认恢复"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
