import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import getI18nInstance, { type AppLanguage, supportedLanguages } from "@/lib/i18n";
import { api } from "@/lib/api";

const LANGUAGE_SETTING_KEY = "language_preference";

interface LanguageContextValue {
  language: AppLanguage;
  setLanguage: (language: AppLanguage, options?: { persist?: boolean }) => Promise<void>;
  languages: typeof supportedLanguages;
  isLoading: boolean;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>("en");
  const [isLoading, setIsLoading] = useState(true);
  const [i18n] = useState(() => getI18nInstance("en"));

  const changeLanguage = useCallback(
    async (next: AppLanguage, options: { persist?: boolean } = { persist: true }) => {
      if (next === language && options.persist !== true) {
        return;
      }
      try {
        await i18n.changeLanguage(next);
        setLanguageState(next);
        if (options.persist !== false) {
          await api.saveSetting(LANGUAGE_SETTING_KEY, next);
        }
      } catch (error) {
        console.error("Failed to change language:", error);
        throw error;
      }
    },
    [i18n, language]
  );

  useEffect(() => {
    let cancelled = false;
    const loadLanguagePreference = async () => {
      try {
        const saved = await api.getSetting(LANGUAGE_SETTING_KEY);
        const candidate = (saved as AppLanguage | null) ?? inferSystemLanguage();
        await changeLanguage(candidate, { persist: false });
      } catch (error) {
        console.error("Failed to load language preference:", error);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadLanguagePreference();
    return () => {
      cancelled = true;
    };
  }, [changeLanguage]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage: changeLanguage,
      languages: supportedLanguages,
      isLoading,
    }),
    [language, changeLanguage, isLoading]
  );

  return (
    <LanguageContext.Provider value={value}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </LanguageContext.Provider>
  );
}

function inferSystemLanguage(): AppLanguage {
  if (typeof navigator === "undefined") {
    return "en";
  }
  const [primary] = navigator.language.split("-");
  return primary === "zh" ? "zh" : "en";
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
