import { getCognitoSessionKey } from './seal';

export type CognitoConfig = {
  apiUrl: string;
  appOrigin: string;
  clientId: string;
  issuer: string;
  region: string;
};

function cognitoRegion(issuer: string): string {
  const hostname = new URL(issuer).hostname;
  const [service, region] = hostname.split('.');
  if (service !== 'cognito-idp' || !region) {
    throw new Error('AWS_COGNITO_ISSUER must be a Cognito user-pool issuer');
  }
  return region;
}

function requireEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
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

function requireApplicationOrigin(name: string): string {
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
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error(`${name} must be a bare origin without a path or wildcard`);
  }

  return url.origin;
}

export function getCognitoConfig(): CognitoConfig {
  const issuer = requireHttpsUrl('AWS_COGNITO_ISSUER');
  const config = {
    apiUrl: requireHttpsUrl('AWS_ADMIN_API_URL'),
    appOrigin: requireApplicationOrigin('ADMIN_APP_ORIGIN'),
    clientId: requireEnvironmentValue('AWS_COGNITO_CLIENT_ID'),
    issuer,
    region: cognitoRegion(issuer),
  };
  getCognitoSessionKey();

  return config;
}
