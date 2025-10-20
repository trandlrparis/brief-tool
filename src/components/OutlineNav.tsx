import React from "react";
import { useOutline } from "../hooks/useOutline";

/**
 * OutlineNav: shows sections and questions.
 * Links jump to #section-{slug} and #q{n}
 */
export const OutlineNav: React.FC = () => {
  const { brief, goToQuestion } = useOutline();

  return (
    <nav aria-label="Outline" className="space-y-3">
      <div className="text-sm font-semibold">Outline</div>
      {brief.sections.map((section) => (
        <div key={section.id} className="mb-2">
          <button
            className="text-xs font-medium text-lr-deep hover:underline"
            onClick={() => goToQuestion(`section-${section.id}`)}
          >
            {section.title}
          </button>
          <ul className="pl-2 mt-1 space-y-1">
            {section.questions.map((q) => (
              <li key={q.id}>
                <button
                  className="text-left text-sm text-gray-700 hover:underline"
                  onClick={() => goToQuestion(`q${q.number}`)}
                >
                  Q{String(q.number).padStart(2, "0")}: {q.text.slice(0, 40)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
};
