// englishWord render-def (FR-040) — createElement form (tsconfig has no jsx; see message.ts).
import { createElement } from "react";
import { applyTextStyle, defineBlock, type BlockDefinition } from "pressedslip";
import { type ZodType, z } from "zod";

const schema: ZodType<{
  word: string;
  type: string;
  translation: string;
  example: string;
  exampleEs: string;
}> = z.object({
  word: z.string(),
  type: z.string(),
  translation: z.string(),
  example: z.string(),
  exampleEs: z.string(),
});
export type EnglishWordData = z.infer<typeof schema>;

/** Laid out like `wordOfDay`: the word large, its word class on the right, then the Spanish
 * translation, the English example in emphasis and its Spanish translation. */
export const englishWordBlock: BlockDefinition<EnglishWordData> = defineBlock({
  type: "englishWord",
  schema,
  render: ({ data, ctx }) => {
    const t = ctx.theme.textStyles;
    return createElement(
      "div",
      { style: { width: "100%", padding: 8, display: "flex", flexDirection: "column", gap: 6 } },
      createElement("div", { style: applyTextStyle(t.display, ctx.fontRoles) }, data.word),
      createElement(
        "div",
        { style: { ...applyTextStyle(t.label, ctx.fontRoles), alignSelf: "flex-end" } },
        data.type
      ),
      createElement("div", null, `= ${data.translation}`),
      createElement("div", { style: applyTextStyle(t.emphasis, ctx.fontRoles) }, data.example),
      createElement("div", null, data.exampleEs)
    );
  },
  shell: { showTitle: true, separator: "thin", padding: "normal" },
});
