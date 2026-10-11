import { hash } from 'node:crypto';
import { join } from 'node:path';

const identity = /^[a-zA-Z0-9_-]{1,100}$/;
export function createAuditId(url: string, taskId: string, attemptId: string, date = new Date()) {
  if (!identity.test(taskId) || !identity.test(attemptId))
    throw new Error('Invalid audit identity');
  const host = new URL(url).hostname.toLowerCase().replace(/[^a-z0-9.-]/g, '-');
  return `product-page/${date.toISOString().slice(0, 10)}/${host}/${hash('sha256', url).slice(0, 16)}/${taskId}--${attemptId}`;
}

export function auditBundlePath(root: string, auditId: string) {
  if (
    !/^product-page\/\d{4}-\d{2}-\d{2}\/[a-z0-9.-]{1,253}\/[a-f0-9]{16}\/[a-zA-Z0-9_-]{1,100}--[a-zA-Z0-9_-]{1,100}$/.test(
      auditId,
    ) ||
    auditId.split('/').some((part) => part === '.' || part === '..')
  )
    throw new Error('Invalid audit ID');
  return join(root, `${auditId}.zip`);
}
