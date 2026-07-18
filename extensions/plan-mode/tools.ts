/**
 * Tool registrations for plan-mode extension.
 *
 * Exports registerTools() factory that registers plan_write, plan_read,
 * and plan_list tools. plan_question lives in question-prompt.ts.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	createPlanFile,
	editPlanSection,
	listPlans,
	type PlanMetadata,
	readPlanFile,
	replacePlanContent,
	slugify,
} from "./plan-files.ts";
export function registerTools(pi: ExtensionAPI): void {
	// ── plan_write ──────────────────────────────────────────────────────

	pi.registerTool({
		name: "plan_write",
		label: "Write Plan",
		description: "Save a plan to .pi/plans/. Auto-formats YAML frontmatter.",
		promptSnippet: "Save a plan to .pi/plans/",
		promptGuidelines: [
			"Use plan_write to persist plans with phases, verification, and ⏸️ pause markers.",
		],
		parameters: Type.Object({
			filename: Type.String({
				description:
					"Plan filename (e.g. 'add-rate-limiting'). Auto-prefixed with date.",
			}),
			title: Type.String({
				description: "Plan title",
			}),
			content: Type.String({
				description:
					"Plan content in markdown, with phases and verification steps.",
			}),
			type: Type.Optional(
				Type.String({
					description:
						"Plan type: feature, fix, refactor, chore (default: feature)",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const filename = slugify(params.filename);
			const planType =
				params.type === "feature" ||
				params.type === "fix" ||
				params.type === "refactor" ||
				params.type === "chore"
					? params.type
					: "feature";
			const metadata: PlanMetadata = {
				title: params.title,
				status: "draft",
				created: new Date().toISOString(),
				type: planType,
			};
			// Strip any existing YAML frontmatter before storage (createPlanFile wraps with fresh frontmatter)
			const { body: cleanBody } = parseFrontmatter(params.content);
			const result = createPlanFile(ctx.cwd, filename, cleanBody, metadata);
			const hasOwnTitle = /^#\s/.test(cleanBody.trimStart());
			const titleHeading = hasOwnTitle ? "" : `# ${params.title}\n\n`;
			const statusIcon =
				metadata.status === "draft"
					? "📝"
					: metadata.status === "in_progress"
						? "🔄"
						: metadata.status === "done"
							? "✅"
							: "📋";
			const metaLine = `*${statusIcon} ${metadata.status} · ${metadata.type} · ${new Date(metadata.created).toLocaleDateString()}*\n`;

			const planMessageContent = `${titleHeading}${metaLine}\n${cleanBody}`;

			// Display the plan as a rendered markdown message in the conversation
			pi.sendMessage(
				{
					customType: "plan-content",
					content: planMessageContent,
					display: true,
				},
				{ triggerTurn: false },
			);

			ctx.ui.notify(
				`Plan saved: ${result.path} (${metadata.type}, ${metadata.status})`,
				"info",
			);

			return {
				content: [
					{
						type: "text",
						text: `Plan saved: ${result.path} (${metadata.type}, ${metadata.status})`,
					},
				],
				details: { path: result.path, filename },
			};
		},
	});

	// ── plan_read ───────────────────────────────────────────────────────

	pi.registerTool({
		name: "plan_read",
		label: "Read Plan",
		description:
			"Read a plan from .pi/plans/. Returns full content by default, metadata-only if full:false.",
		promptSnippet: "Read a plan from .pi/plans/",
		parameters: Type.Object({
			filename: Type.String({
				description: "Plan filename or partial name",
			}),
			full: Type.Optional(
				Type.Boolean({
					description:
						"Return full content (default: true). false = metadata only",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const plan = readPlanFile(ctx.cwd, params.filename);
			if (!plan) {
				return {
					content: [
						{
							type: "text",
							text: `No plan found matching "${params.filename}". Use plan_list to see available plans.`,
						},
					],
					details: {},
				};
			}
			const full = params.full !== false;
			const planReadResponse = full
				? `# ${plan.metadata.title}\nStatus: ${plan.metadata.status} | Created: ${plan.metadata.created} | Type: ${plan.metadata.type}\n\n---\n${plan.content}`
				: `# ${plan.metadata.title} [${plan.metadata.status}]\n${plan.metadata.type} · ${plan.metadata.created.slice(0, 10)}\n${plan.filename}`;
			return {
				content: [
					{
						type: "text",
						text: planReadResponse,
					},
				],
				details: {
					filename: plan.filename,
					metadata: plan.metadata,
				},
			};
		},
	});

	// ── plan_list ───────────────────────────────────────────────────────

	pi.registerTool({
		name: "plan_list",
		label: "List Plans",
		description:
			"List saved plans in .pi/plans/. Shows filename, status, title, date. Optionally filter by status.",
		promptSnippet: "List saved plans",
		parameters: Type.Object({
			status: Type.Optional(
				Type.String({
					description: "Filter: draft, approved, in_progress, done",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const statusFilter =
				params.status === "draft" ||
				params.status === "approved" ||
				params.status === "in_progress" ||
				params.status === "done"
					? params.status
					: undefined;
			const plans = listPlans(ctx.cwd, statusFilter);
			if (plans.length === 0) {
				return {
					content: [{ type: "text", text: "No plans found." }],
					details: { plans: [] },
				};
			}
			const list = plans
				.map(
					(p) =>
						`- **${p.filename}** [${p.metadata.status}] ${p.metadata.title} (${p.metadata.created.slice(0, 10)})`,
				)
				.join("\n");
			const planListResponse = `# Saved Plans\n\n${list}`;
			return {
				content: [{ type: "text", text: planListResponse }],
				details: {
					plans: plans.map((p) => p.filename),
				},
			};
		},
	});

	// ── plan_edit ───────────────────────────────────────────────────────

	pi.registerTool({
		name: "plan_edit",
		label: "Edit Plan",
		description:
			"Edit an existing plan in .pi/plans/. Update a specific section or replace the entire content.",
		promptSnippet: "Edit an existing plan in .pi/plans/",
		promptGuidelines: [
			"Use plan_edit to update existing plans instead of writing duplicates with plan_write.",
			"For targeted changes, provide section name to replace only that section.",
			"Omit section to replace the entire plan content (old version preserved).",
		],
		parameters: Type.Object({
			filename: Type.String({
				description:
					"Plan filename or partial name (fuzzy match). Must match an existing plan.",
			}),
			content: Type.String({
				description:
					"New content for the section or the full plan body (markdown).",
			}),
			section: Type.Optional(
				Type.String({
					description:
						"Name of the section heading to replace (e.g. 'Approach', 'Phase 1: Setup'). Omit to replace entire plan content.",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const sectionName = params.section?.trim();

			const plan = sectionName
				? editPlanSection(ctx.cwd, params.filename, sectionName, params.content)
				: replacePlanContent(ctx.cwd, params.filename, params.content);

			// Display the updated plan as a rendered markdown message
			const updatedDate = plan.metadata.updated ?? new Date().toISOString();
			const planMessageContent = `# ${plan.metadata.title}\n*📝 ${plan.metadata.status} · ${plan.metadata.type} · updated ${new Date(updatedDate).toLocaleDateString()}*\n\n${plan.content}`;

			pi.sendMessage(
				{
					customType: "plan-content",
					content: planMessageContent,
					display: true,
				},
				{ triggerTurn: false },
			);

			ctx.ui.notify(
				sectionName
					? `Plan updated: ${plan.filename} (section "${sectionName}")`
					: `Plan updated: ${plan.filename} (full replace, previous version preserved)`,
				"info",
			);

			return {
				content: [
					{
						type: "text",
						text: `Plan updated: ${plan.filename}${sectionName ? ` (section "${sectionName}")` : " (full replace)"}`,
					},
				],
				details: { filename: plan.filename, section: sectionName ?? null },
			};
		},
	});
}
