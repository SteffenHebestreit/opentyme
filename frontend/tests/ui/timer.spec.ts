import { test, expect, Page } from '@playwright/test';

// Helper function to login
async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel(/email/i).fill('admin@example.com');
  await page.getByLabel(/password/i).fill('admin123');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('/dashboard');
}

test.describe('Time Tracking Timer', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/time-tracking');
  });

  test('should display timer interface', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /time tracker/i })).toBeVisible();
    await expect(page.getByText(/00:00:00/i)).toBeVisible(); // Initial timer display
    await expect(page.getByRole('button', { name: /start/i })).toBeVisible();
    await expect(page.getByLabel(/project/i)).toBeVisible();
    await expect(page.getByLabel(/description/i)).toBeVisible();
  });

  test('should start timer', async ({ page }) => {
    // Select project
    await page.getByLabel(/project/i).selectOption({ index: 1 });
    await page.getByLabel(/description/i).fill('Working on feature implementation');
    
    // Click start button
    await page.getByRole('button', { name: /start/i }).click();
    
    // Button should change to pause
    await expect(page.getByRole('button', { name: /pause/i })).toBeVisible();
    
    // Timer should be running
    await page.waitForTimeout(2000); // Wait 2 seconds
    const timerText = await page.getByTestId('timer-display').textContent();
    expect(timerText).toMatch(/00:00:0[1-9]/); // Should show at least 1 second
  });

  test('should pause timer', async ({ page }) => {
    // Start timer first
    await page.getByLabel(/project/i).selectOption({ index: 1 });
    await page.getByLabel(/description/i).fill('Testing pause functionality');
    await page.getByRole('button', { name: /start/i }).click();
    
    // Wait a bit
    await page.waitForTimeout(3000);
    
    // Pause timer
    await page.getByRole('button', { name: /pause/i }).click();
    
    // Should show resume button
    await expect(page.getByRole('button', { name: /resume/i })).toBeVisible();
    
    // Get current timer value
    const pausedTime = await page.getByTestId('timer-display').textContent();
    
    // Wait and check timer hasn't changed
    await page.waitForTimeout(2000);
    const stillPausedTime = await page.getByTestId('timer-display').textContent();
    expect(stillPausedTime).toBe(pausedTime);
  });

  test('should resume paused timer', async ({ page }) => {
    // Start and pause timer
    await page.getByLabel(/project/i).selectOption({ index: 1 });
    await page.getByLabel(/description/i).fill('Testing resume functionality');
    await page.getByRole('button', { name: /start/i }).click();
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: /pause/i }).click();
    
    const pausedTime = await page.getByTestId('timer-display').textContent();
    
    // Resume timer
    await page.getByRole('button', { name: /resume/i }).click();
    
    // Should show pause button again
    await expect(page.getByRole('button', { name: /pause/i })).toBeVisible();
    
    // Timer should continue from paused time
    await page.waitForTimeout(2000);
    const resumedTime = await page.getByTestId('timer-display').textContent();
    expect(resumedTime).not.toBe(pausedTime);
  });

  test('should stop and save timer', async ({ page }) => {
    // Start timer
    await page.getByLabel(/project/i).selectOption({ index: 1 });
    await page.getByLabel(/description/i).fill('Completed feature implementation');
    await page.getByRole('button', { name: /start/i }).click();
    await page.waitForTimeout(5000); // Run for 5 seconds
    
    // Stop timer
    await page.getByRole('button', { name: /stop.*save/i }).click();
    
    // Should show confirmation dialog
    await expect(page.getByText(/save time entry/i)).toBeVisible();
    await expect(page.getByText(/00:00:0[5-9]/)).toBeVisible(); // Should show ~5 seconds
    
    // Confirm save
    await page.getByRole('button', { name: /confirm/i }).click();
    
    // Should show success message
    await expect(page.getByText(/time entry saved/i)).toBeVisible();
    
    // Timer should reset to 00:00:00
    await expect(page.getByTestId('timer-display')).toContainText('00:00:00');
    await expect(page.getByRole('button', { name: /start/i })).toBeVisible();
  });

  test('should discard timer without saving', async ({ page }) => {
    // Start timer
    await page.getByLabel(/project/i).selectOption({ index: 1 });
    await page.getByLabel(/description/i).fill('Test entry to discard');
    await page.getByRole('button', { name: /start/i }).click();
    await page.waitForTimeout(3000);
    
    // Click discard button
    await page.getByRole('button', { name: /discard/i }).click();
    
    // Should show confirmation
    await expect(page.getByText(/discard.*time entry/i)).toBeVisible();
    await page.getByRole('button', { name: /confirm/i }).click();
    
    // Timer should reset
    await expect(page.getByTestId('timer-display')).toContainText('00:00:00');
    await expect(page.getByLabel(/description/i)).toHaveValue('');
  });

  test('should prevent starting timer without project selection', async ({ page }) => {
    // Try to start without selecting project
    await page.getByRole('button', { name: /start/i }).click();
    
    // Should show validation error
    await expect(page.getByText(/please select a project/i)).toBeVisible();
    
    // Timer should not start
    await expect(page.getByRole('button', { name: /start/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /pause/i })).not.toBeVisible();
  });

  test('should show running timer in page title', async ({ page }) => {
    await page.getByLabel(/project/i).selectOption({ index: 1 });
    await page.getByRole('button', { name: /start/i }).click();
    
    // Wait a bit for timer to run
    await page.waitForTimeout(3000);
    
    // Page title should include timer
    const title = await page.title();
    expect(title).toMatch(/\d{2}:\d{2}:\d{2}/); // Should show timer in title
  });

  test('should maintain timer state after page refresh', async ({ page }) => {
    // Start timer
    await page.getByLabel(/project/i).selectOption({ index: 1 });
    await page.getByLabel(/description/i).fill('Testing persistence');
    await page.getByRole('button', { name: /start/i }).click();
    await page.waitForTimeout(3000);
    
    // Get timer value
    const timerBefore = await page.getByTestId('timer-display').textContent();
    
    // Refresh page
    await page.reload();
    
    // Timer should still be running
    await expect(page.getByRole('button', { name: /pause/i })).toBeVisible();
    
    // Timer should have continued
    await page.waitForTimeout(2000);
    const timerAfter = await page.getByTestId('timer-display').textContent();
    expect(timerAfter).not.toBe(timerBefore);
  });

  test('should show timer in notification area', async ({ page }) => {
    // Start timer
    await page.getByLabel(/project/i).selectOption({ index: 1 });
    await page.getByRole('button', { name: /start/i }).click();
    
    // Navigate away
    await page.goto('/dashboard');
    
    // Should show timer widget in navbar/notification area
    await expect(page.getByTestId('timer-widget')).toBeVisible();
    await expect(page.getByTestId('timer-widget')).toContainText(/\d{2}:\d{2}:\d{2}/);
  });

  test('should warn before closing tab with active timer', async ({ page }) => {
    // Start timer
    await page.getByLabel(/project/i).selectOption({ index: 1 });
    await page.getByRole('button', { name: /start/i }).click();
    
    // Set up dialog listener
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('active timer');
      await dialog.accept();
    });
    
    // Try to close/reload page
    await page.reload();
  });

  test('should allow editing timer while running', async ({ page }) => {
    // Start timer
    await page.getByLabel(/project/i).selectOption({ index: 1 });
    const descInput = page.getByLabel(/description/i);
    await descInput.fill('Initial description');
    await page.getByRole('button', { name: /start/i }).click();
    
    await page.waitForTimeout(2000);
    
    // Should allow editing description while timer runs
    await descInput.clear();
    await descInput.fill('Updated description while running');
    
    // Stop and save
    await page.getByRole('button', { name: /stop.*save/i }).click();
    await page.getByRole('button', { name: /confirm/i }).click();
    
    // Check saved entry has updated description
    await page.goto('/time-entries');
    await expect(page.getByText('Updated description while running')).toBeVisible();
  });

  test('should switch projects mid-timer', async ({ page }) => {
    // Start timer with project 1
    const projectSelect = page.getByLabel(/project/i);
    await projectSelect.selectOption({ index: 1 });
    await page.getByRole('button', { name: /start/i }).click();
    await page.waitForTimeout(3000);
    
    // Change to project 2
    await projectSelect.selectOption({ index: 2 });
    
    // Should show confirmation dialog
    await expect(page.getByText(/switch project.*save current/i)).toBeVisible();
    
    // Save current and switch
    await page.getByRole('button', { name: /save.*switch/i }).click();
    
    // Should start new timer for project 2
    await expect(page.getByTestId('timer-display')).toContainText('00:00:00');
    await expect(page.getByRole('button', { name: /pause/i })).toBeVisible();
  });

  test('should show timer history sidebar', async ({ page }) => {
    // Click to open timer history
    await page.getByRole('button', { name: /history/i }).click();
    
    // Should show sidebar with recent timers
    await expect(page.getByRole('complementary', { name: /timer history/i })).toBeVisible();
    await expect(page.getByText(/recent sessions/i)).toBeVisible();
    
    // Should show list of previous timer sessions
    const historyItems = page.getByRole('listitem').filter({ has: page.getByText(/\d{2}:\d{2}:\d{2}/) });
    const count = await historyItems.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should resume from timer history', async ({ page }) => {
    // Start and stop a timer
    await page.getByLabel(/project/i).selectOption({ index: 1 });
    await page.getByLabel(/description/i).fill('Previous work session');
    await page.getByRole('button', { name: /start/i }).click();
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: /stop.*save/i }).click();
    await page.getByRole('button', { name: /confirm/i }).click();
    
    // Open history
    await page.getByRole('button', { name: /history/i }).click();
    
    // Click resume on previous entry
    const historyItem = page.getByRole('listitem').first();
    await historyItem.getByRole('button', { name: /resume/i }).click();
    
    // Should start new timer with same project and description
    await expect(page.getByLabel(/description/i)).toHaveValue('Previous work session');
    await expect(page.getByRole('button', { name: /pause/i })).toBeVisible();
  });

  test('should format timer in HH:MM:SS', async ({ page }) => {
    await page.getByLabel(/project/i).selectOption({ index: 1 });
    await page.getByRole('button', { name: /start/i }).click();
    
    // Timer should always show HH:MM:SS format
    const timerDisplay = page.getByTestId('timer-display');
    await expect(timerDisplay).toContainText(/^\d{2}:\d{2}:\d{2}$/);
    
    await page.waitForTimeout(1000);
    await expect(timerDisplay).toContainText(/^\d{2}:\d{2}:\d{2}$/);
  });

  test('should handle timer running past midnight', async ({ page }) => {
    // This would require mocking time or running a very long test
    // For now, just verify timer can display times over 24 hours
    
    // Mock a timer that's been running for 25 hours
    await page.evaluate(() => {
      localStorage.setItem('activeTimer', JSON.stringify({
        startTime: Date.now() - (25 * 60 * 60 * 1000), // 25 hours ago
        projectId: 1,
        description: 'Long running task'
      }));
    });
    
    await page.reload();
    
    // Should show 25:XX:XX format
    await expect(page.getByTestId('timer-display')).toContainText(/^25:\d{2}:\d{2}/);
  });

  test('should show keyboard shortcuts for timer controls', async ({ page }) => {
    // Open keyboard shortcuts help
    await page.keyboard.press('?'); // Common shortcut to show help
    
    // Should display timer shortcuts
    await expect(page.getByText(/keyboard shortcuts/i)).toBeVisible();
    await expect(page.getByText(/start.*pause.*timer/i)).toBeVisible(); // e.g., "Space: Start/Pause timer"
    await expect(page.getByText(/stop timer/i)).toBeVisible();
  });

  test('should support keyboard shortcuts for timer', async ({ page }) => {
    await page.getByLabel(/project/i).selectOption({ index: 1 });
    
    // Press Space to start
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: /pause/i })).toBeVisible();
    
    await page.waitForTimeout(2000);
    
    // Press Space to pause
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: /resume/i })).toBeVisible();
    
    // Press Escape to stop
    await page.keyboard.press('Escape');
    await expect(page.getByText(/discard.*time entry/i)).toBeVisible();
  });
});
