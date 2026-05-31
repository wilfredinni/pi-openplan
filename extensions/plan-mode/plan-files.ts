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

export function sanitizeFilename(name: string, preservePath?: boolean): string {
	if (preservePath) {
		// Preserve directory separators — sanitize each component independently
		const parts = name.replace(/\.md$/i, "").split("/");
		return parts
			.map((p) =>
				p
					.replace(/[^a-zA-Z0-9_-]/g, "-")
					.replace(/-+/g, "-")
					.replace(/^-|-$/g, "")
					.toLowerCase()
					.slice(0, 120),
			)
			.join("/");
	}
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
		const kv = line.match(/^([\w-]+):\s*(.+)\s*$/);
		if (kv) frontmatter[kv[1]] = kv[2].replace(/^"(.*)"$/, "$1").trim();
	}

	const s = frontmatter.status;
	const t = frontmatter.type;

	return {
		metadata: {
			title: frontmatter.title,
			status:
				s === "draft" || s === "approved" || s === "in_progress" || s === "done"
					? s
					: undefined,
			created: frontmatter.created,
			updated: frontmatter.updated,
			type:
				t === "feature" || t === "fix" || t === "refactor" || t === "chore"
					? t
					: undefined,
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
			// Prefer exact suffix match (date-prefix convention: YYYY-MM-DD-name.md)
			const suffixMatch = files.find(
				(f) =>
					f.toLowerCase().endsWith(`-${safeName}.md`) ||
					f.toLowerCase().endsWith(`${safeName}.md`),
			);
			const match =
				suffixMatch ??
				files.find(
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
	const entries = fs.readdirSync(planDir, { recursive: true });

	for (const entry of entries) {
		const file = typeof entry === "string" ? entry : String(entry);
		if (!file.endsWith(".md")) continue;

		// Read plan file directly from resolved path — readPlanFile uses
		// sanitizeFilename which mangles subdirectory paths (e.g. "subdir/plan" → "subdir-plan").
		const filepath = path.join(planDir, file);
		if (!fs.existsSync(filepath)) continue;

		const raw = fs.readFileSync(filepath, "utf-8");
		const { metadata, body } = parseFrontmatter(raw);

		const plan: PlanFile = {
			filename: file,
			metadata: {
				title:
					metadata.title && metadata.title.length > 0
						? metadata.title
						: path.basename(file, ".md"),
				status:
					metadata.status &&
					["draft", "approved", "in_progress", "done"].includes(metadata.status)
						? metadata.status
						: "draft",
				created: metadata.created ?? new Date().toISOString(),
				type:
					metadata.type &&
					["feature", "fix", "refactor", "chore"].includes(metadata.type)
						? metadata.type
						: "feature",
				updated: metadata.updated,
			},
			content: body,
		};

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

	// Write back to the SAME file that was found
	const planDir = path.join(cwd, PLANS_DIR);
	const filepath = path.join(planDir, plan.filename);
	const fullContent = serializeFrontmatter(plan.metadata) + plan.content;
	fs.mkdirSync(path.dirname(filepath), { recursive: true });
	fs.writeFileSync(filepath, fullContent, "utf-8");

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
