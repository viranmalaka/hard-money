"use client";

import React from "react";
import { Check } from "lucide-react";

export type KeypadToken =
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "."
  | "+"
  | "-"
  | "×"
  | "÷"
  | "="
  | "⌫"
  | "C";

interface NumberKeypadPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onKeypadClick: (token: KeypadToken) => void;
  expression: string;
  previewValue?: string;
  title?: string;
}

export function NumberKeypadPopup({
  isOpen,
  onClose,
  onKeypadClick,
  previewValue,
  title = "Keypad",
}: NumberKeypadPopupProps) {
  if (!isOpen) return null;

  return (
    <div
      data-testid="number-keypad-popup"
      className="w-full bg-[var(--surface)] border border-hairline rounded-lg p-2.5 space-y-2 animate-in fade-in zoom-in-95 my-1 shadow-xs"
    >
      {/* Header bar with title, live formula preview and Done button */}
      <div className="flex items-center justify-between px-1 pb-1 border-b border-hairline">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            {title}
          </span>
          {previewValue && (
            <span className="text-[11px] font-mono font-medium text-[var(--text-muted)] bg-[var(--bg)] px-1.5 py-0.5 rounded border border-hairline">
              = {previewValue}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid="keypad-clear"
            onClick={() => onKeypadClick("C")}
            className="px-2 py-0.5 rounded border border-hairline bg-[var(--bg)] text-[10px] font-medium text-[var(--expense)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            Clear
          </button>
          <button
            type="button"
            data-testid="keypad-done-btn"
            onClick={onClose}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--accent)] text-white text-[11px] font-semibold hover:opacity-90 active:scale-95 transition-all shadow-xs"
          >
            <Check size={12} />
            <span>Done</span>
          </button>
        </div>
      </div>

      {/* 4x4 Grid */}
      <div className="grid grid-cols-4 gap-1.5">
        {/* Row 1 */}
        <KeypadBtn id="keypad-7" label="7" onClick={() => onKeypadClick("7")} />
        <KeypadBtn id="keypad-8" label="8" onClick={() => onKeypadClick("8")} />
        <KeypadBtn id="keypad-9" label="9" onClick={() => onKeypadClick("9")} />
        <KeypadBtn
          id="keypad-divide"
          label="÷"
          className="bg-[var(--bg)] font-semibold text-sm"
          onClick={() => onKeypadClick("÷")}
        />

        {/* Row 2 */}
        <KeypadBtn id="keypad-4" label="4" onClick={() => onKeypadClick("4")} />
        <KeypadBtn id="keypad-5" label="5" onClick={() => onKeypadClick("5")} />
        <KeypadBtn id="keypad-6" label="6" onClick={() => onKeypadClick("6")} />
        <KeypadBtn
          id="keypad-multiply"
          label="×"
          className="bg-[var(--bg)] font-semibold text-sm"
          onClick={() => onKeypadClick("×")}
        />

        {/* Row 3 */}
        <KeypadBtn id="keypad-1" label="1" onClick={() => onKeypadClick("1")} />
        <KeypadBtn id="keypad-2" label="2" onClick={() => onKeypadClick("2")} />
        <KeypadBtn id="keypad-3" label="3" onClick={() => onKeypadClick("3")} />
        <KeypadBtn
          id="keypad-minus"
          label="−"
          className="bg-[var(--bg)] font-semibold text-sm"
          onClick={() => onKeypadClick("-")}
        />

        {/* Row 4 */}
        <KeypadBtn id="keypad-dot" label="." onClick={() => onKeypadClick(".")} />
        <KeypadBtn id="keypad-0" label="0" onClick={() => onKeypadClick("0")} />
        <KeypadBtn
          id="keypad-backspace"
          label="⌫"
          className="text-xs"
          onClick={() => onKeypadClick("⌫")}
        />
        <KeypadBtn
          id="keypad-plus"
          label="+"
          className="bg-[var(--bg)] font-semibold text-sm"
          onClick={() => onKeypadClick("+")}
        />
      </div>

      {/* Equals Row for Explicit Evaluation */}
      <div className="flex justify-end pt-0.5">
        <button
          type="button"
          data-testid="keypad-equals"
          onClick={() => onKeypadClick("=")}
          className="w-full py-1.5 rounded border border-hairline bg-[var(--bg)] font-mono text-sm font-semibold hover:bg-[var(--surface-hover)] text-[var(--text)] transition-colors"
        >
          =
        </button>
      </div>
    </div>
  );
}

function KeypadBtn({
  id,
  label,
  onClick,
  className = "",
}: {
  id: string;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-testid={id}
      onClick={onClick}
      className={`h-10 rounded border border-hairline bg-[var(--bg)] hover:bg-[var(--surface-hover)] active:scale-95 transition-all text-sm font-medium text-[var(--text)] font-mono flex items-center justify-center select-none shadow-xs ${className}`}
    >
      {label}
    </button>
  );
}
