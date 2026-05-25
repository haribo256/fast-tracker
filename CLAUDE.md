# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Start dev server with hot reload (localhost:8000 by default)
deno task dev

# Run production server
deno task start

# Format code (Deno's built-in formatter, configured in deno.json)
deno fmt

# Lint code
deno lint
```

The `PORT` environment variable can be set to use a different port.

## Architecture Overview

**fast-tracker** is a privacy-focused intermittent fasting tracker built with Deno, Hono, and OIDC authentication. The app structure centers on three layers:

### Authentication & Sessions
- **OIDC Flow** (`src/oidc.ts`): Handles OAuth 2.0/OpenID Connect discovery and token exchange with an external OIDC provider. Uses `oauth4webapi` for spec-compliant OAuth handling. The authorization server is discovered at startup from the `OIDC_ISSUER` URL and cached.
- **Session Management** (`src/session.ts`): Wraps `@hono/session` to store authenticated user data (`CurrentUser` interface) in server-side sessions. Sessions are keyed via HTTP cookies. The `AppSession` static class provides helpers to get/set the current user in the session.
- **Middleware** (`src/main.ts`): Routes are guarded by `allowAnonymous()` or `requireAuthenticated()` middleware that attaches the current user (or null) to the Hono context.

### Configuration
- **Settings** (`src/settings.ts`): Centralizes environment variable reading with required/optional validation. All OIDC settings, session secret, and port come from env vars—no hardcoded values.

### Web Layer
- **Hono App** (`src/main.ts`): HTTP server with routes for the main page (with conditional user welcome block) and health checks. Uses Hono's HTML helper for server-side rendering.

## Key Design Patterns

1. **Environment-driven config**: No config files—all settings come from `Deno.env`. This supports Deno Deploy seamlessly.
2. **Session-based auth**: User identity persists across requests via server-side sessions, not JWTs in the response body.
3. **OIDC discovery**: The OIDC server URL is discovered dynamically at startup (supporting multiple OIDC providers without code changes).
4. **Middleware guards**: Routes use middleware to check authentication status and inject the user into context, avoiding repeated session lookups.

## Required Environment Variables

- `SESSION_SECRET` - Secret key for signing session cookies
- `OIDC_ISSUER` - URL of the OIDC provider (e.g., https://auth.example.com)
- `OIDC_CLIENT_ID` - OAuth client ID
- `OIDC_CLIENT_SECRET` - OAuth client secret
- `OIDC_WELL_KNOWN_URL` - OIDC discovery endpoint (optional, derived from issuer)
- `PORT` - Server port (default: 8000)

## Deployment

The app is configured for Deno Deploy (see `deno.json` deploy section). Fork the repo, link to Deno Deploy, set entry point to `src/main.ts`, provide env vars, and deploy.

## Current State

The app has authentication infrastructure in place but lacks fasting tracking features—the main page is a placeholder welcome page. Future work should implement the core fasting tracker UI and backend logic.
