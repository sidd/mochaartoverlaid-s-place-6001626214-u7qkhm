#!/usr/bin/env node
import { Octokit } from "@octokit/rest";
import { config } from "dotenv";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import fetch from "node-fetch";

// Load environment variables
config();

// Configuration
const CONFIG = {
	github: {
		token: process.env.GITHUB_TOKEN!,
		owner: process.env.GITHUB_OWNER!,
		repo: process.env.GITHUB_REPO!,
	},
	roblox: {
		apiKey: process.env.ROBLOX_API_KEY!,
		universeId: process.env.ROBLOX_UNIVERSE_ID!,
		placeId: process.env.ROBLOX_PLACE_ID!,
	},
	pollInterval: parseInt(process.env.POLL_INTERVAL || "30000"), // Default 30 seconds
	stateFile: process.env.STATE_FILE || "./deploy-state.json",
};

// State management
interface DeployState {
	lastProcessedRunId: number | null;
	lastDeployedAt: string | null;
	deploymentHistory: {
		runId: number;
		deployedAt: string;
		commitSha: string;
		success: boolean;
		error?: string;
	}[];
}

let state: DeployState = {
	lastProcessedRunId: null,
	lastDeployedAt: null,
	deploymentHistory: [],
};

function loadState(): void {
	try {
		if (existsSync(CONFIG.stateFile)) {
			const data = readFileSync(CONFIG.stateFile, "utf-8");
			state = JSON.parse(data);
			console.log(`📋 Loaded state: Last processed run ID ${state.lastProcessedRunId}`);
		} else {
			console.log("📋 No previous state found, starting fresh");
		}
	} catch (error) {
		console.error("❌ Error loading state:", error);
	}
}

function saveState(): void {
	try {
		writeFileSync(CONFIG.stateFile, JSON.stringify(state, null, 2));
	} catch (error) {
		console.error("❌ Error saving state:", error);
	}
}

// Validate configuration
function validateConfig(): void {
	const required = [
		"GITHUB_TOKEN",
		"GITHUB_OWNER",
		"GITHUB_REPO",
		"ROBLOX_API_KEY",
		"ROBLOX_UNIVERSE_ID",
		"ROBLOX_PLACE_ID",
	];

	const missing = required.filter((key) => !process.env[key]);

	if (missing.length > 0) {
		console.error("❌ Missing required environment variables:");
		missing.forEach((key) => console.error(`   - ${key}`));
		console.error("\nPlease create a .env file with all required variables.");
		process.exit(1);
	}

	console.log("✅ Configuration validated");
}

// Initialize Octokit
const octokit = new Octokit({
	auth: CONFIG.github.token,
});

async function getLatestSuccessfulRun() {
	try {
		const { data: runs } = await octokit.rest.actions.listWorkflowRunsForRepo({
			owner: CONFIG.github.owner,
			repo: CONFIG.github.repo,
			status: "completed",
			conclusion: "success",
			per_page: 10,
		});

		if (runs.workflow_runs.length === 0) {
			return null;
		}

		// Get the most recent successful run
		const latestRun = runs.workflow_runs[0];

		// Skip if we've already processed this run
		if (state.lastProcessedRunId && latestRun.id <= state.lastProcessedRunId) {
			return null;
		}

		return latestRun;
	} catch (error) {
		console.error("❌ Error fetching workflow runs:", error);
		return null;
	}
}

async function downloadArtifact(runId: number): Promise<Buffer | null> {
	try {
		// List artifacts for this run
		const { data: artifacts } = await octokit.rest.actions.listWorkflowRunArtifacts({
			owner: CONFIG.github.owner,
			repo: CONFIG.github.repo,
			run_id: runId,
		});

		// Find the place-file artifact
		const placeArtifact = artifacts.artifacts.find((a) => a.name === "place-file");

		if (!placeArtifact) {
			console.log("⚠️  No place-file artifact found in this run");
			return null;
		}

		console.log(`📦 Found artifact: ${placeArtifact.name} (${placeArtifact.size_in_bytes} bytes)`);

		// Download the artifact
		const { data: artifactData } = await octokit.rest.actions.downloadArtifact({
			owner: CONFIG.github.owner,
			repo: CONFIG.github.repo,
			artifact_id: placeArtifact.id,
			archive_format: "zip",
		});

		// Convert ArrayBuffer to Buffer
		return Buffer.from(artifactData as ArrayBuffer);
	} catch (error) {
		console.error("❌ Error downloading artifact:", error);
		return null;
	}
}

