import { expect, it } from "vitest";
import { numberText } from "../apps/web/lib/presentation";
it("formátování neztratí přesnost velkého desetinného množství", () => {
  expect(numberText("9999999999999999.12345678")).toBe(
    "9\u00a0999\u00a0999\u00a0999\u00a0999\u00a0999,12345678",
  );
});
