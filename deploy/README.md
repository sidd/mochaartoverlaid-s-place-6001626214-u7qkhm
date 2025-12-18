# Roblox Auto-Deploy Bot

Automatically monitors GitHub Actions workflow runs and deploys successful builds to Roblox using the Open Cloud API.

## Features

- 🔄 Polls GitHub Actions every 30 seconds for new successful runs
- 📦 Automatically downloads place-file artifacts
- 🚀 Publishes to Roblox using Open Cloud API
- 💾 Tracks deployment state to avoid duplicate deployments
- 📊 Maintains deployment history
- 🛡️ Graceful error handling and recovery

## Setup

### 1. Install Dependencies

```bash
cd deploy
npm install
```

### 2. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

#### GitHub Configuration

- **GITHUB_TOKEN**: Create a [Personal Access Token](https://github.com/settings/tokens)
  - Required scopes: `repo`, `actions:read`
- **GITHUB_OWNER**: Your GitHub username or organization
- **GITHUB_REPO**: Your repository name

#### Roblox Configuration

- **ROBLOX_API_KEY**: Create at [Roblox Creator Dashboard](https://create.roblox.com/credentials)
  - Required permission: `universe-places.write`
- **ROBLOX_UNIVERSE_ID**: Your game's Universe ID
- **ROBLOX_PLACE_ID**: Your place's Place ID

#### Optional Configuration

- **POLL_INTERVAL**: How often to check for new runs (milliseconds, default: 30000)
- **STATE_FILE**: Path to state file (default: ./deploy-state.json)

### 3. Build the TypeScript Code

```bash
npm run build
```

## Usage

### Run the Bot

```bash
npm start
```

The bot will:
1. Validate your configuration
2. Load previous state (if any)
3. Check for new successful workflow runs every 30 seconds
4. Download and publish any new builds to Roblox
5. Save state after each deployment

### Development Mode

Build and run in one command:

```bash
npm run dev
```

Watch for TypeScript changes:

```bash
npm run watch
```

## How It Works

1. **Monitoring**: The bot queries the GitHub Actions API for completed workflow runs
2. **Filtering**: Only processes runs that are:
   - Completed successfully
   - Newer than the last processed run
   - Contain a `place-file` artifact
3. **Downloading**: Downloads the artifact as a zip file
4. **Extracting**: Extracts the `place.rbxl` file from the artifact
5. **Publishing**: Uploads the place file to Roblox via Open Cloud API
6. **State Tracking**: Records the deployment in `deploy-state.json`

## State Management

The bot maintains a state file (`deploy-state.json`) that tracks:
- Last processed workflow run ID
- Last deployment timestamp
- Deployment history (last 50 deployments)

This prevents the bot from redeploying the same build multiple times.

## Running as a Service

### Using systemd (Linux)

Create `/etc/systemd/system/roblox-deploy.service`:

```ini
[Unit]
Description=Roblox Auto-Deploy Bot
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/hubhub-template/deploy
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable roblox-deploy
sudo systemctl start roblox-deploy
sudo systemctl status roblox-deploy
```

### Using PM2 (Cross-platform)

```bash
npm install -g pm2
pm2 start dist/index.js --name roblox-deploy
pm2 save
pm2 startup
```

### Using Docker

Create `Dockerfile`:

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
CMD ["npm", "start"]
```

Build and run:

```bash
docker build -t roblox-deploy .
docker run -d --env-file .env --name roblox-deploy roblox-deploy
```

## Logs and Monitoring

The bot outputs detailed logs:
- ✅ Success messages
- ❌ Error messages
- 📦 Artifact information
- 🚀 Deployment progress

Monitor logs when running as a service:

```bash
# systemd
sudo journalctl -u roblox-deploy -f

# PM2
pm2 logs roblox-deploy
```

## Troubleshooting

### "Missing required environment variables"
Check that your `.env` file exists and contains all required variables.

### "No place-file artifact found"
Ensure your GitHub Actions workflow creates an artifact named `place-file`.

### "Roblox API error"
- Verify your API key has the correct permissions
- Check that Universe ID and Place ID are correct
- Ensure the API key is not expired

### Bot keeps redeploying the same build
Delete or check the `deploy-state.json` file. The bot may have lost track of state.

## Security Notes

- Never commit your `.env` file to git
- Keep your GitHub token and Roblox API key secure
- Use minimal required permissions for tokens
- Run the bot in a secure environment
- Regularly rotate your API keys

## License

MIT

