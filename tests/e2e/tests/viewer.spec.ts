import { join } from "node:path";

import { expect, type Page, test } from "@playwright/test";

const fixtures = join(import.meta.dirname, "..", "fixtures");

async function openApp(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto("/");
  await expect(page.locator(".dz-sheet svg").first()).toBeVisible({ timeout: 30_000 });
  return errors;
}

/** Opens a file through the app's Open… button (the browser's file picker). */
async function openFile(page: Page, name: string) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open…" }).click();
  await (await chooser).setFiles(join(fixtures, name));
}

test("draws the sample lead sheet with its lyrics and chord symbols", async ({ page }) => {
  const errors = await openApp(page);
  const sheet = page.locator(".dz-sheet");
  await expect(sheet).toContainText("Little Tune");
  await expect(sheet).toContainText("Hap");
  await expect(sheet).toContainText("D7");
  await expect(page.locator(".dz-status")).toHaveText("Nothing selected");
  expect(errors).toEqual([]);
});

test("selects the clicked note and steps with the arrows", async ({ page }) => {
  await openApp(page);
  await page.locator(".dz-sheet .vf-notehead").nth(3).click();
  await expect(page.locator(".dz-status")).toHaveText("D5, half note, measure 1");
  await expect(page.locator(".dz-sheet .dz-selected")).toHaveCount(1);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".dz-status")).toHaveText("C5, quarter note, measure 2");
  await page.keyboard.press("Control+ArrowRight");
  await expect(page.locator(".dz-status")).toHaveText("A4, quarter note, measure 3");
  await page.keyboard.press("Escape");
  await expect(page.locator(".dz-status")).toHaveText("Nothing selected");
  await expect(page.locator(".dz-sheet .dz-selected")).toHaveCount(0);
});

test("opens a score with two parts read-only, saying why", async ({ page }) => {
  await openApp(page);
  await openFile(page, "two-parts.musicxml");
  await expect(page.getByRole("note")).toContainText("This score can be played but not edited");
  await expect(page.getByRole("note")).toContainText("It has 2 parts.");
  await expect(page.getByRole("button", { name: "Note input" })).toHaveCount(0);
});

test("says why a file that is not MusicXML cannot be opened", async ({ page }) => {
  await openApp(page);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open…" }).click();
  await (await chooser).setFiles({ name: "notes.xml", mimeType: "application/xml", buffer: Buffer.from("<html/>") });
  await expect(page.getByRole("alert")).toHaveText("This file is XML, but not a MusicXML score.");
});

test("exports the drawn score as SVG", async ({ page }) => {
  await openApp(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("menuitem", { name: "SVG image" }).click();
  expect((await download).suggestedFilename()).toBe("little-tune.svg");
});
