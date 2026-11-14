// saintOfDay render-def (FR-041) — createElement form (tsconfig has no jsx; see message.ts).
import { createElement } from "react";
import { applyTextStyle, defineBlock, type BlockDefinition } from "pressedslip";
import { type ZodType, z } from "zod";

const schema: ZodType<{ feast?: string; saints: string[] }> = z.object({
  feast: z.string().optional(),
  saints: z.array(z.string()),
});
export type SaintOfDayData = z.infer<typeof schema>;

/** The solemnity first, in emphasis, then one saint per line. */
export const saintOfDayBlock: BlockDefinition<SaintOfDayData> = defineBlock({
  type: "saintOfDay",
  schema,
  render: ({ data, ctx }) => {
    const t = ctx.theme.textStyles;
    return createElement(
      "div",
      { style: { width: "100%", padding: 8, display: "flex", flexDirection: "column", gap: 4 } },
      data.feast
        ? createElement("div", { style: applyTextStyle(t.emphasis, ctx.fontRoles) }, data.feast)
        : null,
      ...data.saints.map((saint, i) => createElement("div", { key: String(i) }, saint))
    );
  },
  shell: { showTitle: true, separator: "thin", padding: "normal" },
});
