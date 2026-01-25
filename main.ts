import { Hono } from "hono";
import { getAuthenticatedUser, oidcApp } from "./oidc.ts";


const port = Number(Deno.env.get("PORT")) || 8000;
const app = new Hono();

app.get("/", (c) => {
  console.log("Root path requested");
  const user = getAuthenticatedUser(c.req.raw);
  const userBlock = user
    ? `
        <div class="info">
            <h2>👋 Welcome home</h2>
            <p><strong>${user.name ?? "User"}</strong></p>
            ${user.email ? `<p>${user.email}</p>` : ""}
        </div>`
    : "";
  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fast Tracker</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: white;
        }
        .container {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
        }
        h1 {
            font-size: 3em;
            margin: 0 0 20px 0;
            text-align: center;
        }
        p {
            font-size: 1.2em;
            line-height: 1.6;
            text-align: center;
        }
        .emoji {
            font-size: 4em;
            text-align: center;
            margin: 20px 0;
        }
        .info {
            background: rgba(255, 255, 255, 0.2);
            border-radius: 10px;
            padding: 20px;
            margin-top: 30px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="emoji">🚀</div>
        <h1>Fast Tracker</h1>
        <p>Your personal intermittent fasting tracker</p>
        <p><strong>No ads. No data collection. Just you and your goals.</strong></p>
        
        <div class="info">
            <h2>✨ Hello World!</h2>
            <p>This is a Deno Deploy compatible application.</p>
            <p>Stay tuned for more features coming soon!</p>
        </div>
        ${userBlock}
    </div>
</body>
</html>`,
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    },
  );
});

app.get("/api/health", () => {
  console.log("Health check requested");
  return new Response(
    JSON.stringify({
      status: "ok",
      timestamp: new Date().toISOString(),
      message: "Fast Tracker is running!",
    }),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
    },
  );
});

app.get("/fasts", (c) => {
  const user = getAuthenticatedUser(c.req.raw);
  if (!user) {
    const returnTo = new URL(c.req.url).pathname;
    return c.redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  return c.json({
    user,
    fasts: [],
  });
});

app.route("/", oidcApp);

app.notFound(() => new Response("Not Found", { status: 404 }));

Deno.serve({ port }, app.fetch);

console.log(`Server running on http://localhost:${port}`);