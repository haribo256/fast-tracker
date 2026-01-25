export interface AppSettings {
  port: number
  sessionSecret: string
  oidcIssuer: string
  oidcClientId: string
  oidcClientSecret: string
  oidcWellKnownUrl: string
}

export function useSettings(): AppSettings {
  return {
    port: Number(getOptionalEnvVar('PORT', '8000')),
    sessionSecret: getRequiredEnvVar('SESSION_SECRET'),
    oidcIssuer: getRequiredEnvVar('OIDC_ISSUER'),
    oidcClientId: getRequiredEnvVar('OIDC_CLIENT_ID'),
    oidcClientSecret: getRequiredEnvVar('OIDC_CLIENT_SECRET'),
    oidcWellKnownUrl: getRequiredEnvVar('OIDC_WELL_KNOWN_URL'),
  }
}

function getOptionalEnvVar(name: string, defaultValue: string | undefined): string | undefined {
  const value = Deno.env.get(name)
  return value ?? defaultValue
}

function getRequiredEnvVar(name: string): string {
  const value = Deno.env.get(name)
  if (!value) {
    throw new Error(`Environment variable ${name} is required but not set.`)
  }
  return value
}
