// The member's chores for the day, grouped by day period, each with a tick box to fill in on
// paper. createElement form (tsconfig has no jsx; see message.ts for the general porting note).
// The boxes are ASCII `[ ]`/`[x]` tiles, like streak-text.ts. Period labels render in the
// household language via `../labels.ts` (DAILY-BRIEFING-INV-06).
import { createElement } from "react";
import { defineBlock, type BlockDefinition } from "pressedslip";
import { z } from "zod";
import { labelsFromCtx } from "../labels";

const schema = z.object({
  periods: z
    .array(
      z.object({
        id: z.enum(["morning", "afternoon", "evening", "night"]),
        chores: z.array(z.object({ name: z.string(), completed: z.boolean() })).min(1),
      })
    )
    .min(1),
});
export type ChoreListData = z.infer<typeof schema>;

export const choreListBlock: BlockDefinition<ChoreListData> = defineBlock({
  type: "choreList",
  schema,
  render: ({ data, ctx }) => {
    const labels = labelsFromCtx(ctx).choreList.periods;
    return createElement(
      "div",
      { style: { width: "100%", padding: 8, display: "flex", flexDirection: "column", gap: 8 } },
      data.periods.map((period) =>
        createElement(
          "div",
          { key: period.id, style: { display: "flex", flexDirection: "column", gap: 4 } },
          createElement("div", { style: { fontWeight: 700 } }, labels[period.id]),
          period.chores.map((chore, i) =>
            createElement(
              "div",
              {
                key: i,
                style: { width: "100%", display: "flex", gap: 6, alignItems: "flex-start" },
              },
              createElement("div", { style: { flexShrink: 0 } }, chore.completed ? "[x]" : "[ ]"),
              createElement(
                "div",
                { style: { flexGrow: 1, flexBasis: 0, minWidth: 0, width: "100%" } },
                chore.name
              )
            )
          )
        )
      )
    );
  },
  shell: { showTitle: true, separator: "thin", padding: "normal" },
});
