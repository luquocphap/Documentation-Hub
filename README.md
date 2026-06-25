# Backend

## Documentation

Module-level documentation lives in [`docs/`](./docs):

- [Auth module](./docs/auth-module.md)
- [Document module](./docs/document-module.md)
- [Comment module](./docs/comment-module.md)
- [Workspace module](./docs/workspace-module.md)
- [Search module](./docs/search-module.md)
- [Activity module](./docs/activity-module.md)

## Running Locally

The backend listens on port `3070` (when running `docker compose up -d`). Some integrations (for example, email
links and webhook callbacks) need a public URL that points back to your
local machine. This guide uses [ngrok](https://ngrok.com/) to expose port
`3070`, then runs the backend with Docker Compose.

### 1. Install and configure ngrok 

-  **Caution:** You can use anything supporting public port instead of ngrok. Ex: [VSCode Studio](https://code.visualstudio.com/docs/debugtest/port-forwarding)

1. Sign up or log in at the [ngrok dashboard](https://dashboard.ngrok.com/).
2. Download the ngrok CLI from the [download page](https://ngrok.com/download)
   and install it for your OS.
3. Verify the installation:

   ```bash
   ngrok help
   ```

4. Get your authtoken from the
   [Your Authtoken](https://dashboard.ngrok.com/get-started/your-authtoken)
   page.
5. Add it to your local ngrok configuration:

   ```bash
   ngrok config add-authtoken <YOUR_NGROK_AUTHTOKEN>
   ```

### 2. Expose the backend port

Start the backend's port `3070` ngrok tunnel:

```bash
ngrok http 3070
```

ngrok prints a public URL (for example, `https://xxxx-xx-xx-xx-xx.ngrok-free.app`).
Keep this terminal running; the tunnel closes if you stop the process.

### 3. Clone the backend source

```bash
git clone https://github.com/luquocphap/Documentation-Hub.git
cd Documentation-Hub
```

### 4. Configure environment variables

Copy the example environment file (if present) or create a `.env` file, then
set the public URL printed by ngrok in step 2 to the relevant variable(s),
for example:

```env
BACKEND_URL=<YOUR PUBLIC URL>
```

Refer to each module's documentation for any additional environment
variables it requires.

### 5. Start the backend

```bash
docker compose up -d
```

This builds and starts the backend (and its dependencies, such as MongoDB
and Redis) in the background.

Access to [SwaggerUI](http://localhost:3069/api/docs) page.

### Notes

- The ngrok URL changes every time you restart the tunnel unless you are on
  a paid plan with a reserved domain. Update the `.env` file and restart the
  backend whenever the URL changes.
- Keep the `ngrok http 3070` process running for as long as you need the
  public URL to stay reachable.
