import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted runs BEFORE vi.mock hoisting, so these are available in mock factories
const { capturedRef, mockMark, mockFinish, getBuilderAddCalls, resetBuilderAddCalls } = vi.hoisted(() => {
  const capturedRef: { cls: any; spec: any } = { cls: null, spec: null };
  const mockMark = vi.fn((opts: any) => ({ mark: true, ...opts }));
  let builderAddCalls: Array<{ from: number; to: number; deco: any }> = [];
  const mockFinish = vi.fn(() => ({ type: "DecorationSet", adds: [...builderAddCalls] }));
  return {
    capturedRef,
    mockMark,
    mockFinish,
    getBuilderAddCalls: () => builderAddCalls,
    resetBuilderAddCalls: () => { builderAddCalls = []; },
  };
});

vi.mock("@codemirror/view", () => ({
  ViewPlugin: {
    fromClass: vi.fn((cls: any, spec: any) => {
      capturedRef.cls = cls;
      capturedRef.spec = spec;
      return { cls, spec };
    }),
  },
  Decoration: {
    mark: mockMark,
  },
}));

vi.mock("@codemirror/state", () => ({
  RangeSetBuilder: vi.fn().mockImplementation(() => {
    resetBuilderAddCalls();
    return {
      add: vi.fn((from: number, to: number, deco: any) => {
        getBuilderAddCalls().push({ from, to, deco });
      }),
      finish: mockFinish,
    };
  }),
}));

// Import after mocks are set up
import "../../src/lib/codemirror/template-highlighting";

function makeView(text: string) {
  return {
    state: {
      doc: {
        toString: () => text,
      },
    },
  } as any;
}

