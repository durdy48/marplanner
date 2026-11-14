// PORTED from v1 `apps/api/src/blocks/today.tsx` — createElement form
// (tsconfig has no jsx; see message.ts for the general porting note).
import { createElement } from "react";
import { defineBlock, type BlockDefinition } from "pressedslip";
import { z } from "zod";
import { labelsFromCtx } from "../labels";

const schema = z.object({
  bullets: z.array(z.string()),
  household: z.array(z.string()).optional(),
});
export type TodayData = z.infer<typeof schema>;

export const todayBlock: BlockDefinition<TodayData> = defineBlock({
  type: "today",
  schema,
  render: ({ data, ctx }) => {
    const bullet = ctx.theme.listItemBullet;
    const household = data.household ?? [];
    // The bullet sits in its own column, so a title that wraps stays aligned under its text.
    const line = (key: string, text: string) =>
      createElement(
        "div",
        { key, style: { width: "100%", display: "flex", gap: 6, alignItems: "flex-start" } },
        createElement("div", { style: { flexShrink: 0 } }, bullet),
        createElement(
          "div",
          { style: { flexGrow: 1, flexBasis: 0, minWidth: 0, width: "100%" } },
          text
        )
      );
    return createElement(
      "div",
      { style: { width: "100%", padding: 8, display: "flex", flexDirection: "column", gap: 4 } },
      data.bullets.map((b, i) => line(String(i), b)),
      // The whole household's events (assigned to nobody) under their own heading.
      household.length > 0
        ? createElement(
            "div",
            { key: "household-title", style: { fontWeight: 700 } },
            labelsFromCtx(ctx).today.household
          )
        : null,
      household.map((b, i) => line(`household-${i}`, b))
    );
  },
  shell: { showTitle: true, separator: "thin", padding: "normal" },
});