async function extractPlaceFile(zipBuffer: Buffer): Promise<Buffer | null> {
	try {
		// For simplicity, we'll use the zip data directly
		// In a real implementation, you'd want to properly extract the zip
		// For now, we'll save it temporarily and extract it
		const tempDir = "./temp";
		if (!existsSync(tempDir)) {
			mkdirSync(tempDir);
		}

		const zipPath = join(tempDir, "artifact.zip");
		writeFileSync(zipPath, zipBuffer);

		// Extract zip using system command
		const { execSync } = await import("child_process");
		execSync(`unzip -o "${zipPath}" -d "${tempDir}"`, { stdio: "ignore" });

		// Read the place file
		const placePath = join(tempDir, "place.rbxl");
		if (!existsSync(placePath)) {
			console.error("❌ place.rbxl not found in artifact");
			return null;
		}

		const placeBuffer = readFileSync(placePath);

		// Clean up
		execSync(`rm -rf "${tempDir}"`);

		return placeBuffer;
	} catch (error) {
		console.error("❌ Error extracting place file:", error);
		return null;
	}
}

async function publishToRoblox(placeBuffer: Buffer): Promise<boolean> {
	try {
		console.log("🚀 Publishing to Roblox...");

		const response = await fetch(
			`https://apis.sitetest1.robloxlabs.com/universes/v1/${CONFIG.roblox.universeId}/places/${CONFIG.roblox.placeId}/versions?versionType=Published`,
			{
				method: "POST",
				headers: {
					"x-api-key": CONFIG.roblox.apiKey,
					"Content-Type": "application/octet-stream",
				},
				body: placeBuffer,
			}
		);

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`❌ Roblox API error (${response.status}):`, errorText);
			return false;
		}

		const result = await response.json();
		console.log("✅ Successfully published to Roblox!");
		console.log("📊 Version:", result);

		return true;
	} catch (error) {
		console.error("❌ Error publishing to Roblox:", error);
		return false;
	}
}

async function processNewRun() {
	console.log("\n🔍 Checking for new workflow runs...");

	const run = await getLatestSuccessfulRun();

	if (!run) {
		console.log("⏳ No new runs to process");
		return;
	}

	console.log(`\n🆕 Found new successful run #${run.id}`);
	console.log(`   Branch: ${run.head_branch}`);
	console.log(`   Commit: ${run.head_sha.substring(0, 7)}`);
	console.log(`   Completed: ${new Date(run.updated_at).toLocaleString()}`);

	// Download artifact
	const artifactBuffer = await downloadArtifact(run.id);
	if (!artifactBuffer) {
		console.log("⚠️  Skipping run (no artifact)");
		state.lastProcessedRunId = run.id;
		saveState();
		return;
	}

	// Extract place file
	const placeBuffer = await extractPlaceFile(artifactBuffer);
	if (!placeBuffer) {
		console.log("⚠️  Skipping run (extraction failed)");
		state.lastProcessedRunId = run.id;
		saveState();
		return;
	}

	console.log(`📁 Place file size: ${placeBuffer.length} bytes`);

	// Publish to Roblox
	const success = await publishToRoblox(placeBuffer);

	// Update state
	state.lastProcessedRunId = run.id;
	state.lastDeployedAt = new Date().toISOString();
	state.deploymentHistory.push({
		runId: run.id,
		deployedAt: state.lastDeployedAt,
		commitSha: run.head_sha,
		success,
		error: success ? undefined : "Failed to publish to Roblox",
	});

	// Keep only last 50 deployments in history
	if (state.deploymentHistory.length > 50) {
		state.deploymentHistory = state.deploymentHistory.slice(-50);
	}

	saveState();

	if (success) {
		console.log("\n✨ Deployment completed successfully!");
	} else {
		console.log("\n⚠️  Deployment completed with errors");
	}
}

async function main() {
	console.log("🤖 Roblox Auto-Deploy Bot Starting...\n");

	validateConfig();
	loadState();

	console.log(`📡 Monitoring: ${CONFIG.github.owner}/${CONFIG.github.repo}`);
	console.log(`⏱️  Poll interval: ${CONFIG.pollInterval / 1000}s`);
	console.log(`🎮 Target: Universe ${CONFIG.roblox.universeId}, Place ${CONFIG.roblox.placeId}\n`);

	// Initial check
	await processNewRun();

	// Set up periodic checking
	setInterval(async () => {
		try {
			await processNewRun();
		} catch (error) {
			console.error("❌ Error in polling loop:", error);
		}
	}, CONFIG.pollInterval);

	console.log("\n✅ Bot is running. Press Ctrl+C to stop.\n");
}

// Handle graceful shutdown
process.on("SIGINT", () => {
	console.log("\n\n👋 Shutting down gracefully...");
	saveState();
	process.exit(0);
});

process.on("SIGTERM", () => {
	console.log("\n\n👋 Shutting down gracefully...");
	saveState();
	process.exit(0);
});

// Start the bot
main().catch((error) => {
	console.error("❌ Fatal error:", error);
	process.exit(1);
});

