/**
 * Plan file management utilities.
 *
 * Plans are stored in .pi/plans/ as markdown files with YAML frontmatter.
 * Status is tracked via frontmatter: draft | approved | in_progress | done.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const PLANS_DIR = ".pi/plans";

export interface PlanMetadata {
	title: string;
	status: "draft" | "approved" | "in_progress" | "done";
	created: string;
	updated?: string;
	version: number;
	previousVersion?: string;
	type: "feature" | "fix" | "refactor" | "chore";
}

export interface PlanFile {
	filename: string;
	metadata: PlanMetadata;
	content: string;
}

function ensurePlansDir(cwd: string): string {
	const dir = path.join(cwd, PLANS_DIR);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	return dir;
}

function sanitizeFilename(name: string): string {
	return name
		.replace(/\.md$/i, "")
		.replace(/[^a-zA-Z0-9_-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.toLowerCase()
		.slice(0, 120);
}

function parseFrontmatter(raw: string): {
	metadata: Partial<PlanMetadata>;
	body: string;
} {
	const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) return { metadata: {}, body: raw };

	const frontmatter: Record<string, string> = {};
	for (const line of match[1].split("\n")) {
		const kv = line.match(/^(\w+):\s*"?(.+?)"?\s*$/);
		if (kv) frontmatter[kv[1]] = kv[2].replace(/^"|"$/g, "");
	}

	return {
		metadata: {
			title: frontmatter.title,
			status: frontmatter.status as PlanMetadata["status"],
			created: frontmatter.created,
			updated: frontmatter.updated,
			type: frontmatter.type as PlanMetadata["type"],
		},
		body: match[2].trim(),
	};
}

function serializeFrontmatter(metadata: PlanMetadata): string {
	const lines = [
		"---",
		`title: "${metadata.title}"`,
		`status: ${metadata.status}`,
		`created: "${metadata.created}"`,
	];
	if (metadata.updated) lines.push(`updated: "${metadata.updated}"`);
	lines.push(`version: ${metadata.version}`);
	if (metadata.previousVersion)
		lines.push(`previousVersion: "${metadata.previousVersion}"`);
	lines.push(`type: ${metadata.type}`);
	lines.push("---");
	return `${lines.join("\n")}\n\n`;
}

export function createPlanFile(
	cwd: string,
	filename: string,
	content: string,
	metadata: PlanMetadata,
): { path: string } {
	const planDir = ensurePlansDir(cwd);
	const safeName = `${sanitizeFilename(filename)}.md`;
	const filepath = path.join(planDir, safeName);

	const fullContent = serializeFrontmatter(metadata) + content;

	// Ensure parent dir exists (in case of subdirs like pending/)
	fs.mkdirSync(path.dirname(filepath), { recursive: true });
	fs.writeFileSync(filepath, fullContent, "utf-8");

	return { path: filepath };
}

export function readPlanFile(cwd: string, filename: string): PlanFile | null {
	const planDir = path.join(cwd, PLANS_DIR);
	const safeName = sanitizeFilename(filename);

	// Try exact match first
	let filepath = path.join(planDir, `${safeName}.md`);
	if (!fs.existsSync(filepath)) {
		// Try fuzzy match in plans dir
		try {
			const files = fs.readdirSync(planDir);
			const match = files.find(
				(f) => f.toLowerCase().includes(safeName) && f.endsWith(".md"),
			);
			if (match) filepath = path.join(planDir, match);
			else return null;
		} catch {
			return null;
		}
	}

	const raw = fs.readFileSync(filepath, "utf-8");
	const { metadata, body } = parseFrontmatter(raw);

	return {
		filename: path.basename(filepath),
		metadata: {
			title: metadata.title ?? path.basename(filepath, ".md"),
			status: metadata.status ?? "draft",
			created: metadata.created ?? new Date().toISOString(),
			version: metadata.version ?? 1,
			type: metadata.type ?? "feature",
			updated: metadata.updated,
		},
		content: body,
	};
}

export function listPlans(
	cwd: string,
	status?: PlanMetadata["status"],
): PlanFile[] {
	const planDir = path.join(cwd, PLANS_DIR);
	if (!fs.existsSync(planDir)) return [];

	const plans: PlanFile[] = [];
	const files = fs.readdirSync(planDir, { recursive: true }) as string[];

	for (const file of files) {
		if (!file.endsWith(".md")) continue;
		const plan = readPlanFile(cwd, file.replace(/\.md$/, ""));
		if (!plan) continue;
		if (status && plan.metadata.status !== status) continue;
		plans.push(plan);
	}

	return plans.sort(
		(a, b) =>
			new Date(b.metadata.created).getTime() -
			new Date(a.metadata.created).getTime(),
	);
}

export function updatePlanStatus(
	cwd: string,
	filename: string,
	status: PlanMetadata["status"],
): PlanFile | null {
	const plan = readPlanFile(cwd, filename);
	if (!plan) return null;

	plan.metadata.status = status;
	plan.metadata.updated = new Date().toISOString();

	createPlanFile(cwd, filename, plan.content, plan.metadata);
	return plan;
}

export function updatePlanContent(
	cwd: string,
	filename: string,
	content: string,
): PlanFile | null {
	const plan = readPlanFile(cwd, filename);
	if (!plan) return null;

	plan.metadata.updated = new Date().toISOString();
	createPlanFile(cwd, filename, content, plan.metadata);
	return plan;
}

export function slugify(text: string): string {
	const date = new Date().toISOString().slice(0, 10);
	const slug = text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 80);
	return `${date}-${slug}`;
}

/**
 * Get the current version of a plan from its frontmatter.
 * Returns 0 if the plan doesn't exist or frontmatter lacks a version.
 */
