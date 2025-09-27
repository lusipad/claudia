import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Settings, Bot, BarChart3, FileText, Network, Info, MoreVertical } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { TooltipProvider, TooltipSimple } from '@/components/ui/tooltip-modern';

interface CustomTitlebarProps {
  onSettingsClick?: () => void;
  onAgentsClick?: () => void;
  onUsageClick?: () => void;
  onClaudeClick?: () => void;
  onMCPClick?: () => void;
  onInfoClick?: () => void;
  controlsPosition?: "left" | "right";
}

export const CustomTitlebar: React.FC<CustomTitlebarProps> = ({
  onSettingsClick,
  onAgentsClick,
  onUsageClick,
  onClaudeClick,
  onMCPClick,
  onInfoClick,
  controlsPosition = "left",
}) => {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMinimize = async () => {
    try {
      const window = getCurrentWindow();
      await window.minimize();
      console.log('Window minimized successfully');
    } catch (error) {
      console.error('Failed to minimize window:', error);
    }
  };

  const handleMaximize = async () => {
    try {
      const window = getCurrentWindow();
      const isMaximized = await window.isMaximized();
      if (isMaximized) {
        await window.unmaximize();
        console.log('Window unmaximized successfully');
      } else {
        await window.maximize();
        console.log('Window maximized successfully');
      }
    } catch (error) {
      console.error('Failed to maximize/unmaximize window:', error);
    }
  };

  const handleClose = async () => {
    try {
      const window = getCurrentWindow();
      await window.close();
      console.log('Window closed successfully');
    } catch (error) {
      console.error('Failed to close window:', error);
    }
  };

  const renderMacStyleControls = (containerClassName = '') => {
    const renderGlyph = (type: 'minimize' | 'maximize' | 'close') => {
      const baseClass = 'opacity-60 group-hover:opacity-100 transition-opacity';
      switch (type) {
        case 'minimize':
          return (
            <svg
              width="8"
              height="8"
              viewBox="0 0 8 8"
              className={`${baseClass} text-yellow-900`}
              fill="none"
            >
              <line x1="1" y1="4" x2="7" y2="4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          );
        case 'maximize':
          return (
            <svg
              width="8"
              height="8"
              viewBox="0 0 8 8"
              className={`${baseClass} text-green-900`}
              fill="none"
            >
              <rect x="1.5" y="1.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.1" />
            </svg>
          );
        case 'close':
        default:
          return (
            <svg
              width="8"
              height="8"
              viewBox="0 0 8 8"
              className={`${baseClass} text-red-900`}
              fill="none"
            >
              <line x1="2" y1="2" x2="6" y2="6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <line x1="6" y1="2" x2="2" y2="6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          );
      }
    };

    return (
      <div className={`flex items-center space-x-2 ${containerClassName}`.trim()}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleMinimize();
          }}
          className="group relative flex h-3 w-3 items-center justify-center rounded-full bg-yellow-500 transition-all duration-200 hover:bg-yellow-600 tauri-no-drag"
          title={t('titlebar.minimize')}
        >
          {isHovered && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
              {renderGlyph('minimize')}
            </span>
          )}
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            handleMaximize();
          }}
          className="group relative flex h-3 w-3 items-center justify-center rounded-full bg-green-500 transition-all duration-200 hover:bg-green-600 tauri-no-drag"
          title={t('titlebar.maximize')}
        >
          {isHovered && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
              {renderGlyph('maximize')}
            </span>
          )}
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            handleClose();
          }}
          className="group relative flex h-3 w-3 items-center justify-center rounded-full bg-red-500 transition-all duration-200 hover:bg-red-600 tauri-no-drag"
          title={t('titlebar.close')}
        >
          {isHovered && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
              {renderGlyph('close')}
            </span>
          )}
        </button>
      </div>
    );
  };

  const macWindowControls = renderMacStyleControls();

  const windowsWindowControls = renderMacStyleControls('tauri-no-drag');

  return (
    <TooltipProvider>
      <div
        className="relative z-[200] h-11 bg-background/95 backdrop-blur-sm flex items-center select-none border-b border-border/50 tauri-drag w-full"
        data-tauri-drag-region
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {controlsPosition === "left" ? (
          <div className="flex items-center space-x-2 pl-5 pr-4">
            {macWindowControls}
          </div>
        ) : (
          <div className="pl-5" />
        )}

        <div className="ml-auto flex items-center pr-5 gap-3 tauri-no-drag">
        {/* Primary actions group */}
        <div className="flex items-center gap-1">
          {onAgentsClick && (
            <TooltipSimple content={t("titlebar.agents")} side="bottom">
              <motion.button
                onClick={onAgentsClick}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.15 }}
                className="p-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors tauri-no-drag"
              >
                <Bot size={16} />
              </motion.button>
            </TooltipSimple>
          )}
          
          {onUsageClick && (
            <TooltipSimple content={t("titlebar.usageDashboard")} side="bottom">
              <motion.button
                onClick={onUsageClick}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.15 }}
                className="p-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors tauri-no-drag"
              >
                <BarChart3 size={16} />
              </motion.button>
            </TooltipSimple>
          )}
        </div>

        {/* Visual separator */}
        <div className="w-px h-5 bg-border/50" />

        {/* Secondary actions group */}
        <div className="flex items-center gap-1">
          {onSettingsClick && (
            <TooltipSimple content={t("titlebar.settings")} side="bottom">
              <motion.button
                onClick={onSettingsClick}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.15 }}
                className="p-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors tauri-no-drag"
              >
                <Settings size={16} />
              </motion.button>
            </TooltipSimple>
          )}

          {/* Dropdown menu for additional options */}
          <div className="relative" ref={dropdownRef}>
            <TooltipSimple content={t("titlebar.moreOptions")} side="bottom">
              <motion.button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.15 }}
                className="p-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-1"
              >
                <MoreVertical size={16} />
              </motion.button>
            </TooltipSimple>

            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-popover border border-border rounded-lg shadow-lg z-[250]">
                <div className="py-1">
                  {onClaudeClick && (
                    <button
                      onClick={() => {
                        onClaudeClick();
                        setIsDropdownOpen(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-3"
                    >
                      <FileText size={14} />
                      <span>{t("titlebar.claudeMd")}</span>
                    </button>
                  )}
                  
                  {onMCPClick && (
                    <button
                      onClick={() => {
                        onMCPClick();
                        setIsDropdownOpen(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-3"
                    >
                      <Network size={14} />
                      <span>{t("titlebar.mcpServers")}</span>
                    </button>
                  )}
                  
                  {onInfoClick && (
                    <button
                      onClick={() => {
                        onInfoClick();
                        setIsDropdownOpen(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-3"
                    >
                      <Info size={14} />
                      <span>{t("titlebar.about")}</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

          {controlsPosition === "right" && (
            <div className="flex items-center ml-3">{windowsWindowControls}</div>
          )}
      </div>
    </div>
    </TooltipProvider>
  );
};
