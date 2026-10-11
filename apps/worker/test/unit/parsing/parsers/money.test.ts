import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMinorUnits } from '../../../../src/parsing/parsers/money.ts';

test('converts prices exactly using currency minor units without floating point rounding', () => {
  assert.equal(toMinorUnits('89.99', 'CAD'), 8999);
  assert.equal(toMinorUnits('00129.9500', 'CAD'), 12995);
  assert.equal(toMinorUnits('0.29', 'USD'), 29);
  assert.equal(toMinorUnits('0', 'CAD'), 0);
  assert.equal(toMinorUnits('199', 'JPY'), 199);
  assert.equal(toMinorUnits('1.25', 'HUF'), 125);
  assert.equal(toMinorUnits('1.234', 'IQD'), 1234);
  assert.equal(toMinorUnits('1.2345', 'CLF'), 12345);
  assert.equal(toMinorUnits('1.234', 'KWD'), 1234);
  assert.equal(toMinorUnits('89.999', 'CAD'), undefined);
  assert.equal(toMinorUnits('199.5', 'JPY'), undefined);
  assert.equal(toMinorUnits('-1', 'CAD'), undefined);
  assert.equal(toMinorUnits('90071992547409.92', 'CAD'), undefined);
  assert.equal(toMinorUnits('90071992547409.91', 'CAD'), Number.MAX_SAFE_INTEGER);
  assert.equal(toMinorUnits('10', 'BAD'), undefined);
});
