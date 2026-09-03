import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const targetVersion = process.env.npm_package_version;

/** The files this run rewrote, staged so `npm version` commits the bump in one go. */
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

// server.json carries the version twice: once for the server the MCP registry
// indexes, once for the npm package that listing points at.
const server = readJson("server.json");
server.version = targetVersion;
for (const pkg of server.packages) {
	pkg.version = targetVersion;
}
writeJson("server.json", server);

execFileSync("git", ["add", ...staged], { stdio: "inherit" });
console.log(`${targetVersion}: ${staged.join(", ")}`);
