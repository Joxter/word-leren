import { useState } from "react";
import { css } from "@linaria/core";
import MarkdocContent from "./MarkdocContent";
import { Textarea } from "./Textarea";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  required?: boolean;
}

const fieldGroup = css`
  display: flex;
  flex-direction: column;
  gap: 0;
  margin-bottom: 1rem;
`;

const fieldHeader = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.375rem;
`;

const fieldLabel = css`
  font-size: 0.75rem;
  font-weight: 600;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const tabRow = css`
  display: flex;
  gap: 0;
  border: 1px solid #e0e0e0;
  border-radius: 5px;
  overflow: hidden;
`;

const tabBtn = css`
  background: none;
  border: none;
  padding: 0.2rem 0.6rem;
  font-size: 0.7rem;
  font-weight: 500;
  color: #888;
  cursor: pointer;
  letter-spacing: 0.02em;

  &:hover {
    color: #333;
    background: #f5f5f5;
  }
`;

const tabBtnActive = css`
  background: #1a1a1a;
  color: #fff;

  &:hover {
    background: #333;
    color: #fff;
  }
`;

const textarea = css`
  width: 100%;
  padding: 0.5rem 0.6rem;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  font-size: 0.875rem;
  font-family: inherit;
  line-height: 1.4;
  box-sizing: border-box;
  min-height: 100px;

  &:focus {
    outline: none;
    border-color: #999;
  }
`;

const preview = css`
  min-height: 2.5rem;
  padding: 0.5rem 0.6rem;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  background: #fafafa;
`;

const emptyPreview = css`
  font-size: 0.8rem;
  color: #bbb;
  font-style: italic;
`;

export default function MarkdocField({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  required,
}: Props) {
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  return (
    <div className={fieldGroup}>
      <div className={fieldHeader}>
        <span className={fieldLabel}>{label}</span>
        <div className={tabRow}>
          <button
            type="button"
            className={mode === "edit" ? `${tabBtn} ${tabBtnActive}` : tabBtn}
            onClick={() => setMode("edit")}
          >
            Edit
          </button>
          <button
            type="button"
            className={
              mode === "preview" ? `${tabBtn} ${tabBtnActive}` : tabBtn
            }
            onClick={() => setMode("preview")}
          >
            Preview
          </button>
        </div>
      </div>

      {mode === "edit" ? (
        <Textarea
          className={textarea}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          required={required}
        />
      ) : (
        <div className={preview}>
          {value.trim() ? (
            <MarkdocContent content={value} />
          ) : (
            <span className={emptyPreview}>Nothing to preview</span>
          )}
        </div>
      )}
    </div>
  );
}
