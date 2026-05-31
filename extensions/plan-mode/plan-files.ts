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

export function sanitizeFilename(name: string): string {
	return name
		.replace(/\.md$/i, "")
		.replace(/[^a-zA-Z0-9_-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.toLowerCase()
		.slice(0, 120);
}

export function parseFrontmatter(raw: string): {
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
	if (safeName.length === 0) return null;

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

/**
 * Compress natural language text using caveman-compress style rules.
 * Drops filler words, articles, pleasantries, and hedging.
 * Preserves code blocks, inline code, URLs, file paths, and technical terms.
 * Pure text transformation — no LLM call needed.
 *
 * Based on caveman-compress rules (github.com/JuliusBrussee/caveman):
 * - Remove: articles (a/an/the), filler (just/really/basically),
 *   pleasantries (sure/certainly), hedging ("it might be worth")
 * - Preserve EXACTLY: code blocks (fenced), inline code (`backtick`),
 *   URLs, file paths, commands, technical terms
 * - Preserve structure: markdown headings, bullet hierarchy, tables
 */
export function compressText(content: string): string {
	// Split into blocks: code fenced blocks vs regular text
	const parts = content.split(/(```[\s\S]*?```)/);
	return parts
		.map((part, i) => {
			// Even indexes = text outside code blocks, odd = code blocks
			if (i % 2 === 1) return part; // Preserve code blocks exactly
			return compressProse(part);
		})
		.join("");
}

/**
 * Compress a prose segment (no code blocks).
 */
function compressProse(text: string): string {
	// Preserve inline code (`...`) and URLs — mark them as protected regions
	const protectedMarkers: string[] = [];
	const protectedPattern =
		/(`[^`]+`)|(https?:\/\/[^\s]+)|(\/[\w./-]+\.[a-z]+)/gi;

	const marked = text.replace(protectedPattern, (match) => {
		const idx = protectedMarkers.length;
		protectedMarkers.push(match);
		return `\uE000PROTECT${idx}\uE000`;
	});

	// Lines that are pure whitespace or markdown headings preserved as-is
	const lines = marked.split("\n");
	const compressed = lines.map((line) => {
		const trimmed = line.trim();

		// Preserve markdown headings, list markers, and horizontal rules
		if (
			trimmed.startsWith("#") ||
			trimmed.startsWith("- ") ||
			trimmed.startsWith("* ") ||
			trimmed.startsWith("> ") ||
			trimmed.startsWith("|") ||
			trimmed.startsWith("---") ||
			trimmed.startsWith("___") ||
			trimmed.startsWith("***")
		) {
			return line;
		}

		// Preserve frontmatter lines
		if (trimmed.startsWith("---")) {
			return line;
		}

		// Preserve empty lines
		if (!trimmed) {
			return line;
		}

		return compressLine(line);
	});

	const result = compressed.join("\n");

	// Restore protected markers
	return result.replace(
		/\uE000PROTECT(\d+)\uE000/g,
		(_match, idx) => protectedMarkers[parseInt(idx, 10)] ?? _match,
	);
}

/**
 * Compress a single line of prose.
 */
function compressLine(line: string): string {
	let text = line;

	// Filler words to drop (when used as standalone filler, not part of technical terms)
	const fillerPatterns = [
		/\bjust\b/gi,
		/\breally\b/gi,
		/\bbasically\b/gi,
		/\bactually\b/gi,
		/\bsimply\b/gi,
		/\bessentially\b/gi,
		/\bgenerally\b/gi,
		/\bliterally\b/gi,
		/\bquite\b/gi,
		/\brather\b/gi,
		/\bsomewhat\b/gi,
	];

	// Pleasantries / hedging phrases
	const phrasePatterns = [
		/\bin order to\b/gi,
		/\bmake sure to\b/gi,
		/\bremember to\b/gi,
		/\byou should\b/gi,
		/\byou could consider\b/gi,
		/\bits( is)? worth\b/gi,
	];

	// Articles (optional — more aggressive compression)
	const articlePatterns = [/\bthe\b\s+/gi, /\ba\b\s+/gi, /\ban\b\s+/gi];

	for (const pattern of fillerPatterns) {
		text = text.replace(pattern, "");
	}

	for (const pattern of phrasePatterns) {
		text = text.replace(pattern, "to"); // "in order to" → "to", etc.
	}

	// Remove articles (second pass, after filler removal)
	for (const pattern of articlePatterns) {
		text = text.replace(pattern, " ");
	}

	// Collapse multiple spaces
	text = text.replace(/\s{2,}/g, " ");

	// Trim leading/trailing whitespace
	text = text.trim();

	return text;
}

/**
 * Get the file extension for type checking.
 */
function getExtension(filepath: string): string {
	const ext = filepath.split(".").pop()?.toLowerCase() ?? "";
	return ext;
}

/**
 * Check if a file should be compressed (natural language files only).
 */
export function isCompressibleFile(filepath: string): boolean {
	const compressibleExts = ["md", "txt", "typ", "typst", "tex"];
	const ext = getExtension(filepath);
	return compressibleExts.includes(ext);
}
