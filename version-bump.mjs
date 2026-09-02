import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const targetVersion = process.env.npm_package_version;

/**
 * The files this run rewrote, staged so `npm version` commits the bump in one
 * go. Which files those are depends on what exists, so the list is built here
 * rather than spelled out in the `version` script.
 */
const staged = [];

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, value) => {
	writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
	staged.push(path);
};

const manifest = readJson("manifest.json");
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeJson("manifest.json", manifest);

const versions = readJson("versions.json");
versions[targetVersion] = minAppVersion;
writeJson("versions.json", versions);

// server.json exists once the MCP server is listed in the registry, and carries
// the version twice: once for the server, once for the npm package it points
// at.
if (existsSync("server.json")) {
	const server = readJson("server.json");
	server.version = targetVersion;
	for (const pkg of server.packages ?? []) {
		pkg.version = targetVersion;
	}
	writeJson("server.json", server);
}

execFileSync("git", ["add", ...staged], { stdio: "inherit" });
console.log(`${targetVersion}: ${staged.join(", ")}`);
