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
      className="w-full bg-[var(--surface)] border border-hairline rounded-3xl p-3.5 space-y-3 animate-in fade-in zoom-in-95 my-1.5 shadow-sm"
    >
      {/* Header bar with title, live formula preview and Done button */}
      <div className="flex items-center justify-between px-1 pb-2.5 border-b border-hairline">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            {title}
          </span>
          {previewValue && (
            <span className="text-xs font-mono font-semibold text-[var(--accent)] bg-[var(--accent)]/10 px-2 py-0.5 rounded-lg border border-[var(--accent)]/25">
              = {previewValue}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="keypad-clear"
            onClick={() => onKeypadClick("C")}
            className="h-8 px-2.5 rounded-xl border border-hairline bg-[var(--bg)] text-xs font-medium text-[var(--expense)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            Clear
          </button>
          <button
            type="button"
            data-testid="keypad-done-btn"
            onClick={onClose}
            className="h-8 flex items-center gap-1.5 px-3 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-95 active:scale-95 transition-all shadow-xs"
          >
            <Check size={13} />
            <span>Done</span>
          </button>
        </div>
      </div>

      {/* 4x4 Grid */}
      <div className="grid grid-cols-4 gap-2">
        {/* Row 1 */}
        <KeypadBtn id="keypad-7" label="7" onClick={() => onKeypadClick("7")} />
        <KeypadBtn id="keypad-8" label="8" onClick={() => onKeypadClick("8")} />
        <KeypadBtn id="keypad-9" label="9" onClick={() => onKeypadClick("9")} />
        <KeypadBtn
          id="keypad-divide"
          label="÷"
          isOperator
          onClick={() => onKeypadClick("÷")}
        />

        {/* Row 2 */}
        <KeypadBtn id="keypad-4" label="4" onClick={() => onKeypadClick("4")} />
        <KeypadBtn id="keypad-5" label="5" onClick={() => onKeypadClick("5")} />
        <KeypadBtn id="keypad-6" label="6" onClick={() => onKeypadClick("6")} />
        <KeypadBtn
          id="keypad-multiply"
          label="×"
          isOperator
          onClick={() => onKeypadClick("×")}
        />

        {/* Row 3 */}
        <KeypadBtn id="keypad-1" label="1" onClick={() => onKeypadClick("1")} />
        <KeypadBtn id="keypad-2" label="2" onClick={() => onKeypadClick("2")} />
        <KeypadBtn id="keypad-3" label="3" onClick={() => onKeypadClick("3")} />
        <KeypadBtn
          id="keypad-minus"
          label="−"
          isOperator
          onClick={() => onKeypadClick("-")}
        />

        {/* Row 4 */}
        <KeypadBtn id="keypad-dot" label="." onClick={() => onKeypadClick(".")} />
        <KeypadBtn id="keypad-0" label="0" onClick={() => onKeypadClick("0")} />
        <KeypadBtn
          id="keypad-backspace"
          label="⌫"
          className="text-sm"
          onClick={() => onKeypadClick("⌫")}
        />
        <KeypadBtn
          id="keypad-plus"
          label="+"
          isOperator
          onClick={() => onKeypadClick("+")}
        />
      </div>

      {/* Equals Row for Explicit Evaluation */}
      <div className="flex justify-end pt-0.5">
        <button
          type="button"
          data-testid="keypad-equals"
          onClick={() => onKeypadClick("=")}
          className="w-full h-11 rounded-2xl border border-hairline bg-[var(--bg)] font-mono text-base font-semibold hover:bg-[var(--surface-hover)] text-[var(--text)] active:scale-[0.99] transition-all"
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
  isOperator = false,
  className = "",
}: {
  id: string;
  label: string;
  onClick: () => void;
  isOperator?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-testid={id}
      onClick={onClick}
      className={`h-12 rounded-2xl border transition-all text-base font-semibold font-mono flex items-center justify-center select-none active:scale-95 ${
        isOperator
          ? "border-[var(--accent)]/25 bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/15"
          : "border-hairline bg-[var(--bg)] hover:bg-[var(--surface-hover)] text-[var(--text)]"
      } ${className}`}
    >
      {label}
    </button>
  );
}
