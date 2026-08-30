import { expect, test } from "@playwright/test";

test("교사가 방을 만들고 학생이 역할을 받아 1판에 들어간다", async ({ browser }) => {
  const teacher = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const student = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  const errors: string[] = [];
  teacher.on("console", (message) => { if (message.type() === "error") errors.push(`teacher: ${message.text()}`); });
  student.on("console", (message) => { if (message.type() === "error") errors.push(`student: ${message.text()}`); });
  teacher.on("pageerror", (error) => errors.push(`teacher page: ${error.message}`));
  student.on("pageerror", (error) => errors.push(`student page: ${error.message}`));

  await teacher.goto("/");
  await expect(teacher.getByRole("heading", { name: "먹이그물 탐험대" })).toBeVisible();
  await teacher.getByRole("button", { name: /선생님 수업 만들기/ }).click();
  await teacher.getByPlaceholder("김선생").fill("테스트선생님");
  await teacher.getByRole("button", { name: "수업 열기" }).click();
  const codeElement = teacher.locator(".teacher-console-header strong");
  await expect(codeElement).toHaveText(/[A-Z0-9]{6}/);
  const roomCode = (await codeElement.textContent())!;

  await student.goto("/");
  await student.getByRole("button", { name: /학생으로 입장/ }).click();
  await student.getByPlaceholder("ABC123").fill(roomCode);
  await student.getByPlaceholder("민준").fill("테스트학생");
  await student.getByRole("button", { name: "입장하기" }).click();
  await student.waitForTimeout(200);
  expect(errors).toEqual([]);
  await expect(student.getByText("탐험대 친구들을 기다리는 중")).toBeVisible();
  await expect(teacher.locator(".player-roster button", { hasText: "테스트학생" })).toBeVisible();

  await teacher.getByRole("button", { name: /자동 배정/ }).click();
  await expect(student.getByText("이번 탐험에서 나는…")).toBeVisible();
  await teacher.getByRole("button", { name: /1판 시작/ }).click();
  await expect(student.locator("canvas")).toBeVisible();
  await expect(student.getByRole("button", { name: /먹기/ })).toBeVisible();
  await expect(student.locator(".joystick")).toBeVisible();
  await student.keyboard.down("ArrowRight");
  const movementSamples = await student.evaluate(async () => {
    const samples: number[] = [];
    await new Promise<void>((resolve) => {
      const sample = () => {
        const debug = (window as Window & { __feedChainNetcode?: { position: () => { x: number; y: number } | null } }).__feedChainNetcode;
        const position = debug?.position();
        if (position) samples.push(position.x);
        if (samples.length >= 45) resolve();
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    return samples;
  });
  await student.keyboard.up("ArrowRight");
  const movingFrames = movementSamples.slice(1).filter((x, index) => Math.abs(x - movementSamples[index]) > 0.05).length;
  expect(movementSamples.at(-1)! - movementSamples[0]!).toBeGreaterThan(60);
  expect(movingFrames).toBeGreaterThan(30);
  await student.screenshot({ path: "artifacts/student-round-1.png" });

  await teacher.getByRole("button", { name: /현재 활동 마치기/ }).click();
  await expect(student.getByRole("heading", { name: "먹이그물" })).toBeVisible();
  await student.getByRole("button", { name: /생물 종류별 보기/ }).click();
  await student.getByRole("button", { name: "풀 선택" }).click();
  await student.getByRole("button", { name: "메뚜기 선택" }).click();
  await student.getByRole("button", { name: "파란 선 추가" }).click();
  await expect(student.getByText("먹이그물에 파란 관계선이 추가됐어요!")).toBeVisible();

  await teacher.getByRole("button", { name: /2판 시작/ }).click();
  await expect(student.locator("canvas")).toHaveCount(1);
  await teacher.getByRole("button", { name: /현재 활동 마치기/ }).click();
  await expect(student.getByRole("heading", { name: "먹이그물" })).toBeVisible();
  await teacher.getByRole("button", { name: /생태계 실험/ }).click();
  await teacher.getByRole("button", { name: /개구리/ }).click();
  await expect(student.locator("canvas")).toHaveCount(1);
  await teacher.getByRole("button", { name: /현재 활동 마치기/ }).click();
  await expect(student.getByRole("heading", { name: /두 생태계는 어떻게 달라질까요/ })).toBeVisible();
  await teacher.getByRole("button", { name: /결과 비교/ }).click();
  await expect(student.getByRole("heading", { name: "비교 실험 결과" })).toBeVisible();
  await student.screenshot({ path: "artifacts/final-comparison.png" });

  expect(errors).toEqual([]);
  await student.close();
  await teacher.close();
});

test("첫 화면은 태블릿에서도 게임 포털처럼 보인다", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".portal-card")).toHaveCount(2);
  await expect(page.locator("body")).not.toHaveCSS("overflow-y", "scroll");
  await page.screenshot({ path: "artifacts/landing-tablet.png" });
});
