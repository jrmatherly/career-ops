// MIT License, copyright (c) 2026 Amruth Pillai. Vendored from Reactive Resume packages/schema/src/templates.ts at d065a9f7; see THIRD_PARTY_NOTICES.md.
import { z } from "zod";

export const templateSchema = z.enum([
	"azurill",
	"bronzor",
	"chikorita",
	"ditgar",
	"ditto",
	"gengar",
	"glalie",
	"kakuna",
	"lapras",
	"leafish",
	"meowth",
	"onyx",
	"persian",
	"pikachu",
	"porygon",
	"rhyhorn",
	"scizor",
	"smeargle",
]);



/** How a template lays out the page. The single source for the gallery filters, the Check layout rule and DOCX. */











const oneColumn                 = { columns: 1, sidebarSide: null, headerPlacement: "full-width", atsSafe: true };

export const templateLayouts = {
	azurill: { columns: 2, sidebarSide: "left", headerPlacement: "full-width", atsSafe: false },
	// Bronzor prints sidebar sections as labelled rows inside one column.
	bronzor: oneColumn,
	chikorita: { columns: 2, sidebarSide: "right", headerPlacement: "main-only", atsSafe: false },
	ditgar: { columns: 2, sidebarSide: "left", headerPlacement: "sidebar-only", atsSafe: false },
	ditto: { columns: 2, sidebarSide: "left", headerPlacement: "full-width", atsSafe: false },
	gengar: { columns: 2, sidebarSide: "left", headerPlacement: "sidebar-only", atsSafe: false },
	glalie: { columns: 2, sidebarSide: "left", headerPlacement: "sidebar-only", atsSafe: false },
	kakuna: oneColumn,
	lapras: oneColumn,
	leafish: { columns: 2, sidebarSide: "right", headerPlacement: "full-width", atsSafe: false },
	meowth: oneColumn,
	onyx: oneColumn,
	persian: oneColumn,
	pikachu: { columns: 2, sidebarSide: "left", headerPlacement: "main-only", atsSafe: false },
	porygon: oneColumn,
	rhyhorn: oneColumn,
	scizor: oneColumn,
	smeargle: oneColumn,
}                                                    ;
