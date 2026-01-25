import { Context } from 'hono'
import { Session } from '@hono/session'
import { Handler } from 'hono'

export interface SessionData {
  currentUser?: CurrentUser
}

export interface CurrentUser {
  id: string
  name: string
  email: string
  firstName: string
  lastName: string
  idToken: string
  accessToken: string
}

export class AppSession {
  public static async assignAuthenticatedUser(ctx: Context, user: CurrentUser) {
    const session = ctx.get('session') as Session<SessionData>

    const data: SessionData = await session.get() ?? {}
    data.currentUser = user

    await session.update(data)
  }

  public static async unassignAuthenticatedUser(ctx: Context) {
    const session = ctx.get('session') as Session<SessionData>

    const data: SessionData = await session.get() ?? {}
    data.currentUser = undefined

    await session.update(data)
  }

  public static async getAuthenticatedUser(ctx: Context): Promise<CurrentUser | undefined> {
    const session = ctx.get('session') as Session<SessionData>
    const data: SessionData | null = await session.get()
    return data?.currentUser ?? undefined
  }

  public static async isAuthenticated(ctx: Context): Promise<boolean> {
    const session = ctx.get('session') as Session<SessionData>
    const data: SessionData | null = await session.get()
    return data?.currentUser !== undefined
  }
}

export function requireAuthenticated(fn: (ctx: Context, user: CurrentUser) => Promise<Response>): Handler {
  return async (ctx: Context) => {
    const user = await AppSession.getAuthenticatedUser(ctx)
    if (!user) {
      const returnTo = encodeURIComponent(ctx.req.path)
      return ctx.redirect(`/login?returnTo=${returnTo}`, 302)
    }

    return await fn(ctx, user)
  }
}

export function allowAnonymous(fn: (ctx: Context, user: CurrentUser | undefined) => Promise<Response>): Handler {
  return async (ctx: Context) => {
    const user = await AppSession.getAuthenticatedUser(ctx)
    return await fn(ctx, user)
  }
}
