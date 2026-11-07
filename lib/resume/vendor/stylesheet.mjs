// MIT License, copyright (c) 2026 Amruth Pillai. Vendored from Reactive Resume packages/schema/src/resume/stylesheet.ts at d065a9f7; see THIRD_PARTY_NOTICES.md.
import { z } from "zod";

export const EMPTY_SEMANTIC_CSS_SOURCE = "";

export const stylesheetSourceSchema = z.strictObject({
	languageVersion: z.number().int().positive(),
	text: z.string(),
});

const canonicalSemanticStylesheetSchema = z.strictObject({
	mode: z.enum(["legacy", "semantic"]),
	source: stylesheetSourceSchema,
});

const normalizeHistoricalStylesheet = (input         )          => {
	if (typeof input !== "object" || input === null || Array.isArray(input) || !Object.hasOwn(input, "applied")) {
		return input;
	}

	const { applied, ...stylesheet } = input                           ;
	return stylesheetSourceSchema.safeParse(applied).success ? stylesheet : input;
};

export const semanticStylesheetSchema = z.preprocess(normalizeHistoricalStylesheet, canonicalSemanticStylesheetSchema);




