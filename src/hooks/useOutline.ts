import { useCallback } from "react";
import { useBriefStore } from "../stores/useBriefStore";

/**
 * goToQuestion accepts:
 * - number (17) -> jumps to #q17
 * - string: "q17" or "q17" -> jumps directly
 * - section ids: "section-shared" -> jumps to that section
 */
export const useOutline = () => {
  const brief = useBriefStore((s) => s.brief);
  const goToQuestion = useCallback((q: string | number) => {
    let id = "";
    if (typeof q === "number") id = `q${q}`;
    else if (/^q\d+$/.test(String(q))) id = String(q);
    else if (/^section-/.test(String(q))) id = String(q);
    else if (/^\d+$/.test(String(q))) id = `q${q}`;
    else id = String(q);

    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // add small focus for accessibility
      (el as HTMLElement).focus?.();
      history.replaceState(null, "", `#${id}`);
    } else {
      console.warn("Anchor not found:", id);
    }
  }, []);
  return { brief, goToQuestion };
};
