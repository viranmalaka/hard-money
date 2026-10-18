import { describe, it, expect } from "vitest";
import { maskCardNumbers } from "@/lib/sms/mask-numbers";

describe("Card Number Masking Utility", () => {
  it("masks 16-digit card numbers to last 4 digits", () => {
    const text = "Your Card 4532111122223333 was used for LKR 500";
    const masked = maskCardNumbers(text);
    expect(masked).toBe("Your Card ************3333 was used for LKR 500");
  });

  it("masks card numbers with spaces or dashes", () => {
    const text = "A/C 1234-5678-9012-3456 debited";
    const masked = maskCardNumbers(text);
    expect(masked).toBe("A/C ****-****-****-3456 debited");
  });

  it("leaves 4-digit numbers or amounts unmasked", () => {
    const text = "Card ending 1234 was used for LKR 4,500.00";
    const masked = maskCardNumbers(text);
    expect(masked).toBe("Card ending 1234 was used for LKR 4,500.00");
  });
});
