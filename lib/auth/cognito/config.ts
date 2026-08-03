import { getAdminDataBackend } from '@/lib/config/adminBackend';

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
  if (url.protocol !== 'https:') {
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

  return url.toString();
}

export function getCognitoConfig(): CognitoConfig {
  if (getAdminDataBackend() !== 'aws') {
    throw new Error('Cognito configuration is disabled');
  }

  return {
    apiUrl: requireHttpsUrl('AWS_ADMIN_API_URL'),
    callbackUrl: requireCallbackUrl('AWS_COGNITO_CALLBACK_URL'),
    clientId: requireEnvironmentValue('AWS_COGNITO_CLIENT_ID'),
    issuer: requireHttpsUrl('AWS_COGNITO_ISSUER'),
    loginUrl: requireHttpsUrl('AWS_COGNITO_LOGIN_URL'),
    logoutUrl: requireCallbackUrl('AWS_COGNITO_LOGOUT_URL'),
    requiredScope: REQUIRED_SCOPE,
  };
}
