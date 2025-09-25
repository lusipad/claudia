import i18next, { type i18n } from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en";
import zh from "@/locales/zh";

export const defaultNamespace = "translation" as const;

export const resources = {
  en: { [defaultNamespace]: en },
  zh: { [defaultNamespace]: zh },
};

type Resources = typeof resources;
export type AppLanguage = keyof Resources;

let instance: i18n | null = null;

export const supportedLanguages: Array<{ value: AppLanguage; label: string }> = [
  { value: "en", label: "English" },
  { value: "zh", label: "中文" },
];

export function getI18nInstance(initialLanguage: AppLanguage = "en") {
  if (instance) {
    return instance;
  }

  instance = i18next.createInstance();
  instance
    .use(initReactI18next)
    .init({
      resources,
      lng: initialLanguage,
      fallbackLng: "en",
      ns: [defaultNamespace],
      defaultNS: defaultNamespace,
      interpolation: { escapeValue: false },
      returnNull: false,
      returnEmptyString: false,
    })
    .catch((error) => {
      console.error("Failed to initialize i18n:", error);
    });

  return instance;
}

export default getI18nInstance;
