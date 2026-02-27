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
  await page.getByRole("link", { name: "Projects", exact: true }).first().click();
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

  const projectRow = page.getByTestId("project-item").filter({ hasText: projectName }).first();
  await expect(projectRow).toBeVisible();
  await projectRow.getByRole("link", { name: "Open board" }).click();

  await expect(page).toHaveURL(/\/app\/projects\/.+/);
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

  await page.getByTestId("task-create-open").click();
  await page.getByTestId("task-title-input").fill(taskName);
  await page.getByTestId("task-description-input").fill("Task from e2e");
  await page.getByTestId("task-create-submit").click();

  const taskCard = page.getByTestId(/task-card-/).filter({ hasText: taskName }).first();
  await expect(taskCard).toBeVisible();

  await taskCard.dragTo(page.getByTestId("kanban-column-in_progress"));
  await expect(page.getByTestId("kanban-column-in_progress").getByText(taskName)).toBeVisible();

  await page.getByTestId("kanban-column-in_progress").getByText(taskName).first().dragTo(
    page.getByTestId("kanban-column-testing"),
  );
  await expect(page.getByTestId("kanban-column-testing").getByText(taskName)).toBeVisible();
});
