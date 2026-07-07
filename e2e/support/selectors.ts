/** Selects any element whose text contains the given string (WDIO's `*=` only matches `<a>` tags). */
export function byText(text: string) {
  return $(`//*[contains(text(), '${text}')]`);
}
