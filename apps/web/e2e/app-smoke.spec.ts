import { expect, test } from "@playwright/test";

const email = process.env.E2E_ADMIN_EMAIL ?? "admin@test.com";
const password = process.env.E2E_ADMIN_PASSWORD ?? "123456";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/auth/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/app$/);
}

test("auth + projects page opens", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Projects" }).click();
  await expect(page).toHaveURL(/\/app\/projects$/);
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
});

test("create project and task, then move task in kanban", async ({ page }) => {
  const unique = Date.now().toString();
  const projectName = `e2e-project-${unique}`;
  const taskName = `e2e-task-${unique}`;

  await login(page);
  await page.goto("/app/projects");

  await page.getByTestId("project-name-input").fill(projectName);
  await page.getByTestId("project-description-input").fill("Playwright project");
  await page.getByTestId("project-create-submit").click();

  await expect(page.getByText(projectName)).toBeVisible();
  await page.getByText(projectName).first().click();

  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

  await page.getByTestId("task-title-input").fill(taskName);
  await page.getByTestId("task-description-input").fill("Task from e2e");
  await page.getByRole("button", { name: "Create task" }).click();

  await expect(page.getByText(taskName)).toBeVisible();

  const taskCard = page.locator(".kanban-item", { hasText: taskName }).first();
  await expect(taskCard).toBeVisible();

  await taskCard.getByRole("button", { name: "Right" }).click();
  await expect(page.getByText("In progress")).toBeVisible();
  await expect(page.locator(".kanban-column", { hasText: "In progress" }).getByText(taskName)).toBeVisible();
});

