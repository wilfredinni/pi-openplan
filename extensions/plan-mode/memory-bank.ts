/**
 * Memory Bank — Persistent context files for plan mode.
 *
 * Pattern inspired by Cursor's Memory Bank (project brief, active context,
 * system patterns, tech context, progress tracking).
 *
 * Files are stored in the project root:
 *   - context.md      — Project goals, active context, decisions
 *   - system-patterns.md — Architecture, design patterns, conventions
 *   - progress.md     — Progress tracking across sessions
 *
 * Tools:
 *   - memory_read     — Read one or all memory bank files
 *   - memory_write    — Write/update a memory bank file
 */

import * as fs from "node:fs";
import * as path from "node:path";

const MEMORY_BANK_FILES = [
	"context.md",
	"system-patterns.md",
	"progress.md",
] as const;

export type MemoryBankFile = (typeof MEMORY_BANK_FILES)[number];

export interface MemoryBankEntry {
	filename: MemoryBankFile;
	content: string;
	exists: boolean;
}

/**
 * Discover which memory bank files exist in the project root.
 */
export function discoverMemoryBankFiles(cwd: string): MemoryBankFile[] {
	const existing: MemoryBankFile[] = [];
	for (const file of MEMORY_BANK_FILES) {
		const filepath = path.join(cwd, file);
		if (fs.existsSync(filepath)) {
			existing.push(file);
		}
	}
	return existing;
}

/**
 * Read a single memory bank file from the project root.
 */
export function readMemoryBankFile(
	cwd: string,
	filename: MemoryBankFile,
): MemoryBankEntry {
	const filepath = path.join(cwd, filename);
	try {
		const content = fs.readFileSync(filepath, "utf-8");
		return { filename, content, exists: true };
	} catch {
		return { filename, content: "", exists: false };
	}
}

/**
 * Read all memory bank files that exist in the project root.
 */
export function readAllMemoryBankFiles(cwd: string): MemoryBankEntry[] {
	const entries: MemoryBankEntry[] = [];
	for (const file of MEMORY_BANK_FILES) {
		const entry = readMemoryBankFile(cwd, file);
		if (entry.exists) {
			entries.push(entry);
		}
	}
	return entries;
}

/**
 * Write a memory bank file to the project root.
 */
export function writeMemoryBankFile(
	cwd: string,
	filename: MemoryBankFile,
	content: string,
): void {
	const filepath = path.join(cwd, filename);
	fs.writeFileSync(filepath, content, "utf-8");
}

/**
 * Build a prompt snippet from memory bank files for injection into system prompt.
 */
export function buildMemoryBankPrompt(cwd: string): string {
	const entries = readAllMemoryBankFiles(cwd);
	if (entries.length === 0) return "";

	const sections = entries.map(
		(entry) => `---\n# Memory Bank: ${entry.filename}\n\n${entry.content}`,
	);

	return `\n\n## Memory Bank Context\n\nThe following memory bank files are available in this project:\n${entries.map((e) => `- \`${e.filename}\``).join("\n")}\n\nUse \`memory_read\` to read a file and \`memory_write\` to update it.\n\n${sections.join("\n\n")}`;
}
