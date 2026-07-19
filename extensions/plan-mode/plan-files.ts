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

	// 1. Exact match
	let filepath = path.join(planDir, `${safeName}.md`);
	if (fs.existsSync(filepath)) return filepath;

	try {
		const files = fs.readdirSync(planDir);

		// 2. Starts-with match (e.g. "2026-07-18-fix-" matches "2026-07-18-fix-bugs")
		const prefixMatch = files.find((f) => {
			const base = path.basename(f, ".md");
			return base.startsWith(safeName);
		});
		if (prefixMatch) {
			filepath = path.join(planDir, prefixMatch);
			return fs.existsSync(filepath) ? filepath : null;
		}

		// 3. Substring match (case-insensitive)
		const fuzzyMatch = files.find(
			(f) => f.toLowerCase().includes(safeName) && f.endsWith(".md"),
		);
		if (fuzzyMatch) {
			filepath = path.join(planDir, fuzzyMatch);
			return fs.existsSync(filepath) ? filepath : null;
		}

		return null;
	} catch {
		return null;
	}
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
 * Matches heading text after the leading `#{1,6} ` prefix, case-insensitive.
 * Strips trailing decoration (⏸️, **PAUSE**, ---, etc.) from the heading match.
 * Section ends at the next heading of same-or-higher level, or EOF.
 * Preserves all other sections unchanged.
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

	// Strip trailing decoration from the section-name parameter so
	// "Phase 1: Setup ⏸️ **PAUSE**" can be matched with "Phase 1: Setup"
	const cleanName = sectionName
		.replace(/\s+⏸.*$/, "")
		.replace(/\s+\*\*PAUSE\*\*.*$/, "")
		.replace(/\s+---\s*$/, "")
		.trim();

	// Match any heading level (1-6) with the given text, case-insensitive.
	// The matched heading line may carry trailing decoration which we ignore.
	// Use [^\S\n] (non-newline whitespace) to avoid crossing lines.
	const sectionRegex = new RegExp(
		`^(#{1,6})[^\\S\\n]+${escapeRegex(cleanName)}(?:[^\\S\\n]+[^\\n]*)?[^\\S\\n]*$`,
		"im",
	);
	const match = body.match(sectionRegex);
	if (!match || match.index === undefined) {
		throw new Error(
			`Section "${sectionName}" not found in plan "${filename}". ` +
				`Available sections: ${
					body
						.match(/^#{1,6}\s+(.+)$/gm)
						?.map((h) => h.replace(/^#{1,6}\s+/, ""))
						.join(", ") || "none"
				}`,
		);
	}

	const headingLevel = match[1].length; // number of # chars
	const sectionStart = match.index;
	const afterHeading = sectionStart + match[0].length;

	// Find next heading of same-or-higher level (equal or fewer # chars)
	const rest = body.slice(afterHeading);
	const nextBoundaryRegex = new RegExp(`^#{1,${headingLevel}}\\s+`, "m");
	const nextMatch = rest.match(nextBoundaryRegex);
	const nextIndex = nextMatch?.index;

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
	const { metadata: fm } = parseFrontmatter(raw);

	const newBody = newContent.trim();

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

		// Guard against directories that happen to end in .md (EISDIR)
		try {
			if (!fs.statSync(filepath).isFile()) continue;
		} catch {
			continue;
		}

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
	// Resolve the exact filepath (supports fuzzy matching) — avoids
	// createPlanFile recomputing a different path via sanitizeFilename.
	const filepath = resolvePlanPath(cwd, filename);
	if (!filepath) return null;

	const raw = fs.readFileSync(filepath, "utf-8");
	const { metadata, body } = parseFrontmatter(raw);

	const fullMetadata: PlanMetadata = {
		title: metadata.title ?? path.basename(filepath, ".md"),
		status,
		created: metadata.created ?? new Date().toISOString(),
		type: metadata.type ?? "feature",
		updated: new Date().toISOString(),
	};

	const fullContent = serializeFrontmatter(fullMetadata) + body;
	fs.writeFileSync(filepath, fullContent, "utf-8");

	return {
		filename: path.basename(filepath),
		metadata: fullMetadata,
		content: body,
	};
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
