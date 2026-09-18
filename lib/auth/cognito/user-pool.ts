import {
  CognitoIdentityProviderClient,
  GetUserCommand,
  InitiateAuthCommand,
  RevokeTokenCommand,
} from '@aws-sdk/client-cognito-identity-provider';

import type { CognitoConfig } from './config';
import type { CognitoTokenSet } from './cookies';

const REQUEST_TIMEOUT_MS = 8_000;

export type CognitoUserPoolCommand =
  | GetUserCommand
  | InitiateAuthCommand
  | RevokeTokenCommand;

export type CognitoCommandSender = (
  command: CognitoUserPoolCommand,
  options: { abortSignal: AbortSignal }
) => Promise<unknown>;

export type CognitoSignInResult =
  | { type: 'authenticated'; tokens: CognitoTokenSet }
  | {
      type: 'challenge';
      challengeName: string;
      challengeParameters: Record<string, string>;
      session: string;
    };

const clients = new Map<string, CognitoIdentityProviderClient>();

function clientFor(config: CognitoConfig): CognitoIdentityProviderClient {
  const existing = clients.get(config.region);
  if (existing) return existing;

  const client = new CognitoIdentityProviderClient({ region: config.region });
  clients.set(config.region, client);
  return client;
}

async function sendCommand(
  config: CognitoConfig,
  command: CognitoUserPoolCommand,
  sender?: CognitoCommandSender
): Promise<unknown> {
  const options = { abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) };
  if (sender) return sender(command, options);

  const client = clientFor(config);
  if (command instanceof InitiateAuthCommand) {
    return client.send(command, options);
  }
  if (command instanceof GetUserCommand) {
    return client.send(command, options);
  }
  return client.send(command, options);
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function tokenSet(
  value: unknown,
  requireRefreshToken: boolean
): CognitoTokenSet {
  const output = record(value);
  const authentication = record(output?.AuthenticationResult);
  if (
    typeof authentication?.AccessToken !== 'string' ||
    typeof authentication.IdToken !== 'string' ||
    typeof authentication.ExpiresIn !== 'number' ||
    authentication.TokenType !== 'Bearer'
  ) {
    throw new Error('Cognito returned an invalid authentication result');
  }
  if (requireRefreshToken && typeof authentication.RefreshToken !== 'string') {
    throw new Error('Cognito did not return the required refresh token');
  }

  return {
    accessToken: authentication.AccessToken,
    expiresIn: authentication.ExpiresIn,
    idToken: authentication.IdToken,
    refreshToken:
      typeof authentication.RefreshToken === 'string'
        ? authentication.RefreshToken
        : undefined,
  };
}

function challengeParameters(value: unknown): Record<string, string> {
  const parameters = record(value);
  if (!parameters) return {};
  return Object.fromEntries(
    Object.entries(parameters).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  );
}

export async function signInCognitoUser(
  config: CognitoConfig,
  username: string,
  password: string,
  sender?: CognitoCommandSender
): Promise<CognitoSignInResult> {
  const normalizedUsername = username.trim();
  if (!normalizedUsername || !password) {
    throw new Error('Username and password are required');
  }

  const output = record(
    await sendCommand(
      config,
      new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: config.clientId,
        AuthParameters: {
          USERNAME: normalizedUsername,
          PASSWORD: password,
        },
      }),
      sender
    )
  );
  if (output?.AuthenticationResult) {
    return { type: 'authenticated', tokens: tokenSet(output, true) };
  }
  if (
    typeof output?.ChallengeName === 'string' &&
    typeof output.Session === 'string'
  ) {
    return {
      type: 'challenge',
      challengeName: output.ChallengeName,
      challengeParameters: challengeParameters(output.ChallengeParameters),
      session: output.Session,
    };
  }
  throw new Error(
    'Cognito returned neither tokens nor an authentication challenge'
  );
}

export async function refreshCognitoTokens(
  config: CognitoConfig,
  refreshToken: string,
  sender?: CognitoCommandSender
): Promise<CognitoTokenSet> {
  if (!refreshToken) throw new Error('Refresh token is required');

  const output = await sendCommand(
    config,
    new InitiateAuthCommand({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: config.clientId,
      AuthParameters: { REFRESH_TOKEN: refreshToken },
    }),
    sender
  );
  return tokenSet(output, false);
}

export async function verifyCognitoTokenActive(
  config: CognitoConfig,
  accessToken: string,
  expectedSubject: string,
  sender?: CognitoCommandSender
): Promise<void> {
  const output = record(
    await sendCommand(
      config,
      new GetUserCommand({ AccessToken: accessToken }),
      sender
    )
  );
  const attributes = Array.isArray(output?.UserAttributes)
    ? output.UserAttributes
    : [];
  const subject = attributes.find(attribute => {
    const candidate = record(attribute);
    return candidate?.Name === 'sub';
  });
  if (record(subject)?.Value !== expectedSubject) {
    throw new Error('Cognito GetUser subject does not match the session');
  }
}

export async function revokeCognitoRefreshToken(
  config: CognitoConfig,
  refreshToken: string,
  sender?: CognitoCommandSender
): Promise<void> {
  if (!refreshToken) throw new Error('Refresh token is required');
  await sendCommand(
    config,
    new RevokeTokenCommand({
      ClientId: config.clientId,
      Token: refreshToken,
    }),
    sender
  );
}
