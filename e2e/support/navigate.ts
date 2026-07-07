import { byText } from "./selectors";

/** Opens a tool by clicking its label in the (icon-collapsed by default) sidebar nav. */
export async function openTool(label: string) {
  const trigger = await $('[data-slot="sidebar-trigger"]');
  await trigger.click();

  const navItem = await byText(label);
  await navItem.waitForDisplayed({ timeout: 5000 });
  await navItem.click();
}
