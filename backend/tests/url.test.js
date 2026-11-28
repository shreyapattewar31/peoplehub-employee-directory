import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUrl, normalizeBaseUrl, normalizeGoogleFormUrl } from '../src/utils/url.js';

test('base URLs are normalized without duplicate API paths', () => {
  assert.equal(normalizeBaseUrl('https://people.example.com/', 'PUBLIC_APP_URL'), 'https://people.example.com');
  assert.equal(buildUrl('https://people.example.com/', '/api/employees'), 'https://people.example.com/api/employees');
  assert.throws(() => normalizeBaseUrl('javascript:alert(1)', 'PUBLIC_APP_URL'), /HTTP or HTTPS/);
});

test('Google Form URLs accept only public HTTPS form links', () => {
  const longUrl = normalizeGoogleFormUrl('https://docs.google.com/forms/d/e/example/viewform?usp=sf_link');
  assert.equal(longUrl, 'https://docs.google.com/forms/d/e/example/viewform?usp=sf_link');
  assert.equal(normalizeGoogleFormUrl('https://forms.gle/example'), 'https://forms.gle/example');
  assert.equal(normalizeGoogleFormUrl('http://docs.google.com/forms/d/example/viewform'), null);
  assert.equal(normalizeGoogleFormUrl('https://docs.google.com/evil'), null);
  assert.equal(normalizeGoogleFormUrl('https://user:pass@docs.google.com/forms/d/example/viewform'), null);
});