export function getPlanVersion(cwd: string, filename: string): number {
	const plan = readPlanFile(cwd, filename);
	if (!plan) return 0;
	return plan.metadata.version ?? 1;
}

/**
 * Load custom plan template from .pi/plan-template.md if it exists.
 * Falls back to null (caller should use default).
 */
export function loadCustomTemplate(cwd: string): string | null {
	const templatePath = path.join(cwd, ".pi", "plan-template.md");
	try {
		if (fs.existsSync(templatePath)) {
			return fs.readFileSync(templatePath, "utf-8");
		}
	} catch {
		// Ignore read errors
	}
	return null;
}

/**
 * Save a plan version to the history directory.
 * Returns the path to the saved version file.
 */
export function savePlanVersion(
	cwd: string,
	filename: string,
	content: string,
	metadata: PlanMetadata,
): string {
	const historyDir = path.join(cwd, PLANS_DIR, "history");
	fs.mkdirSync(historyDir, { recursive: true });

	const safeName = sanitizeFilename(filename);
	const versionFile = `${safeName}.v${metadata.version}.md`;
	const versionPath = path.join(historyDir, versionFile);

	const fullContent = serializeFrontmatter(metadata) + content;
	fs.writeFileSync(versionPath, fullContent, "utf-8");

	return versionPath;
}

/**
 * List version history for a plan.
 */
export function listPlanVersions(
	cwd: string,
	filename: string,
): { version: number; file: string; timestamp: string }[] {
	const historyDir = path.join(cwd, PLANS_DIR, "history");
	const safeName = sanitizeFilename(filename);
	const versions: { version: number; file: string; timestamp: string }[] = [];

	try {
		if (!fs.existsSync(historyDir)) return versions;

		const files = fs.readdirSync(historyDir);
		const pattern = new RegExp(`^${safeName}.v(d+).md$`);

		for (const file of files) {
			const match = file.match(pattern);
			if (match) {
				const version = parseInt(match[1], 10);
				const fullPath = path.join(historyDir, file);
				const stat = fs.statSync(fullPath);
				versions.push({
					version,
					file,
					timestamp: stat.mtime.toISOString(),
				});
			}
		}
	} catch {
		// Ignore
	}

	return versions.sort((a, b) => b.version - a.version);
}

/**
 * Build a dependency graph from plan metadata.
 * Returns a map of plan filename to list of dependencies and blockers.
 */
export interface PlanDeps {
	filename: string;
	title: string;
	dependsOn: string[];
	blocks: string[];
	status: PlanMetadata["status"];
}

export function getDependencyGraph(cwd: string): PlanDeps[] {
	const allPlans = listPlans(cwd);
	return allPlans.map((plan) => ({
		filename: plan.filename,
		title: plan.metadata.title,
		dependsOn:
			(plan.metadata as PlanMetadata & { depends_on?: string }).depends_on
				?.split(",")
				.map((s) => s.trim())
				.filter(Boolean) ?? [],
		blocks:
			(plan.metadata as PlanMetadata & { blocks?: string }).blocks
				?.split(",")
				.map((s) => s.trim())
				.filter(Boolean) ?? [],
		status: plan.metadata.status,
	}));
}