describe("template-highlighting", () => {
  beforeEach(() => {
    resetBuilderAddCalls();
    mockFinish.mockClear();
  });

  describe("Decoration.mark calls", () => {
    it("creates three decoration marks with correct classes", () => {
      expect(mockMark).toHaveBeenCalledWith({ class: "cm-template-variable" });
      expect(mockMark).toHaveBeenCalledWith({ class: "cm-template-include" });
      expect(mockMark).toHaveBeenCalledWith({ class: "cm-frontmatter" });
    });
  });

  describe("ViewPlugin.fromClass", () => {
    it("was called with a class and decorations accessor", () => {
      expect(capturedRef.cls).not.toBeNull();
      expect(capturedRef.spec).toHaveProperty("decorations");
      expect(typeof capturedRef.spec.decorations).toBe("function");
    });

    it("decorations accessor returns instance.decorations", () => {
      const sentinel = { type: "test-deco" };
      expect(capturedRef.spec.decorations({ decorations: sentinel })).toBe(sentinel);
    });
  });

  describe("buildDecorations (via constructor)", () => {
    it("produces empty set for plain text", () => {
      const instance = new capturedRef.cls(makeView("Hello world"));
      expect(instance.decorations).toBeDefined();
      // No frontmatter, no templates -- only finish() called, no add()
      expect(instance.decorations.adds).toHaveLength(0);
    });

    it("decorates frontmatter block", () => {
      const text = "---\ntitle: Test\n---\nBody here";
      const instance = new capturedRef.cls(makeView(text));
      const adds = instance.decorations.adds;
      // Frontmatter: from 0 to endIdx+3. "---\ntitle: Test\n---" => endIdx=16, fmEnd=19
      const fmAdd = adds.find((a: any) => a.deco.class === "cm-frontmatter");
      expect(fmAdd).toBeDefined();
      expect(fmAdd.from).toBe(0);
      expect(fmAdd.to).toBe(19);
    });

    it("skips frontmatter when no closing ---", () => {
      const text = "---\ntitle: Test\nNo closing";
      const instance = new capturedRef.cls(makeView(text));
      const adds = instance.decorations.adds;
      const fmAdd = adds.find((a: any) => a.deco.class === "cm-frontmatter");
      expect(fmAdd).toBeUndefined();
    });

    it("skips frontmatter when text does not start with ---", () => {
      const text = "Hello\n---\nstuff\n---";
      const instance = new capturedRef.cls(makeView(text));
      const adds = instance.decorations.adds;
      const fmAdd = adds.find((a: any) => a.deco.class === "cm-frontmatter");
      expect(fmAdd).toBeUndefined();
    });

    it("decorates template variables", () => {
      const text = "Hello {{name}} and {{role}}";
      const instance = new capturedRef.cls(makeView(text));
      const adds = instance.decorations.adds;
      const varAdds = adds.filter((a: any) => a.deco.class === "cm-template-variable");
      expect(varAdds).toHaveLength(2);
      expect(varAdds[0].from).toBe(6);  // {{name}}
      expect(varAdds[0].to).toBe(14);
      expect(varAdds[1].from).toBe(19); // {{role}}
      expect(varAdds[1].to).toBe(27);
    });

    it("decorates include directives", () => {
      const text = "Start {{include:persona.md}} end";
      const instance = new capturedRef.cls(makeView(text));
      const adds = instance.decorations.adds;
      const inclAdds = adds.filter((a: any) => a.deco.class === "cm-template-include");
      expect(inclAdds).toHaveLength(1);
      expect(inclAdds[0].from).toBe(6);
      expect(inclAdds[0].to).toBe(28);
    });

    it("does not match include directives as variables", () => {
      const text = "{{include:path.md}}";
      const instance = new capturedRef.cls(makeView(text));
      const adds = instance.decorations.adds;
      const varAdds = adds.filter((a: any) => a.deco.class === "cm-template-variable");
      expect(varAdds).toHaveLength(0);
    });

    it("handles mixed frontmatter, variables, and includes", () => {
      const text = "---\ntitle: X\n---\nHello {{name}}, see {{include:frag.md}}";
      const instance = new capturedRef.cls(makeView(text));
      const adds = instance.decorations.adds;
      expect(adds.find((a: any) => a.deco.class === "cm-frontmatter")).toBeDefined();
      expect(adds.filter((a: any) => a.deco.class === "cm-template-variable")).toHaveLength(1);
      expect(adds.filter((a: any) => a.deco.class === "cm-template-include")).toHaveLength(1);
    });

    it("sorts ranges by from position", () => {
      // Include comes after variable in text, but both patterns scan independently
      const text = "{{include:a.md}} then {{var}}";
      const instance = new capturedRef.cls(makeView(text));
      const adds = instance.decorations.adds;
      for (let i = 1; i < adds.length; i++) {
        expect(adds[i].from).toBeGreaterThanOrEqual(adds[i - 1].from);
      }
    });

    it("handles empty document", () => {
      const instance = new capturedRef.cls(makeView(""));
      expect(instance.decorations.adds).toHaveLength(0);
    });
  });

  describe("update method", () => {
    it("rebuilds decorations when docChanged is true", () => {
      const view1 = makeView("{{a}}");
      const instance = new capturedRef.cls(view1);
      const firstDecos = instance.decorations;

      const view2 = makeView("{{b}}");
      instance.update({ docChanged: true, viewportChanged: false, view: view2 });
      // decorations should be a new object (rebuilt)
      expect(instance.decorations).not.toBe(firstDecos);
    });

    it("rebuilds decorations when viewportChanged is true", () => {
      const view1 = makeView("text");
      const instance = new capturedRef.cls(view1);
      const firstDecos = instance.decorations;

      instance.update({ docChanged: false, viewportChanged: true, view: view1 });
      expect(instance.decorations).not.toBe(firstDecos);
    });

    it("does not rebuild when neither docChanged nor viewportChanged", () => {
      const view1 = makeView("text");
      const instance = new capturedRef.cls(view1);
      const firstDecos = instance.decorations;

      instance.update({ docChanged: false, viewportChanged: false, view: view1 });
      expect(instance.decorations).toBe(firstDecos);
    });
  });
});
