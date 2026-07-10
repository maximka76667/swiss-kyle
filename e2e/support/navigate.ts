import { byText } from "./selectors";
import { jsClick } from "./click";

/** Opens a tool by clicking its label in the (icon-collapsed by default) sidebar nav. */
export async function openTool(label: string) {
  const trigger = await $('[data-slot="sidebar-trigger"]');
  await jsClick(trigger);

  const navItem = await byText(label);
  await navItem.waitForDisplayed({ timeout: 5000 });
  await jsClick(navItem);
}
