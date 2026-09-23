import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { LoginForm } from '../components/auth/LoginForm';

test('login renders an accessible in-app credential form without registration or hosted links', () => {
  const markup = renderToStaticMarkup(createElement(LoginForm));
  assert.match(markup, /<form/);
  assert.match(markup, /<label for="auth-email"/);
  assert.match(markup, /<label for="auth-password"/);
  assert.match(markup, /autoComplete="current-password"/);
  assert.match(markup, /Has oblidat la contrasenya\?/);
  assert.match(markup, /Inicia sessió/);
  assert.equal(markup.includes('amazoncognito.com'), false);
  assert.equal(markup.includes('Sign up'), false);
});
