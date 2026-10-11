import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Test } from '@nestjs/testing';
import { ModulesContainer } from '@nestjs/core';
import { CaptureWorkflowModule } from '../../../src/pipeline/capture-workflow.module.ts';
import { CaptureWorkflowService } from '../../../src/pipeline/capture-workflow.service.ts';
import { AcquisitionRunner } from '../../../src/acquisition/acquisition.runner.ts';
import { WorkflowDecisionService } from '../../../src/decision/workflow-decision.service.ts';
import { DocumentPreparationService } from '../../../src/parsing/document/document-preparation.service.ts';
import { AuditReplayService } from '../../../src/audit/audit-replay.service.ts';

test('fetch workflow resolves without database or queue and shares acquisition resources with decision', async () => {
  const app = await Test.createTestingModule({
    imports: [CaptureWorkflowModule.register()],
  }).compile();
  try {
    assert.ok(app.get(CaptureWorkflowService));
    assert.ok(app.get(WorkflowDecisionService));
    assert.ok(app.get(DocumentPreparationService));
    assert.ok(app.get(AuditReplayService));
    const modules = [...app.get(ModulesContainer).values()];
    assert.equal(modules.filter((module) => module.providers.has(AcquisitionRunner)).length, 1);
    assert.equal(
      modules.some((module) => /Database|Queue/.test(module.metatype.name)),
      false,
    );
  } finally {
    await app.close();
  }
});
