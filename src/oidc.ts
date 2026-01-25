import * as oauth from 'oauth4webapi'
import { Hono, HonoRequest } from 'hono'
import { AppSession, CurrentUser } from './session.ts'
import { useSettings } from './settings.ts'
import { decode as decodeJwtToken } from 'hono/jwt'

const settings = useSettings()

export class AppOidcHandling {
  private static authorizationServer: oauth.AuthorizationServer | undefined

  public static async initOidc() {
    console.info('Initializing OIDC...')
    await this.getOrDiscoverAuthorizationServer()
  }

  public static async getOrDiscoverAuthorizationServer() {
    if (this.authorizationServer) {
      return this.authorizationServer
    }

    console.info('Discovering OIDC authorization server...')
    const issuerUrl = new URL(settings.oidcIssuer)
    const discoveryResponse = await oauth.discoveryRequest(issuerUrl, { algorithm: 'oidc' })
    this.authorizationServer = await oauth.processDiscoveryResponse(issuerUrl, discoveryResponse)

    return this.authorizationServer
  }

  public static setOidcCookie(headers: Headers, name: string, value: string) {
    const cookieParts = [
      `${name}=${value}`,
      `Max-Age=600`,
      'HttpOnly',
      `SameSite=Lax`,
      'Secure',
      `Path=/`,
    ]

    const cookieString = cookieParts.join('; ')

    headers.append('Set-Cookie', cookieString)
  }

  public static readOidcCookie(req: HonoRequest, name: string): string | undefined {
    const cookieHeader = req.header('cookie') || ''
    const cookies = cookieHeader.split(';').map((part) => part.trim())

    for (const cookie of cookies) {
      if (cookie.startsWith(`${name}=`)) {
        return cookie.substring(name.length + 1)
      }
    }

    return undefined
  }

  public static clearOidcCookie(headers: Headers, name: string) {
    const cookieParts = [
      `${name}=`,
      `Max-Age=0`,
      'HttpOnly',
      `SameSite=Lax`,
      'Secure',
      `Path=/`,
    ]

    const cookieString = cookieParts.join('; ')

    headers.append('Set-Cookie', cookieString)
  }
}

export const oidcApp = new Hono()

oidcApp.get('/login', async (ctx) => {
  let returnToQuery = ctx.req.query('returnTo')?.trim() ?? '/'
  if (!returnToQuery.startsWith('/')) {
    returnToQuery = '/'
  }

  const authorizationServer = await AppOidcHandling.getOrDiscoverAuthorizationServer()
  const state = oauth.generateRandomState()
  const nonce = oauth.generateRandomNonce()
  const codeVerifier = oauth.generateRandomCodeVerifier()
  const codeChallenge = await oauth.calculatePKCECodeChallenge(codeVerifier)
  const callbackUrl = new URL('/oidc/callback', ctx.req.url)
  console.debug('OIDC Login Callback URL:', callbackUrl.toString())

  const authorizationUrl = new URL(authorizationServer.authorization_endpoint!)
  authorizationUrl.searchParams.set('client_id', settings.oidcClientId)
  authorizationUrl.searchParams.set('response_type', 'code')
  authorizationUrl.searchParams.set('scope', 'openid profile email')
  authorizationUrl.searchParams.set('redirect_uri', callbackUrl.toString())
  authorizationUrl.searchParams.set('state', state)
  authorizationUrl.searchParams.set('nonce', nonce)
  authorizationUrl.searchParams.set('code_challenge', codeChallenge)
  authorizationUrl.searchParams.set('code_challenge_method', 'S256')

  const response = ctx.redirect(authorizationUrl, 302)
  AppOidcHandling.setOidcCookie(response.headers, 'oidc_state', state)
  AppOidcHandling.setOidcCookie(response.headers, 'oidc_nonce', nonce)
  AppOidcHandling.setOidcCookie(response.headers, 'oidc_code_verifier', codeVerifier)
  AppOidcHandling.setOidcCookie(response.headers, 'oidc_return_to', encodeURIComponent(returnToQuery))

  return response
})

