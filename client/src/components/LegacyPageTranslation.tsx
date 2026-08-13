import { useEffect } from "react";
import { translateVisibleText } from "@/lib/ui-translation";

const originalText = new WeakMap<Text, string>();
const lastTranslatedText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();
const lastTranslatedAttributes = new WeakMap<Element, Map<string, string>>();
const TRANSLATED_ATTRIBUTES = ["placeholder", "title", "aria-label"] as const;

function translateTree(root: ParentNode, locale: "ar" | "en") {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node as Text;
    const parent = text.parentElement;
    if (parent && !["SCRIPT", "STYLE", "CODE", "PRE"].includes(parent.tagName)) {
      const current = text.nodeValue ?? "";
      const lastTranslated = lastTranslatedText.get(text);
      if (!originalText.has(text) || (lastTranslated !== undefined && current !== lastTranslated)) {
        originalText.set(text, current);
      }
      const source = originalText.get(text) ?? current;
      const next = locale === "ar" ? source : translateVisibleText(source, locale);
      if (text.nodeValue !== next) text.nodeValue = next;
      lastTranslatedText.set(text, next);
    }
    node = walker.nextNode();
  }

  const elements = root instanceof Element ? [root, ...root.querySelectorAll("*")] : [...root.querySelectorAll("*")];
  for (const element of elements) {
    let saved = originalAttributes.get(element);
    for (const attribute of TRANSLATED_ATTRIBUTES) {
      const current = element.getAttribute(attribute);
      if (current === null) continue;
      if (!saved) {
        saved = new Map();
        originalAttributes.set(element, saved);
      }
      const translatedMap = lastTranslatedAttributes.get(element) ?? new Map<string, string>();
      const lastTranslated = translatedMap.get(attribute);
      if (!saved.has(attribute) || (lastTranslated !== undefined && current !== lastTranslated)) saved.set(attribute, current);
      const source = saved.get(attribute) ?? current;
      const next = locale === "ar" ? source : translateVisibleText(source, locale);
      if (current !== next) element.setAttribute(attribute, next);
      translatedMap.set(attribute, next);
      lastTranslatedAttributes.set(element, translatedMap);
    }
  }
}

export default function LegacyPageTranslation({ locale }: { locale: "ar" | "en" }) {
  useEffect(() => {
    let scheduled = false;
    const apply = () => {
      scheduled = false;
      observer.disconnect();
      translateTree(document.body, locale);
      observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...TRANSLATED_ATTRIBUTES] });
    };
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(apply);
    });
    apply();
    return () => observer.disconnect();
  }, [locale]);

  return null;
}
