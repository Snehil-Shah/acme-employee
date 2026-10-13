// Production entry point: serves the built site and the API on one port.
// On first boot it clones the company repo from GitHub onto the volume.
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const PORT = Number(process.env.PORT || 8080);
const SITE = resolve("dist");
const REPO = resolve(process.env.EMPLOYEE_REPO || "..");

function bootstrap() {
	const remote = process.env.GITHUB_REPO;
	if (!existsSync(join(REPO, ".git"))) {
		if (!remote) throw new Error(`No company repo at ${REPO}, and GITHUB_REPO isn't set to clone one.`);
		console.log(`Cloning ${remote} into ${REPO}`);
		execFileSync("git", ["clone", `https://github.com/${remote}.git`, REPO], { stdio: "inherit" });
		// A clone brings neither the notes (fairness verdicts, decisions) nor local
		// proposal branches; without them the workbench wouldn't know about
		// earlier proposals.
		execFileSync("git", ["fetch", "origin", "+refs/heads/proposal/*:refs/heads/proposal/*", "+refs/notes/*:refs/notes/*"], {
			cwd: REPO,
			stdio: "inherit",
		});
	}
	// Pick up commits made on GitHub since (framework updates, README edits) by
	// fast-forwarding main. Only ever a fast-forward: if main has moved on here
	// too, it's left alone and the next push reports the divergence.
	if (remote) {
		try {
			execFileSync("git", ["fetch", "origin", "main"], { cwd: REPO, stdio: "inherit" });
			execFileSync("git", ["merge", "--ff-only", "origin/main"], { cwd: REPO, stdio: "inherit" });
		} catch {
			console.warn("main couldn't fast-forward to origin/main; leaving it as it is");
		}
	}
	// Decisions are committed as whoever runs the workbench. On the public demo
	// that's a demo identity, not a real person.
	const name = process.env.APPROVER_NAME;
	const email = process.env.APPROVER_EMAIL;
	if (name) execFileSync("git", ["config", "user.name", name], { cwd: REPO });
	if (email) execFileSync("git", ["config", "user.email", email], { cwd: REPO });
}

const TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript",
	".css": "text/css",
	".svg": "image/svg+xml",
	".png": "image/png",
	".ico": "image/x-icon",
	".json": "application/json",
};

function serveStatic(url: string, res: import("node:http").ServerResponse) {
	const path = normalize(join(SITE, decodeURIComponent(url.split("?")[0])));
	const file = path.startsWith(SITE) && existsSync(path) && statSync(path).isFile() ? path : join(SITE, "index.html");
	res.setHeader("content-type", TYPES[extname(file)] ?? "application/octet-stream");
	if (file.includes(`${SITE}/assets/`)) res.setHeader("cache-control", "public, max-age=31536000, immutable");
	res.end(readFileSync(file));
}

bootstrap();
// Imported after bootstrap: the API reads the company repo as it loads.
const { handle } = await import("./api.ts");
const { reconcile } = await import("./github.ts");
const { allEvents } = await import("./store.ts");
const { pullRequest } = await import("./repo.ts");
void reconcile(allEvents(), pullRequest);

createServer((req, res) => {
	if (req.url?.startsWith("/api/")) {
		handle(req, res).catch((err: Error) => {
			console.error(err);
			if (!res.headersSent) {
				res.statusCode = 500;
				res.setHeader("content-type", "application/json");
			}
			res.end(JSON.stringify({ error: err.message }));
		});
	} else {
		serveStatic(req.url ?? "/", res);
	}
}).listen(PORT, () => console.log(`Workbench on :${PORT}, company repo at ${REPO}`));
