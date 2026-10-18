import { describe, it, expect } from "vitest";
import { evaluateExpression, handleKeypadPress } from "@/lib/finance-core/calculator";

describe("Calculator Core Engine", () => {
  it("evaluates simple addition: 1250 + 450 + 80 = 1780.00", () => {
    const res = evaluateExpression("1250 + 450 + 80");
    expect(res.isValid).toBe(true);
    expect(res.value).toBe(1780);
    expect(res.displayValue).toBe("1,780.00");
  });

  it("respects operator precedence: 2 + 3 * 4 = 14.00", () => {
    const res = evaluateExpression("2 + 3 * 4");
    expect(res.isValid).toBe(true);
    expect(res.value).toBe(14);
    expect(res.displayValue).toBe("14.00");
  });

  it("handles division with half-up rounding: 1000 / 3 = 333.33", () => {
    const res = evaluateExpression("1000 / 3");
    expect(res.isValid).toBe(true);
    expect(res.value).toBe(333.33);
    expect(res.displayValue).toBe("333.33");
  });

  it("rejects division by zero: 5 / 0", () => {
    const res = evaluateExpression("5 / 0");
    expect(res.isValid).toBe(false);
    expect(res.error).toBe("Cannot divide by zero");
  });

  it("handles keypad button flow for continuous calculation", () => {
    let expr = "";
    expr = handleKeypadPress(expr, "1").nextExpr;
    expr = handleKeypadPress(expr, "2").nextExpr;
    expr = handleKeypadPress(expr, "5").nextExpr;
    expr = handleKeypadPress(expr, "0").nextExpr;
    expr = handleKeypadPress(expr, "+").nextExpr;
    expr = handleKeypadPress(expr, "4").nextExpr;
    expr = handleKeypadPress(expr, "5").nextExpr;
    expr = handleKeypadPress(expr, "0").nextExpr;
    expr = handleKeypadPress(expr, "+").nextExpr;
    expr = handleKeypadPress(expr, "8").nextExpr;
    expr = handleKeypadPress(expr, "0").nextExpr;

    expect(expr).toBe("1250+450+80");

    const evalResult = handleKeypadPress(expr, "=");
    expect(evalResult.isEvaluated).toBe(true);
    expect(evalResult.evaluatedAmount).toBe(1780);
    expect(evalResult.nextExpr).toBe("1780.00");
  });
});
