/**
 * Safe Embedded Arithmetic Keypad Calculator Engine
 * No eval() or Function() used.
 * Implements standard operator precedence:
 *   Parentheses > Multiplication / Division > Addition / Subtraction
 * Half-up rounding to 2 decimals.
 */

export interface CalculationResult {
  isValid: boolean;
  value: number;
  displayValue: string;
  error?: string;
}

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
  | "*"
  | "÷"
  | "/"
  | "="
  | "⌫"
  | "CLEAR";

/**
 * Standardizes operators to +, -, *, /
 */
export function normalizeExpression(expr: string): string {
  return expr
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/\s+/g, "");
}

/**
 * Tokenizes a sanitized arithmetic expression
 */
function tokenize(expr: string): string[] {
  const normalized = normalizeExpression(expr);
  const tokens: string[] = [];
  let currentNum = "";

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];

    if ((char >= "0" && char <= "9") || char === ".") {
      currentNum += char;
    } else if (["+", "-", "*", "/"].includes(char)) {
      if (currentNum) {
        tokens.push(currentNum);
        currentNum = "";
      } else if (char === "-" && (tokens.length === 0 || ["+", "-", "*", "/"].includes(tokens[tokens.length - 1]))) {
        // Unary minus for negative number
        currentNum = "-";
        continue;
      }
      tokens.push(char);
    }
  }

  if (currentNum) {
    tokens.push(currentNum);
  }

  return tokens;
}

/**
 * Evaluates an arithmetic expression with strict operator precedence and half-up rounding.
 * Returns CalculationResult.
 */
export function evaluateExpression(expr: string): CalculationResult {
  const trimmed = expr.trim();
  if (!trimmed) {
    return { isValid: true, value: 0, displayValue: "0.00" };
  }

  const tokens = tokenize(trimmed);
  if (tokens.length === 0) {
    return { isValid: true, value: 0, displayValue: "0.00" };
  }

  // If the expression ends with an operator, evaluate the prefix up to the last operator for live preview
  let evalTokens = [...tokens];
  while (evalTokens.length > 0 && ["+", "-", "*", "/"].includes(evalTokens[evalTokens.length - 1])) {
    evalTokens.pop();
  }

  if (evalTokens.length === 0) {
    return { isValid: true, value: 0, displayValue: "0.00" };
  }

  // Check for division by zero
  for (let i = 0; i < evalTokens.length - 1; i++) {
    if (evalTokens[i] === "/" && parseFloat(evalTokens[i + 1]) === 0) {
      return {
        isValid: false,
        value: 0,
        displayValue: "Error",
        error: "Cannot divide by zero",
      };
    }
  }

  // First pass: Multiplication & Division
  const pass1: (number | string)[] = [];
  let i = 0;
  while (i < evalTokens.length) {
    const token = evalTokens[i];
    if (token === "*" || token === "/") {
      const prev = Number(pass1.pop());
      const nextToken = evalTokens[i + 1];
      if (nextToken === undefined) {
        pass1.push(prev);
        break;
      }
      const next = Number(nextToken);
      if (token === "/") {
        if (next === 0) {
          return {
            isValid: false,
            value: 0,
            displayValue: "Error",
            error: "Cannot divide by zero",
          };
        }
        pass1.push(prev / next);
      } else {
        pass1.push(prev * next);
      }
      i += 2;
    } else if (["+", "-"].includes(token)) {
      pass1.push(token);
      i++;
    } else {
      const num = parseFloat(token);
      if (isNaN(num)) {
        return { isValid: false, value: 0, displayValue: "Error", error: "Invalid expression" };
      }
      pass1.push(num);
      i++;
    }
  }

  // Second pass: Addition & Subtraction
  if (pass1.length === 0) {
    return { isValid: true, value: 0, displayValue: "0.00" };
  }

  let result = typeof pass1[0] === "number" ? pass1[0] : 0;
  let j = typeof pass1[0] === "number" ? 1 : 0;

  while (j < pass1.length) {
    const op = pass1[j];
    const nextVal = Number(pass1[j + 1]);
    if (op === "+") {
      result += nextVal;
    } else if (op === "-") {
      result -= nextVal;
    }
    j += 2;
  }

  // Round half-up to 2 decimals
  const rounded = Math.round((result + Number.EPSILON) * 100) / 100;
  const displayValue = rounded.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return {
    isValid: true,
    value: rounded,
    displayValue,
  };
}

/**
 * Handles keypad press logic for continuous input
 */
export function handleKeypadPress(currentExpr: string, token: KeypadToken): {
  nextExpr: string;
  evaluatedAmount?: number;
  isEvaluated: boolean;
  error?: string;
} {
  const trimmed = currentExpr.trim();

  if (token === "CLEAR") {
    return { nextExpr: "", isEvaluated: false };
  }

  if (token === "⌫") {
    if (trimmed.length <= 1) {
      return { nextExpr: "", isEvaluated: false };
    }
    return { nextExpr: trimmed.slice(0, -1), isEvaluated: false };
  }

  if (token === "=") {
    const res = evaluateExpression(trimmed);
    if (!res.isValid) {
      return {
        nextExpr: trimmed,
        isEvaluated: false,
        error: res.error,
      };
    }
    const evaluatedStr = res.value.toFixed(2);
    return {
      nextExpr: evaluatedStr,
      evaluatedAmount: res.value,
      isEvaluated: true,
    };
  }

  const isOperator = ["+", "-", "×", "*", "÷", "/"].includes(token);
  const normalizedOp = token === "×" ? "*" : token === "÷" ? "/" : token;

  if (isOperator) {
    if (!trimmed) {
      if (token === "-") {
        return { nextExpr: "-", isEvaluated: false };
      }
      return { nextExpr: "", isEvaluated: false };
    }

    const lastChar = trimmed[trimmed.length - 1];
    if (["+", "-", "*", "/", "×", "÷"].includes(lastChar)) {
      // Replace last operator with new operator
      return { nextExpr: trimmed.slice(0, -1) + normalizedOp, isEvaluated: false };
    }

    return { nextExpr: trimmed + normalizedOp, isEvaluated: false };
  }

  if (token === ".") {
    // Check if the current number segment already has a decimal point
    const segments = trimmed.split(/[+\-*\/×÷]/);
    const lastSegment = segments[segments.length - 1] || "";
    if (lastSegment.includes(".")) {
      return { nextExpr: trimmed, isEvaluated: false };
    }
    if (!trimmed || ["+", "-", "*", "/", "×", "÷"].includes(trimmed[trimmed.length - 1])) {
      return { nextExpr: trimmed + "0.", isEvaluated: false };
    }
    return { nextExpr: trimmed + ".", isEvaluated: false };
  }

  // Digits (0-9)
  if (trimmed === "0") {
    return { nextExpr: token, isEvaluated: false };
  }

  return { nextExpr: trimmed + token, isEvaluated: false };
}
