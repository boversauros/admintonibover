import { cookies } from 'next/headers';

import { getCognitoConfig } from './config';
import { COGNITO_COOKIE_NAMES, type CognitoTokenSet } from './cookies';
import {
  accessTokenNeedsRefresh,
  refreshCognitoTokens,
  verifyCognitoSession,
  type VerifiedCognitoSession,
} from './oauth';

export type CognitoSessionResult = VerifiedCognitoSession & {
  accessToken: string;
  refreshedTokens?: CognitoTokenSet;
};

export async function readCognitoSession(): Promise<CognitoSessionResult | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(COGNITO_COOKIE_NAMES.accessToken)?.value;
  const idToken = cookieStore.get(COGNITO_COOKIE_NAMES.idToken)?.value;
  const refreshToken = cookieStore.get(
    COGNITO_COOKIE_NAMES.refreshToken
  )?.value;

  if ((!accessToken || !idToken) && !refreshToken) {
    return null;
  }

  const config = getCognitoConfig();
  let tokens: CognitoTokenSet | undefined =
    accessToken && idToken
      ? {
          accessToken,
          idToken,
          expiresIn: 15 * 60,
        }
      : undefined;
  let refreshedTokens: CognitoTokenSet | undefined;

  try {
    if (!tokens || accessTokenNeedsRefresh(tokens.accessToken)) {
      if (!refreshToken) {
        return null;
      }
      const refreshed = await refreshCognitoTokens(config, refreshToken);
      refreshedTokens = {
        ...refreshed,
        refreshToken: refreshed.refreshToken ?? refreshToken,
      };
      tokens = refreshedTokens;
    }

    const verified = await verifyCognitoSession(config, tokens);
    return {
      ...verified,
      accessToken: tokens.accessToken,
      refreshedTokens,
    };
  } catch {
    return null;
  }
}
