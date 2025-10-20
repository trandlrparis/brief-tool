import React from "react";
import { Question } from "../data/demoBrief";
import { useBriefStore } from "../stores/useBriefStore";

/**
 * QuestionCard:
 * - element id is 'q{number}' so anchors like #q17 work.
 * - includes a compact header with question number (styled) and a permalink anchor.
 */
export const QuestionCard: React.FC<{ sectionId: string; question: Question }> = ({ sectionId, question }) => {
  const setField = useBriefStore((s) => s.setField);

  const onChange = (v: any) => {
    setField(sectionId, question.id, v);
  };

  const qId = `q${question.number}`;

  return (
    <div id={qId} tabIndex={-1} className="p-3 border rounded anchor-offset">
      <div className="question-header">
        <div className="q-number">Q{String(question.number).padStart(2, "0")}</div>
        <div className="flex-1">
          <div className="font-semibold">{question.text}</div>
        </div>
        <div>
          <a className="anchor-link q-anchor" href={`#${qId}`} aria-label={`Link to question ${question.number}`}>¶</a>
        </div>
      </div>

      {question.type === "text" && (
        <input
          className="mt-2 w-full border rounded px-2 py-1"
          value={question.answer || ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {question.type === "longtext" && (
        <textarea
          className="mt-2 w-full border rounded px-2 py-1"
          value={question.answer || ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {question.type === "radio" && (
        <div className="mt-2 flex gap-2">
          {question.options?.map((opt) => (
            <label key={opt} className="inline-flex items-center gap-2">
              <input type="radio" name={question.id} checked={question.answer === opt} onChange={() => onChange(opt)} />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      )}

      {question.type === "file" && (
        <div className="mt-2">
          <input type="file" onChange={(e) => onChange(e.target.files?.[0])} />
        </div>
      )}
    </div>
  );
};
