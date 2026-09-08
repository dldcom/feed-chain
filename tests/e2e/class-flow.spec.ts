import { expect, test } from "@playwright/test";

test("teacher lobby assigns a private role and opens the practice briefing", async ({ browser }) => {
  const teacher = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const student = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  const errors: string[] = [];
  for (const [page, label] of [[teacher, "teacher"], [student, "student"]] as const) {
    page.on("console", (message) => { if (message.type() === "error") errors.push(`${label}: ${message.text()}`); });
    page.on("pageerror", (error) => errors.push(`${label} page: ${error.message}`));
  }

  await teacher.goto("/");
  await teacher.locator(".teacher-portal").click();
  const teacherForm = teacher.locator("form.join-dialog");
  await teacherForm.locator("input").fill("Teacher Test");
  await teacherForm.locator(".primary-game-button").click();
  const codeElement = teacher.locator(".class-code-display");
  await expect(codeElement).toHaveText(/^[A-Z0-9]{6}$/);
  const roomCode = (await codeElement.textContent())!;

  await student.goto(`/?room=${roomCode}`);
  const studentForm = student.locator("form.join-dialog");
  await expect(studentForm.locator(".code-input")).toHaveValue(roomCode);
  await studentForm.locator("input:not(.code-input)").fill("Student Test");
  await studentForm.locator(".primary-game-button").click();
  await expect(student.locator(".intermission-screen")).toBeVisible();
  await expect(teacher.locator(".teacher-roster button")).toHaveCount(1);

  await teacher.locator(".teacher-secondary-action").click();
  await expect(teacher.locator(".teacher-roster button .pixel-species-icon")).toHaveCount(1);
  await teacher.locator(".teacher-roster button").click();
  const roleModal = teacher.locator(".role-assignment-modal");
  await expect(roleModal).toBeVisible();
  await expect(teacher.locator(".teacher-control-card .role-section")).toHaveCount(0);
  await expect(teacher.locator(".mode-section")).toBeVisible();
  await teacher.locator(".role-assignment-modal-backdrop").click({ position: { x: 4, y: 4 } });
  await expect(roleModal).toHaveCount(0);

  await teacher.locator(".teacher-roster button").click();
  await expect(roleModal).toBeVisible();
await roleModal.locator(".role-assignment-option").first().click();
await expect(roleModal.locator(".role-assignment-option.active")).toHaveCount(1);
  await teacher.keyboard.press("Escape");
  await expect(roleModal).toHaveCount(0);

  await teacher.locator(".teacher-start-action").click();
  await expect(student.locator(".role-practice-screen")).toBeVisible();
  await expect(student.locator(".role-countdown strong")).toBeVisible();
  await expect(student.locator(".role-practice-screen .game-test-canvas canvas")).toBeVisible();

  // The role practice is intentionally ten seconds long before the live mode opens.
  await expect(student.locator(".game-screen canvas")).toBeVisible({ timeout: 15000 });
  await expect(teacher.locator(".teacher-console")).toBeVisible();
  expect(errors).toEqual([]);
  await student.screenshot({ path: "artifacts/student-mode-play.png" });
  await teacher.screenshot({ path: "artifacts/teacher-lobby.png" });
  await student.close();
  await teacher.close();
});

test("landing page remains tablet friendly", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".portal-card")).toHaveCount(2);
  await expect(page.locator("body")).not.toHaveCSS("overflow-y", "scroll");
  await page.screenshot({ path: "artifacts/landing-tablet.png" });
});
