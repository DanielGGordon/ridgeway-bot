import test from 'node:test';
import assert from 'node:assert/strict';
import { choose, parseBlocking } from '../src/parking.mjs';

const member = { plate: 'ABC123D', name: 'Jane Doe', guest: false };
const guest = { plate: 'ABC123', name: 'Jane Doe', guest: true };
const other = { plate: 'XYZ789', name: 'John Smith', guest: false };

test('exact plate wins over longer partial plate matches', () => {
  assert.equal(choose('ABC123', [member, guest]).pick, guest);
  assert.equal(choose('abc-123d', [member, guest]).pick, member);
});

test('a single suggestion is taken', () => {
  assert.equal(choose('smith', [other]).pick, other);
});

test('same person listed twice prefers the member entry', () => {
  assert.equal(choose('Doe', [guest, member]).pick, member);
});

test('different people are ambiguous', () => {
  assert.deepEqual(choose('S', [member, other]).ambiguous, [member, other]);
});

test('parseBlocking reads the status card', () => {
  const t = 'Parking\n\nBlocking Jane Doe (ABC123D)\nSince 12:02 PM\n5550100\nI\'m leaving';
  assert.deepEqual(parseBlocking(t), { name: 'Jane Doe', plate: 'ABC123D', since: '12:02 PM' });
  assert.equal(parseBlocking('Report a block\nMy vehicle'), null);
});
