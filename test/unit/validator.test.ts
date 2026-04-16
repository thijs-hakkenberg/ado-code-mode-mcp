import { describe, it, expect } from "vitest";
import { validateCode, ValidationError } from "../../src/sandbox/validator.js";

describe("validateCode", () => {
  describe("banned patterns", () => {
    const banned = [
      ['require("fs")', "require("],
      ["import fs from 'fs'", "import "],
      ["process.exit(1)", "process."],
      ["child_process.exec('ls')", "child_process"],
      ["global.foo = 1", "global."],
      ["globalThis.bar = 2", "globalThis."],
      ['fetch("https://evil.com")', "fetch("],
      ["eval('code')", "eval("],
      ["new Function('return 1')", "Function("],
    ];

    for (const [code, pattern] of banned) {
      it(`should reject code containing '${pattern}'`, () => {
        expect(() => validateCode(code)).toThrow(ValidationError);
      });
    }
  });

  describe("allowed patterns", () => {
    const allowed = [
      'const x = await ado.workItems.get(123)',
      'console.log("hello")',
      'JSON.stringify({ a: 1 })',
      'Math.max(1, 2)',
      'new Date().toISOString()',
      'const arr = [1,2,3].filter(x => x > 1)',
      'Object.keys({ a: 1 })',
      'result = await Promise.all([ado.workItems.get(1), ado.workItems.get(2)])',
      'const sleep = (ms) => new Promise(r => setTimeout(r, ms))',
    ];

    for (const code of allowed) {
      it(`should allow: ${code.slice(0, 50)}...`, () => {
        expect(() => validateCode(code)).not.toThrow();
      });
    }
  });

  describe("edge cases", () => {
    it("should reject empty code", () => {
      expect(() => validateCode("")).toThrow(ValidationError);
    });

    it("should reject whitespace-only code", () => {
      expect(() => validateCode("   \n  ")).toThrow(ValidationError);
    });

    it("should include the banned pattern in the error message", () => {
      try {
        validateCode('require("fs")');
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect((e as ValidationError).message).toContain("require(");
      }
    });

    it("should detect patterns in multiline code", () => {
      const code = `
        const x = 1;
        const y = require("fs");
        result = x + y;
      `;
      expect(() => validateCode(code)).toThrow(ValidationError);
    });
  });
});
