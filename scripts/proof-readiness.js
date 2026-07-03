import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const checks = [
  commandCheck("rustc", ["--version"], "Rust compiler"),
  commandCheck("cargo", ["--version"], "Cargo"),
  commandCheck("cargo", ["odra", "--help"], "cargo-odra", { optional: true }),
  rustTargetCheck("wasm32-unknown-unknown"),
  fileCheck("proof/testnet-proof.template.json", "Testnet proof template"),
  fileCheck(".env.example", "Environment template")
];

const missingRequired = checks.filter((check) => check.required && !check.ok);

for (const check of checks) {
  const marker = check.ok ? "ok" : check.required ? "missing" : "optional-missing";
  console.log(`${marker}: ${check.name}${check.detail ? ` (${check.detail})` : ""}`);
}

if (missingRequired.length > 0) {
  console.error("Proof readiness failed.");
  process.exit(1);
}

console.log("proof readiness ok");

function commandCheck(command, args, name, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return {
    name,
    ok: result.status === 0,
    required: options.optional !== true,
    detail: result.status === 0 ? firstLine(result.stdout || result.stderr) : firstLine(result.stderr)
  };
}

function rustTargetCheck(target) {
  const result = spawnSync("rustup", ["target", "list", "--installed"], { encoding: "utf8" });
  const ok = result.status === 0 && result.stdout.split(/\s+/).includes(target);
  return {
    name: `Rust target ${target}`,
    ok,
    required: false,
    detail: ok ? target : "install with: rustup target add wasm32-unknown-unknown"
  };
}

function fileCheck(path, name) {
  return { name, ok: existsSync(path), required: true, detail: path };
}

function firstLine(value = "") {
  return value.trim().split("\n")[0] || "";
}
