import { expect, type Page, test } from "@playwright/test";

async function openApp(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto("/");
  await expect(page.locator(".dz-sheet svg").first()).toBeVisible({ timeout: 30_000 });
  return errors;
}

const status = (page: Page) => page.locator(".dz-status");

/** Selects the nth drawn notehead (in page order) and gives the score the keyboard. */
async function selectNote(page: Page, index: number) {
  await page.locator(".dz-sheet .vf-notehead").nth(index).click();
}

test("writes notes at the cursor with MuseScore's keys, and undoes them", async ({ page }) => {
  const errors = await openApp(page);
  await selectNote(page, 0);
  await expect(status(page)).toHaveText("G4, quarter note, measure 1");
  await page.keyboard.press("n");
  await expect(status(page)).toHaveText("Note input at measure 1, beat 1");
  await page.keyboard.press("6");
  await page.keyboard.press("e");
  await expect(status(page)).toHaveText("Note input at measure 1, beat 3");
  await expect(page.locator(".app-dirty")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  await expect(page.locator(".app-dirty")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("moves the selected note up and down, and by an octave", async ({ page }) => {
  await openApp(page);
  await selectNote(page, 0);
  await page.keyboard.press("ArrowUp");
  await expect(status(page)).toHaveText("G♯4, quarter note, measure 1");
  await page.keyboard.press("Control+ArrowUp");
  await expect(status(page)).toHaveText("G♯5, quarter note, measure 1");
  await page.keyboard.press("Delete");
  await expect(status(page)).toHaveText("Rest, quarter note, measure 1");
});

test("types lyrics syllable by syllable", async ({ page }) => {
  await openApp(page);
  await selectNote(page, 0);
  await page.keyboard.press("Control+l");
  const field = page.getByRole("textbox", { name: "Lyrics, verse 1" });
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("Hap");
  await field.fill("Glo");
  await page.keyboard.press("-");
  await expect(field).toHaveValue("py");
  await field.fill("ry");
  await page.keyboard.press("Escape");
  await expect(field).toHaveCount(0);
  await expect(page.locator(".dz-sheet")).toContainText("Glo");
});

test("types a chord symbol, and says when it cannot read one", async ({ page }) => {
  await openApp(page);
  await selectNote(page, 1);
  await page.keyboard.press("Control+k");
  const field = page.getByRole("textbox", { name: "Chord symbol" });
  await field.fill("Am7");
  await page.keyboard.press("Enter");
  await expect(page.locator(".dz-sheet")).toContainText("Am7");
  await selectNote(page, 2);
  await page.keyboard.press("Control+k");
  await page.getByRole("textbox", { name: "Chord symbol" }).fill("Xyz");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toHaveText("That chord symbol is not one Donizetti can read.");
});

test("changes the key from the palette", async ({ page }) => {
  await openApp(page);
  await selectNote(page, 0);
  await page.getByRole("button", { name: "D / b" }).click();
  await expect(page.locator(".app-dirty")).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
});

test("starts a new score from New…", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "New…" }).click();
  const dialog = page.getByRole("dialog", { name: "New score" });
  await dialog.getByLabel("Title").fill("Morning Song");
  await dialog.getByLabel("Time signature").selectOption("3/4");
  await dialog.getByLabel("Measures").fill("8");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page.locator(".dz-sheet")).toContainText("Morning Song");
  await expect(page.locator(".app-file")).toHaveText("Morning Song.musicxml");
  await selectNote(page, 0);
  await expect(status(page)).toHaveText("Rest, half note, measure 1");
});

test("read-only lets the score be played and selected, not edited", async ({ page }) => {
  await openApp(page);
  await page.getByLabel("Read-only").check();
  await expect(page.getByRole("button", { name: "Note input" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Palette" })).toHaveCount(0);
  await selectNote(page, 0);
  await page.keyboard.press("ArrowUp");
  await expect(status(page)).toHaveText("G4, quarter note, measure 1");
});
