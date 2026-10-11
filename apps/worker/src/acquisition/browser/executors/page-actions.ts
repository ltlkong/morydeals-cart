import type { Page } from 'playwright';
import type { StagehandPage } from '@crawlee/stagehand';
import type { AcquisitionStep } from '@morydeals/capture-contracts';
import { AcquisitionError } from '../../acquisition.types.ts';

export async function executeAction(
  page: Page,
  action: Extract<AcquisitionStep, { mode: 'browser' | 'interactive' }>['actions'][number],
  timeoutMs: number,
) {
  if (action.type === 'act') {
    try {
      const result = await (page as StagehandPage).act(action.instruction, { timeout: timeoutMs });
      return { action, result };
    } catch {
      throw new AcquisitionError('interaction_failed', 'Stagehand action failed');
    }
  }
  const locator = page.locator(action.selector);
  if (action.type === 'click') await locator.click();
  else if (action.type === 'fill') await locator.fill(action.value);
  else if (action.type === 'select') await locator.selectOption(action.value);
  else await locator.waitFor({ state: 'visible' });
  return { action, success: true };
}
