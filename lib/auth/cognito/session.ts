import { cookies } from 'next/headers';

import { getCognitoConfig, type CognitoConfig } from './config';
import {
  COGNITO_COOKIE_NAMES,
  readCognitoAccessToken,
  readCognitoIdToken,
  readCognitoRefreshToken,
  type CognitoTokenSet,
} from './cookies';
import {
  accessTokenNeedsRefresh,
  refreshCognitoTokens,
  verifyCognitoSession,
  verifyCognitoTokenActive,
  type VerifiedCognitoSession,
} from './oauth';

export type CognitoSessionResult = VerifiedCognitoSession & {
  accessToken: string;
  refreshedTokens?: CognitoTokenSet;
};

export async function readCognitoSession(
  config: CognitoConfig = getCognitoConfig()
): Promise<CognitoSessionResult | null> {
  const cookieStore = await cookies();
  const sealedAccessToken = cookieStore.get(
    COGNITO_COOKIE_NAMES.accessToken
  )?.value;
  const sealedIdToken = cookieStore.get(COGNITO_COOKIE_NAMES.idToken)?.value;
  const sealedRefreshToken = cookieStore.get(
    COGNITO_COOKIE_NAMES.refreshToken
  )?.value;

  if (!sealedAccessToken && !sealedIdToken && !sealedRefreshToken) {
    return null;
  }

  try {
    const [accessToken, idToken, refreshToken] = await Promise.all([
      readCognitoAccessToken(sealedAccessToken),
      readCognitoIdToken(sealedIdToken),
      readCognitoRefreshToken(sealedRefreshToken),
    ]);

    if (
      (sealedAccessToken && !accessToken) ||
      (sealedIdToken && !idToken) ||
      (sealedRefreshToken && !refreshToken) ||
      Boolean(accessToken) !== Boolean(idToken)
    ) {
      return null;
    }

    let tokens: CognitoTokenSet | undefined =
      accessToken && idToken
        ? {
            accessToken,
            idToken,
            expiresIn: 15 * 60,
          }
        : undefined;
    let refreshedTokens: CognitoTokenSet | undefined;

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
    await verifyCognitoTokenActive(
      config,
      tokens.accessToken,
      verified.user.id
    );
    return {
      ...verified,
      accessToken: tokens.accessToken,
      refreshedTokens,
    };
  } catch {
    return null;
  }
}
