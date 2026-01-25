import { Hono } from "hono";
import * as oauth from "oauth4webapi";

const openIdClientId = Deno.env.get("OPENID_CLIENT_ID") || "";
const openIdClientSecret = Deno.env.get("OPENID_CLIENT_SECRET") || "";
const openIdIssuerUrl = Deno.env.get("OPENID_ISSUER_URL") || "";

let discoveryCache: Promise<oauth.AuthorizationServer> | null = null;

const getDiscovery = () => {
  if (!discoveryCache) {
    if (!openIdIssuerUrl) {
      throw new Error("Missing OPENID_ISSUER_URL env var");
    }
    const issuer = new URL(openIdIssuerUrl);
    discoveryCache = oauth
      .discoveryRequest(issuer, { algorithm: "oidc" })
      .then((response) => oauth.processDiscoveryResponse(issuer, response));
  }

  return discoveryCache;
};

const buildCookie = (
  name: string,
  value: string,
  options: {
    maxAge?: number;
    httpOnly?: boolean;
    sameSite?: "Lax" | "Strict" | "None";
    secure?: boolean;
    path?: string;
  } = {},
) => {
  const parts = [`${name}=${value}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.secure) parts.push("Secure");
  parts.push(`Path=${options.path || "/"}`);
  return parts.join("; ");
};

const readCookie = (req: Request, name: string) => {
  const cookieHeader = req.headers.get("cookie") || "";
  const cookies = cookieHeader.split(";").map((part) => part.trim());
  for (const cookie of cookies) {
    if (cookie.startsWith(`${name}=`)) {
      return cookie.substring(name.length + 1);
    }
  }
  return null;
};

export const oidcApp = new Hono();

oidcApp.get("/logout", (c) => {
  console.log("Logout path requested");
  if (!openIdIssuerUrl) {
    return c.text("Missing OPENID_ISSUER_URL", 500);
  }

  const idToken = readCookie(c.req.raw, "oidc_id_token");
  if (!idToken) {
    return c.redirect("/");
  }

  const secureCookie = new URL(c.req.url).protocol === "https:";
  const headers = new Headers();
  headers.append(
    "Set-Cookie",
    buildCookie("oidc_access_token", "", {
      httpOnly: true,
      sameSite: "Lax",
      secure: secureCookie,
      maxAge: 0,
    }),
  );
  headers.append(
    "Set-Cookie",
    buildCookie("oidc_id_token", "", {
      httpOnly: true,
      sameSite: "Lax",
      secure: secureCookie,
      maxAge: 0,
    }),
  );
  headers.append(
    "Set-Cookie",
    buildCookie("oidc_state", "", {
      httpOnly: true,
      sameSite: "Lax",
      secure: secureCookie,
      maxAge: 0,
    }),
  );
  headers.append(
    "Set-Cookie",
    buildCookie("oidc_nonce", "", {
      httpOnly: true,
      sameSite: "Lax",
      secure: secureCookie,
      maxAge: 0,
    }),
  );
  headers.append(
    "Set-Cookie",
    buildCookie("oidc_pkce", "", {
      httpOnly: true,
      sameSite: "Lax",
      secure: secureCookie,
      maxAge: 0,
    }),
  );

  const logoutUrl = new URL(
    "protocol/openid-connect/logout",
    openIdIssuerUrl.endsWith("/") ? openIdIssuerUrl : `${openIdIssuerUrl}/`,
  );
  logoutUrl.searchParams.set("id_token_hint", idToken);
  logoutUrl.searchParams.set(
    "post_logout_redirect_uri",
    new URL("/", c.req.url).toString(),
  );

  headers.set("Location", logoutUrl.toString());
  return new Response(null, { status: 302, headers });
});

oidcApp.get("/login", async (c) => {
  console.log("Login path requested");
  if (!openIdClientId) {
    return c.text("Missing OPENID_CLIENT_ID", 500);
  }

  const returnToParam = c.req.query("returnTo") || "/";
  const safeReturnTo = returnToParam.startsWith("/") ? returnToParam : "/";

  const as = await getDiscovery();
  const state = oauth.generateRandomState();
  const nonce = oauth.generateRandomNonce();
  const codeVerifier = oauth.generateRandomCodeVerifier();
  const codeChallenge = await oauth.calculatePKCECodeChallenge(codeVerifier);
  const redirectUri = new URL("/callback", c.req.url).toString();

  const authUrl = new URL(as.authorization_endpoint!);
  authUrl.searchParams.set("client_id", openIdClientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid profile email");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("nonce", nonce);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  const secureCookie = new URL(c.req.url).protocol === "https:";
  const headers = new Headers({ Location: authUrl.toString() });
  headers.append(
    "Set-Cookie",
    buildCookie("oidc_state", state, {
      httpOnly: true,
      sameSite: "Lax",
      secure: secureCookie,
      maxAge: 600,
    }),
  );
  headers.append(
    "Set-Cookie",
    buildCookie("oidc_nonce", nonce, {
      httpOnly: true,
      sameSite: "Lax",
      secure: secureCookie,
      maxAge: 600,
    }),
  );
  headers.append(
    "Set-Cookie",
    buildCookie("oidc_pkce", codeVerifier, {
      httpOnly: true,
      sameSite: "Lax",
      secure: secureCookie,
      maxAge: 600,
    }),
  );
  headers.append(
    "Set-Cookie",
    buildCookie("oidc_return_to", encodeURIComponent(safeReturnTo), {
      httpOnly: true,
      sameSite: "Lax",
      secure: secureCookie,
      maxAge: 600,
    }),
  );
  return new Response(null, { status: 302, headers });
});

oidcApp.get("/callback", async (c) => {
  console.log("Callback path requested");
  const url = new URL(c.req.url);
  const expectedState = readCookie(c.req.raw, "oidc_state");
  const expectedNonce = readCookie(c.req.raw, "oidc_nonce");
  const codeVerifier = readCookie(c.req.raw, "oidc_pkce");
  const returnToCookie = readCookie(c.req.raw, "oidc_return_to");
  const returnTo = returnToCookie
    ? decodeURIComponent(returnToCookie)
    : "/";

  if (!expectedState || !expectedNonce || !codeVerifier) {
    return c.text("Missing login state", 400);
  }

  if (!openIdClientId || !openIdClientSecret) {
    return c.text("Missing OpenID client configuration", 500);
  }

  const as = await getDiscovery();
  const client: oauth.Client = { client_id: openIdClientId };
  const clientAuth = oauth.ClientSecretPost(openIdClientSecret);
  const redirectUri = new URL("/callback", c.req.url).toString();

  let params: URLSearchParams;
  try {
    params = oauth.validateAuthResponse(as, client, url, expectedState);
  } catch (error) {
    if (error instanceof oauth.AuthorizationResponseError) {
      return c.text(
        `OpenID Connect error: ${error.error}${error.error_description ? ` - ${error.error_description}` : ""}`,
        400,
      );
    }
    return c.text("Invalid authorization response", 400);
  }

  const tokenRes = await oauth.authorizationCodeGrantRequest(
    as,
    client,
    clientAuth,
    params,
    redirectUri,
    codeVerifier,
  );

  const tokenResult = await oauth.processAuthorizationCodeResponse(
    as,
    client,
    tokenRes,
    {
      expectedNonce,
      requireIdToken: true,
    },
  );

  const secureCookie = new URL(c.req.url).protocol === "https:";
  const headers = new Headers({
    "content-type": "text/html; charset=utf-8",
  });

  const maxAge = tokenResult.expires_in ?? 3600;
  if (tokenResult.access_token) {
    headers.append(
      "Set-Cookie",
      buildCookie("oidc_access_token", tokenResult.access_token, {
        httpOnly: true,
        sameSite: "Lax",
        secure: secureCookie,
        maxAge,
      }),
    );
  }
  if (tokenResult.id_token) {
    headers.append(
      "Set-Cookie",
      buildCookie("oidc_id_token", tokenResult.id_token, {
        httpOnly: true,
        sameSite: "Lax",
        secure: secureCookie,
        maxAge,
      }),
    );
  }

  headers.append(
    "Set-Cookie",
    buildCookie("oidc_state", "", {
      httpOnly: true,
      sameSite: "Lax",
      secure: secureCookie,
      maxAge: 0,
    }),
  );
  headers.append(
    "Set-Cookie",
    buildCookie("oidc_nonce", "", {
      httpOnly: true,
      sameSite: "Lax",
      secure: secureCookie,
      maxAge: 0,
    }),
  );
  headers.append(
    "Set-Cookie",
    buildCookie("oidc_pkce", "", {
      httpOnly: true,
      sameSite: "Lax",
      secure: secureCookie,
      maxAge: 0,
    }),
  );
  headers.append(
    "Set-Cookie",
    buildCookie("oidc_return_to", "", {
      httpOnly: true,
      sameSite: "Lax",
      secure: secureCookie,
      maxAge: 0,
    }),
  );

  headers.set("Location", returnTo);
  return new Response(null, { status: 302, headers });
});

const base64UrlDecode = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
};

export const getAuthenticatedUser = (req: Request) => {
  const idToken = readCookie(req, "oidc_id_token");
  if (!idToken) {
    return null;
  }
  const parts = idToken.split(".");
  if (parts.length < 2) {
    return null;
  }
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1])) as Record<
      string,
      unknown
    >;
    return {
      name: payload.name ?? payload.preferred_username ?? payload.email ??
        payload.sub,
      email: payload.email,
      username: payload.preferred_username,
      sub: payload.sub,
    };
  } catch {
    return null;
  }
};