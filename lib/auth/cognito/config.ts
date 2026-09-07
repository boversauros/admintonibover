import { getAdminDataBackend } from '@/lib/config/adminBackend';

import { getCognitoSessionKey } from './seal';

export type CognitoConfig = {
  apiUrl: string;
  callbackUrl: string;
  clientId: string;
  issuer: string;
  loginUrl: string;
  logoutUrl: string;
  requiredScope: string;
};

const REQUIRED_SCOPE = 'admintonibover-api/admin';

function requireEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required when ADMIN_DATA_BACKEND=aws`);
  }
  return value;
}

function requireHttpsUrl(name: string): string {
  const value = requireEnvironmentValue(name);
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    value.includes('*') ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error(`${name} must use HTTPS`);
  }
  return url.toString().replace(/\/$/, '');
}

function requireCallbackUrl(name: string): string {
  const value = requireEnvironmentValue(name);
  const url = new URL(value);
  const isLocalhost =
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1');

  if (url.protocol !== 'https:' && !isLocalhost) {
    throw new Error(`${name} must use HTTPS except on localhost`);
  }
  if (process.env.NODE_ENV === 'production' && isLocalhost) {
    throw new Error(`${name} must use HTTPS in production`);
  }
  if (
    value.includes('*') ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error(`${name} must not contain credentials, a query, or a hash`);
  }

  return url.toString();
}

export function getCognitoConfig(): CognitoConfig {
  if (getAdminDataBackend() !== 'aws') {
    throw new Error('Cognito configuration is disabled');
  }

  const config = {
    apiUrl: requireHttpsUrl('AWS_ADMIN_API_URL'),
    callbackUrl: requireCallbackUrl('AWS_COGNITO_CALLBACK_URL'),
    clientId: requireEnvironmentValue('AWS_COGNITO_CLIENT_ID'),
    issuer: requireHttpsUrl('AWS_COGNITO_ISSUER'),
    loginUrl: requireHttpsUrl('AWS_COGNITO_LOGIN_URL'),
    logoutUrl: requireCallbackUrl('AWS_COGNITO_LOGOUT_URL'),
    requiredScope: REQUIRED_SCOPE,
  };

  if (new URL(config.callbackUrl).pathname !== '/auth/callback') {
    throw new Error(
      'AWS_COGNITO_CALLBACK_URL must use the exact /auth/callback path'
    );
  }
  if (new URL(config.callbackUrl).origin !== new URL(config.logoutUrl).origin) {
    throw new Error(
      'AWS_COGNITO_CALLBACK_URL and AWS_COGNITO_LOGOUT_URL must share an origin'
    );
  }
  if (new URL(config.logoutUrl).pathname !== '/') {
    throw new Error(
      'AWS_COGNITO_LOGOUT_URL must use the exact application root'
    );
  }
  getCognitoSessionKey();

  return config;
}
