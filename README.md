# fast-tracker

App to help me track my intermittent fasting. Fed up with fasting apps wanting my data or throwing me ads in my face.

## 🚀 Quick Start

This is a Deno Deploy compatible hello-world application.

### Local Development

```bash
# Run the app locally
deno task dev

# Or run directly
deno run --allow-net --allow-env main.ts
```

The app will be available at `http://localhost:8000` (or the port specified by the `PORT` environment variable)

### Deploy to Deno Deploy

1. Fork this repository
2. Go to [Deno Deploy](https://deno.com/deploy)
3. Create a new project and link it to your GitHub repository
4. Set the entry point to `main.ts`
5. Deploy!

## Features

- ✨ Simple hello-world interface
- 🏥 Health check endpoint at `/api/health`
- 🚀 Ready for Deno Deploy
- 🔒 No ads, no data collection

## API Endpoints

- `GET /` - Main application page
- `GET /api/health` - Health check endpoint