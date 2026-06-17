/**
 * Plan file management utilities.
 *
 * Plans are stored in .pi/plans/ as markdown files with YAML frontmatter.
 * Status is tracked via frontmatter: draft | approved | in_progress | done.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { parseFrontmatter as parseSdkFrontmatter } from "@earendil-works/pi-coding-agent";

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

function sanitizeFilename(name: string): string {
	return name
		.replace(/\.md$/i, "")
		.replace(/[^a-zA-Z0-9_-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.toLowerCase()
		.slice(0, 120);
}

/**
 * Parse YAML frontmatter using the SDK's parser (handles colons, quotes, multi-line).
 * Returns typed PlanMetadata fields and the body content.
 */
function parseFrontmatter(raw: string): {
	metadata: Partial<PlanMetadata>;
	body: string;
} {
	const { frontmatter, body } = parseSdkFrontmatter(raw);

	// Cast from unknown (SDK returns Record<string, unknown>)
	const cast = (v: unknown): string | undefined =>
		typeof v === "string" ? v : undefined;

	const s = cast(frontmatter.status);
	const t = cast(frontmatter.type);

	return {
		metadata: {
			title: cast(frontmatter.title),
			status: (s === "draft" ||
			s === "approved" ||
			s === "in_progress" ||
			s === "done"
				? s
				: undefined) as
				| "draft"
				| "approved"
				| "in_progress"
				| "done"
				| undefined,
			created: cast(frontmatter.created),
			updated: cast(frontmatter.updated),
			type: (t === "feature" || t === "fix" || t === "refactor" || t === "chore"
				? t
				: undefined) as "feature" | "fix" | "refactor" | "chore" | undefined,
		},
		body,
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

/**
 * Resolve a plan filename to a file path (exact + fuzzy match).
 * Extracted from readPlanFile so edit functions can reuse.
 */
function resolvePlanPath(cwd: string, filename: string): string | null {
	const planDir = path.join(cwd, PLANS_DIR);
	const safeName = sanitizeFilename(filename);

	let filepath = path.join(planDir, `${safeName}.md`);
	if (!fs.existsSync(filepath)) {
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
	return filepath;
}

/** Escape regex special characters in a string for literal matching. */
function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
	const filepath = resolvePlanPath(cwd, filename);
	if (!filepath) return null;

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

/**
 * Replace a section of a plan file by heading name.
 * Finds "## SectionName" heading, replaces content between it and the next
 * "## " heading (or EOF). Preserves all other sections unchanged.
 */
export function editPlanSection(
	cwd: string,
	filename: string,
	sectionName: string,
	newContent: string,
): PlanFile {
	const filepath = resolvePlanPath(cwd, filename);
	if (!filepath) {
		throw new Error(
			`Plan not found: "${filename}". Use plan_list to see available plans.`,
		);
	}

	const raw = fs.readFileSync(filepath, "utf-8");
	const { metadata: fm, body } = parseFrontmatter(raw);

	// Find the section heading (case-insensitive match on the heading text)
	const sectionRegex = new RegExp(
		`^##\\s+${escapeRegex(sectionName)}\\s*$`,
		"im",
	);
	const match = body.match(sectionRegex);
	if (!match || match.index === undefined) {
		throw new Error(
			`Section "${sectionName}" not found in plan "${filename}". ` +
				`Available sections: ${
					body
						.match(/^##\s+(.+)$/gm)
						?.map((h) => h.replace(/^##\s+/, ""))
						.join(", ") || "none"
				}`,
		);
	}

	const sectionStart = match.index;
	const afterHeading = sectionStart + match[0].length;

	// Find next ## heading after this section
	const rest = body.slice(afterHeading);
	const nextSectionMatch = rest.match(/^##\s+/m);
	const nextIndex = nextSectionMatch?.index;

	const before = body.slice(0, sectionStart);
	const after = nextIndex != null ? rest.slice(nextIndex) : "";

	const newBody = `${before}${match[0]}

${newContent.trim()}

${after}`.trimEnd();

	const fullMetadata: PlanMetadata = {
		title: fm.title ?? path.basename(filepath, ".md"),
		status: fm.status ?? "draft",
		created: fm.created ?? new Date().toISOString(),
		type: fm.type ?? "feature",
		updated: new Date().toISOString(),
	};

	const fullContent = serializeFrontmatter(fullMetadata) + newBody;
	fs.writeFileSync(filepath, fullContent, "utf-8");

	return {
		filename: path.basename(filepath),
		metadata: fullMetadata,
		content: newBody,
	};
}

/**
 * Fully replace the content of a plan file.
 * Old content is preserved as a "Previous Version" appendix at the bottom.
 * Updates the `updated` timestamp in frontmatter.
 */
export function replacePlanContent(
	cwd: string,
	filename: string,
	newContent: string,
): PlanFile {
	const filepath = resolvePlanPath(cwd, filename);
	if (!filepath) {
		throw new Error(
			`Plan not found: "${filename}". Use plan_list to see available plans.`,
		);
	}

	const raw = fs.readFileSync(filepath, "utf-8");
	const { metadata: fm, body: oldContent } = parseFrontmatter(raw);

	const previousSection = `\n\n## Previous Version\n\n${oldContent.trim()}`;
	const newBody = newContent.trim() + previousSection;

	const fullMetadata: PlanMetadata = {
		title: fm.title ?? path.basename(filepath, ".md"),
		status: fm.status ?? "draft",
		created: fm.created ?? new Date().toISOString(),
		type: fm.type ?? "feature",
		updated: new Date().toISOString(),
	};

	const fullContent = serializeFrontmatter(fullMetadata) + newBody;
	fs.writeFileSync(filepath, fullContent, "utf-8");

	return {
		filename: path.basename(filepath),
		metadata: fullMetadata,
		content: newBody,
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

	createPlanFile(cwd, filename, plan.content, plan.metadata);
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
