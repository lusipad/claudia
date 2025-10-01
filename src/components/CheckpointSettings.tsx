import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  Wrench,
  Save,
  Trash2,
  HardDrive,
  AlertCircle,
  Loader2,
  Settings,
  Database
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SelectComponent, type SelectOption } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, type CheckpointStrategy } from "@/lib/api";
import { cn } from "@/lib/utils";

interface CheckpointSettingsProps {
  sessionId: string;
  projectId: string;
  projectPath: string;
  onClose?: () => void;
  className?: string;
}

/**
 * CheckpointSettings component for managing checkpoint configuration
 * 
 * @example
 * <CheckpointSettings 
 *   sessionId={session.id}
 *   projectId={session.project_id}
 *   projectPath={projectPath}
 * />
 */
export const CheckpointSettings: React.FC<CheckpointSettingsProps> = ({
  sessionId,
  projectId,
  projectPath,
  className,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("general");
  const [autoCheckpointEnabled, setAutoCheckpointEnabled] = useState(true);
  const [checkpointStrategy, setCheckpointStrategy] = useState<CheckpointStrategy>("smart");
  const [totalCheckpoints, setTotalCheckpoints] = useState(0);
  const [keepCount, setKeepCount] = useState(10);
  const [retentionDays, setRetentionDays] = useState(30);
  const [autoCleanupEnabled, setAutoCleanupEnabled] = useState(true);
  const [storageStats, setStorageStats] = useState<{
    totalCheckpoints: number;
    totalSizeBytes: number;
    contentPoolSizeBytes: number;
    oldestCheckpoint: string | null;
    newestCheckpoint: string | null;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCleaningExpired, setIsCleaningExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const strategyOptions: SelectOption[] = [
    { value: "manual", label: t("checkpoint.strategyOptions.manual") },
    { value: "per_prompt", label: t("checkpoint.strategyOptions.perPrompt") },
    { value: "per_tool_use", label: t("checkpoint.strategyOptions.perToolUse") },
    { value: "smart", label: t("checkpoint.strategyOptions.smart") },
  ];

  useEffect(() => {
    loadSettings();
  }, [sessionId, projectId, projectPath]);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const settings = await api.getCheckpointSettings(sessionId, projectId, projectPath);
      setAutoCheckpointEnabled(settings.auto_checkpoint_enabled);
      setCheckpointStrategy(settings.checkpoint_strategy);
      setTotalCheckpoints(settings.total_checkpoints);

      // Load storage stats
      const stats = await api.getCheckpointStorageStats(sessionId, projectId, projectPath);
      setStorageStats(stats);
    } catch (err) {
      console.error("Failed to load checkpoint settings:", err);
      setError(t("checkpoint.loadFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to format bytes to human-readable format
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const handleSaveSettings = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccessMessage(null);
      
      await api.updateCheckpointSettings(
        sessionId,
        projectId,
        projectPath,
        autoCheckpointEnabled,
        checkpointStrategy
      );
      
      setSuccessMessage(t("checkpoint.saveSuccess"));
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error("Failed to save checkpoint settings:", err);
      setError(t("checkpoint.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCleanup = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setSuccessMessage(null);

      const removed = await api.cleanupOldCheckpoints(
        sessionId,
        projectId,
        projectPath,
        keepCount
      );

      setSuccessMessage(`Removed ${removed} old checkpoints`);
      setTimeout(() => setSuccessMessage(null), 3000);

      // Reload settings to get updated count
      await loadSettings();
    } catch (err) {
      console.error("Failed to cleanup checkpoints:", err);
      setError(t("checkpoint.cleanupFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCleanupExpired = async () => {
    try {
      setIsCleaningExpired(true);
      setError(null);
      setSuccessMessage(null);

      const removed = await api.cleanupExpiredCheckpoints(
        sessionId,
        projectId,
        projectPath
      );

      if (removed > 0) {
        setSuccessMessage(`Removed ${removed} expired checkpoints`);
      } else {
        setSuccessMessage('No expired checkpoints to remove');
      }
      setTimeout(() => setSuccessMessage(null), 3000);

      // Reload settings to get updated count
      await loadSettings();
    } catch (err) {
      console.error("Failed to cleanup expired checkpoints:", err);
      setError(t("checkpoint.cleanupFailed"));
    } finally {
      setIsCleaningExpired(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.15 }}
      className={cn("space-y-4", className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-md bg-primary/10">
            <Wrench className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-heading-4 font-semibold">{t("checkpoint.title")}</h3>
            <p className="text-caption text-muted-foreground mt-0.5">{t("checkpoint.subtitle")}</p>
          </div>
        </div>
      </div>

      {/* Experimental Feature Warning */}
      <div className="rounded-md border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 p-3">
        <div className="flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-500 mt-0.5 flex-shrink-0" />
          <div className="space-y-0.5">
            <p className="text-caption font-medium text-amber-900 dark:text-amber-100">{t("checkpoint.experimentalFeature")}</p>
            <p className="text-caption text-amber-700 dark:text-amber-300">
              {t("checkpoint.experimentalWarning")}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          className="rounded-md border border-destructive/50 bg-destructive/10 p-3"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 text-destructive" />
            <span className="text-caption text-destructive">{error}</span>
          </div>
        </motion.div>
      )}

      {successMessage && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          className="rounded-md border border-green-600/50 bg-green-50 dark:bg-green-950/20 p-3"
        >
          <span className="text-caption text-green-700 dark:text-green-400">{successMessage}</span>
        </motion.div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="general" className="gap-2">
            <Settings className="h-4 w-4" />
            {t("checkpoint.tabs.general")}
          </TabsTrigger>
          <TabsTrigger value="storage" className="gap-2">
            <Database className="h-4 w-4" />
            {t("checkpoint.tabs.storage")}
          </TabsTrigger>
        </TabsList>

        {/* General Settings Tab */}
        <TabsContent value="general" className="mt-4 space-y-4">
          <Card className="p-5 space-y-4">
            {/* Auto-checkpoint toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="auto-checkpoint" className="text-label">{t("checkpoint.autoCheckpoint")}</Label>
                <p className="text-caption text-muted-foreground">
                  {t("checkpoint.autoCheckpointDesc")}
                </p>
              </div>
              <Switch
                id="auto-checkpoint"
                checked={autoCheckpointEnabled}
                onCheckedChange={setAutoCheckpointEnabled}
                disabled={isLoading}
              />
            </div>

            {/* Checkpoint strategy */}
            <div className="space-y-2">
              <Label htmlFor="strategy" className="text-label">{t("checkpoint.strategy")}</Label>
              <SelectComponent
                value={checkpointStrategy}
                onValueChange={(value: string) => setCheckpointStrategy(value as CheckpointStrategy)}
                options={strategyOptions}
                disabled={isLoading || !autoCheckpointEnabled}
              />
              <p className="text-caption text-muted-foreground">
                {checkpointStrategy === "manual" && t("checkpoint.strategyDescriptions.manual")}
                {checkpointStrategy === "per_prompt" && t("checkpoint.strategyDescriptions.perPrompt")}
                {checkpointStrategy === "per_tool_use" && t("checkpoint.strategyDescriptions.perToolUse")}
                {checkpointStrategy === "smart" && t("checkpoint.strategyDescriptions.smart")}
              </p>
            </div>

            {/* Save button */}
            <motion.div
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.15 }}
            >
              <Button
                onClick={handleSaveSettings}
                disabled={isLoading || isSaving}
                className="w-full"
                size="default"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t("checkpoint.saving")}
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    {t("checkpoint.saveSettings")}
                  </>
                )}
              </Button>
            </motion.div>
          </Card>
        </TabsContent>

        {/* Storage & Cleanup Tab */}
        <TabsContent value="storage" className="mt-4 space-y-4">
          {/* Storage Statistics Card */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-label">{t("checkpoint.management")}</Label>
                </div>
                <p className="text-caption text-muted-foreground">
                  {t("checkpoint.totalCheckpoints")} <span className="font-medium text-foreground">{totalCheckpoints}</span>
                </p>
              </div>
            </div>

            {/* Storage Statistics */}
            {storageStats && (
              <div className="grid grid-cols-2 gap-3 p-3 rounded-md bg-muted/50 border border-border">
                <div className="space-y-0.5">
                  <p className="text-caption text-muted-foreground">{t("checkpoint.storageStats.totalSize")}</p>
                  <p className="text-label font-medium">{formatBytes(storageStats.totalSizeBytes)}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-caption text-muted-foreground">{t("checkpoint.storageStats.contentPool")}</p>
                  <p className="text-label font-medium">{formatBytes(storageStats.contentPoolSizeBytes)}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-caption text-muted-foreground">{t("checkpoint.storageStats.oldest")}</p>
                  <p className="text-label font-medium">
                    {storageStats.oldestCheckpoint
                      ? new Date(storageStats.oldestCheckpoint).toLocaleDateString()
                      : 'N/A'}
                  </p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-caption text-muted-foreground">{t("checkpoint.storageStats.newest")}</p>
                  <p className="text-label font-medium">
                    {storageStats.newestCheckpoint
                      ? new Date(storageStats.newestCheckpoint).toLocaleDateString()
                      : 'N/A'}
                  </p>
                </div>
              </div>
            )}
          </Card>

          {/* Cleanup Settings Card */}
          <Card className="p-5 space-y-4">
            {/* Count-based cleanup */}
            <div className="space-y-2">
              <Label htmlFor="keep-count" className="text-label">{t("checkpoint.keepCount")}</Label>
              <div className="flex gap-2">
                <Input
                  id="keep-count"
                  type="number"
                  min="1"
                  max="100"
                  value={keepCount}
                  onChange={(e) => setKeepCount(parseInt(e.target.value) || 10)}
                  disabled={isLoading}
                  className="flex-1 h-9"
                />
                <motion.div
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                >
                  <Button
                    variant="outline"
                    onClick={handleCleanup}
                    disabled={isLoading || totalCheckpoints <= keepCount}
                    size="sm"
                    className="hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    {t("checkpoint.cleanupOld")}
                  </Button>
                </motion.div>
              </div>
              <p className="text-caption text-muted-foreground">
                {t("checkpoint.cleanupOldDesc")} {keepCount}
              </p>
            </div>

            {/* Divider */}
            <div className="border-t border-border" />

            {/* Auto-cleanup toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="auto-cleanup" className="text-label">{t("checkpoint.autoCleanup")}</Label>
                <p className="text-caption text-muted-foreground">
                  {t("checkpoint.autoCleanupDesc")}
                </p>
              </div>
              <Switch
                id="auto-cleanup"
                checked={autoCleanupEnabled}
                onCheckedChange={setAutoCleanupEnabled}
                disabled={isLoading}
              />
            </div>

            {/* Retention period */}
            <div className="space-y-2">
              <Label htmlFor="retention-days" className="text-label">{t("checkpoint.retentionPeriod")}</Label>
              <div className="flex gap-2">
                <Input
                  id="retention-days"
                  type="number"
                  min="1"
                  max="365"
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(parseInt(e.target.value) || 30)}
                  disabled={isLoading || !autoCleanupEnabled}
                  className="flex-1 h-9"
                />
                <motion.div
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                >
                  <Button
                    variant="outline"
                    onClick={handleCleanupExpired}
                    disabled={isCleaningExpired || isLoading}
                    size="sm"
                    className="hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50"
                  >
                    {isCleaningExpired ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        {t("checkpoint.cleaning")}
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        {t("checkpoint.cleanNow")}
                      </>
                    )}
                  </Button>
                </motion.div>
              </div>
              <p className="text-caption text-muted-foreground">
                {t("checkpoint.retentionDesc", { days: retentionDays })}
              </p>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}; 