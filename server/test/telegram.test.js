import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInitData, signInitData } from '../src/telegram.js';

const TOKEN = '123456:TEST_TOKEN';
const now = Math.floor(Date.now() / 1000);
const fields = (extra = {}) => ({
  auth_date: String(now),
  query_id: 'AAH',
  user: JSON.stringify({ id: 777, first_name: 'Ali', last_name: 'Valiyev' }),
  start_param: 'K7P2QX',
  ...extra
});

test('to\'g\'ri imzolangan initData qabul qilinadi', () => {
  const u = validateInitData(signInitData(fields(), TOKEN), TOKEN);
  assert.equal(u.id, 'tg:777');
  assert.equal(u.name, 'Ali Valiyev');
  assert.equal(u.startParam, 'K7P2QX');
});

test('boshqa token bilan imzolangan rad etiladi', () => {
  assert.equal(validateInitData(signInitData(fields(), 'other:token'), TOKEN), null);
});

test('o\'zgartirilgan ma\'lumot rad etiladi', () => {
  const signed = signInitData(fields(), TOKEN);
  const tampered = signed.replace('Ali', 'Eve');
  assert.equal(validateInitData(tampered, TOKEN), null);
});

test('eskirgan initData rad etiladi', () => {
  const old = signInitData(fields({ auth_date: String(now - 3 * 24 * 3600) }), TOKEN);
  assert.equal(validateInitData(old, TOKEN), null);
});

test('hash yo\'q yoki bo\'sh', () => {
  assert.equal(validateInitData('', TOKEN), null);
  assert.equal(validateInitData('auth_date=1', TOKEN), null);
});
