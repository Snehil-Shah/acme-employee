import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// The API runs inside the Vite dev server, so `npm run dev` is the whole app.
function api(): Plugin {
	return {
		name: "employee-workbench-api",
		async configureServer(server) {
			const { handle } = await import("./server/api.ts");
			server.middlewares.use((req, res, next) => {
				if (!req.url?.startsWith("/api/")) return next();
				handle(req, res).catch((err: Error) => {
					res.statusCode = 500;
					res.setHeader("content-type", "application/json");
					res.end(JSON.stringify({ error: err.message }));
				});
			});
		},
	};
}

export default defineConfig(({ mode }) => {
	// Server-side code reads plain process.env (GitAgent picks up the API key there).
	Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
	return {
		plugins: [react(), api()],
		server: { port: 4317 },
	};
});