oidcApp.get('/oidc/callback', async (ctx) => {
  const expectedState = AppOidcHandling.readOidcCookie(ctx.req, 'oidc_state')
  const expectedNonce = AppOidcHandling.readOidcCookie(ctx.req, 'oidc_nonce')
  const codeVerifier = AppOidcHandling.readOidcCookie(ctx.req, 'oidc_code_verifier')
  const returnTo = decodeURIComponent(AppOidcHandling.readOidcCookie(ctx.req, 'oidc_return_to') || '/')

  if (!expectedState || !expectedNonce || !codeVerifier) {
    console.warn('OIDC callback missing tamper cookies', { expectedState, expectedNonce, codeVerifier })
    return ctx.text('Missing login state', 400)
  }

  const url = new URL(ctx.req.url)
  const authorizationServer = await AppOidcHandling.getOrDiscoverAuthorizationServer()
  const client: oauth.Client = { client_id: settings.oidcClientId }
  const clientAuth = oauth.ClientSecretPost(settings.oidcClientSecret)
  const redirectUri = new URL('/oidc/callback', ctx.req.url).toString()

  let params: URLSearchParams
  try {
    params = oauth.validateAuthResponse(authorizationServer, client, url, expectedState)
  } catch (error) {
    if (error instanceof oauth.AuthorizationResponseError) {
      return ctx.text(
        `OpenID Connect error: ${error.error}${error.error_description ? ` - ${error.error_description}` : ''}`,
        400,
      )
    }
    return ctx.text('Invalid authorization response', 400)
  }

  const authorizationCodeResponse = await oauth.authorizationCodeGrantRequest(
    authorizationServer,
    client,
    clientAuth,
    params,
    redirectUri,
    codeVerifier,
  )

  const tokenResult = await oauth.processAuthorizationCodeResponse(
    authorizationServer,
    client,
    authorizationCodeResponse,
    {
      expectedNonce,
      requireIdToken: true,
    },
  )

  const idToken = tokenResult.id_token
  if (!idToken) {
    return ctx.text('Missing ID token in token response', 500)
  }

  const decodedIdToken = decodeJwtToken(idToken)

  const user: CurrentUser = {
    id: decodedIdToken.payload.sub! as string,
    name: decodedIdToken.payload.name as string || decodedIdToken.payload.preferred_username as string || 'Unknown',
    email: decodedIdToken.payload.email as string || 'Unknown',
    firstName: decodedIdToken.payload.given_name as string || '',
    lastName: decodedIdToken.payload.family_name as string || '',
    idToken: idToken,
    accessToken: tokenResult.access_token || '',
  }

  await AppSession.assignAuthenticatedUser(ctx, user)

  const response = ctx.redirect(returnTo, 302)
  AppOidcHandling.clearOidcCookie(response.headers, 'oidc_state')
  AppOidcHandling.clearOidcCookie(response.headers, 'oidc_nonce')
  AppOidcHandling.clearOidcCookie(response.headers, 'oidc_code_verifier')
  AppOidcHandling.clearOidcCookie(response.headers, 'oidc_return_to')

  return response
})

oidcApp.get('/logout', async (ctx) => {
  if (!settings.oidcIssuer) {
    return ctx.text('Missing OIDC_ISSUER', 500)
  }

  const currentUser = await AppSession.getAuthenticatedUser(ctx)

  const idToken = currentUser?.idToken
  if (!idToken) {
    return ctx.redirect('/')
  }

  await AppSession.unassignAuthenticatedUser(ctx)

  const logoutUrl = new URL(
    'protocol/openid-connect/logout',
    settings.oidcIssuer.endsWith('/') ? settings.oidcIssuer : `${settings.oidcIssuer}/`,
  )
  logoutUrl.searchParams.set('id_token_hint', idToken)
  logoutUrl.searchParams.set(
    'post_logout_redirect_uri',
    new URL('/', ctx.req.url).toString(),
  )

  return ctx.redirect(logoutUrl.toString(), 302)
})
