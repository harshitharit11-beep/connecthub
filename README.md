# ConnectHub

ConnectHub is a Vite + React frontend with an Express API for authentication, real posts, friend search, direct messages, and media messages. The current implementation includes signup, login, logout, session restore, creating posts, loading the real feed, deleting owned posts, searching members, and private chat. Chats support JPG, PNG, and MP4 uploads up to 50 MB through Cloudinary.

## Local development

```powershell
npm install
Copy-Item .env.example .env
npm run dev:all
```

Open `http://localhost:5173`. With the example environment file, the frontend calls `http://localhost:3001/api` directly. The API uses `server/data/users.json` when `DATABASE_URL` is not set. Passwords are bcrypt-hashed.

## Storage and production requirements

Local development has a JSON user store and the default in-memory Express session store. Render's filesystem and process memory are not durable across restarts, so production must set `DATABASE_URL` to a persistent PostgreSQL database. When that variable is present, the API automatically creates the `users`, `posts`, and `session` tables and uses PostgreSQL for both data and sessions. The current tables are:

- `users`: id, username, normalized username, display name, bcrypt password hash, profile image value, and creation time.
- `posts`: id, owning user id, body, and creation time.
- `messages`: id, sender, recipient, optional text, optional media URL/type, and creation time.
- `friendships`: bidirectional user relationships and creation time.

The JSON fallback stores posts in `server/data/posts.json`, messages in `server/data/messages.json`, and friendships in `server/data/friendships.json`. Uploaded media is stored persistently in Cloudinary.

## Netlify deployment

1. Connect the GitHub repository in Netlify.
2. Set **Build command** to `npm run build`.
3. Set **Publish directory** to `dist`.
4. Add the environment variable `VITE_API_URL` with the Render API URL plus `/api`, for example `https://connecthub-api.onrender.com/api`.
5. Deploy. `netlify.toml` supplies the React Router fallback so `/login` and `/profile` survive refreshes.

## Render deployment

Create a Render **Web Service** from the same GitHub repository:

- **Build Command:** `npm install`
- **Start Command:** `node server/index.js`
- **Health Check Path:** `/api/health`

Set these environment variables in Render:

- `NODE_ENV` = `production`
- `SESSION_SECRET` = a long random secret generated in Render
- `FRONTEND_URL` = the exact Netlify URL, for example `https://connecthub.netlify.app`
- `DATABASE_URL` = the Internal Database URL from a persistent Render PostgreSQL database
- `CLOUDINARY_CLOUD_NAME` = your Cloudinary cloud name
- `CLOUDINARY_API_KEY` = your Cloudinary API key
- `CLOUDINARY_API_SECRET` = your Cloudinary API secret

Render supplies `PORT` automatically. The server listens on `0.0.0.0` and uses that value.

After Render gives the service URL, use `https://YOUR-SERVICE.onrender.com/api` as Netlify's `VITE_API_URL`. Then redeploy Netlify after setting the variable. Update `FRONTEND_URL` with the final Netlify URL and redeploy Render if the URL changes.

## GitHub

```powershell
git init
git add .
git commit -m "Prepare ConnectHub for deployment"
git branch -M main
git remote add origin YOUR_GITHUB_URL
git push -u origin main
```

Never commit `.env`, production secrets, local user JSON, database files, or uploaded files. `.gitignore` excludes those local artifacts while keeping `.env.example` available as documentation.

## Verification

Run `npm run build` locally. Before calling the public deployment complete, verify from a private browser window, another computer, and a phone on mobile data: health endpoint, signup, login, logout, refresh on `/profile`, and session persistence. Chat, messages, photo uploads, and video uploads cannot be verified because they are not implemented in this project yet.