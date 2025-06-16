import fs from "fs/promises"
import { ToolUse } from "../../../shared/tools"
import { searchAndReplaceTool } from "../searchAndReplaceTool"

// Mock dependencies
const mockPushToolResult = jest.fn()
const mockAskApproval = jest.fn().mockResolvedValue(true)
const mockHandleError = jest.fn()
const mockRemoveClosingTag = jest.fn().mockImplementation((_, value) => value)
const mockCline = {
	cwd: "/test/project",
	consecutiveMistakeCount: 0,
	recordToolError: jest.fn(),
	recordToolUsage: jest.fn(),
	say: jest.fn(),
	ask: jest.fn().mockResolvedValue({ response: "yesButtonClicked" }),
	diffViewProvider: {
		editType: "",
		originalContent: "",
		isEditing: false,
		open: jest.fn(),
		update: jest.fn(),
		saveChanges: jest.fn(),
		reset: jest.fn(),
		revertChanges: jest.fn(),
		scrollToFirstDiff: jest.fn(),
		pushToolWriteResult: jest.fn().mockResolvedValue("Success"),
	},
	rooIgnoreController: {
		validateAccess: jest.fn().mockReturnValue(true),
	},
	rooProtectedController: {
		isWriteProtected: jest.fn().mockReturnValue(false),
	},
	fileContextTracker: {
		trackFileContext: jest.fn(),
	},
	didEditFile: false,
}

// Mock fs methods
jest.mock("fs/promises", () => ({
	readFile: jest.fn(),
	writeFile: jest.fn(),
}))

// Mock path resolution
jest.mock("path", () => ({
	resolve: jest.fn().mockImplementation((...args) => args.join("/")),
	join: jest.fn().mockImplementation((...args) => args.join("/")),
	normalize: jest.fn().mockImplementation((path) => path.replace(/\\/g, "/")),
	relative: jest.fn().mockImplementation((from, to) => {
		return to.startsWith(from) ? to.slice(from.length + 1) : to
	}),
	basename: jest.fn().mockImplementation((path) => path.split("/").pop() || ""),
}))

// Mock file existence check
jest.mock("../../../utils/fs", () => ({
	fileExistsAtPath: jest.fn().mockReturnValue(true),
}))

describe("searchAndReplaceTool", () => {
	beforeEach(() => {
		jest.clearAllMocks()
		;(fs.readFile as jest.Mock).mockResolvedValue("line1\nline2\nline3\n")
	})

	describe("basic functionality", () => {
		it("performs simple text replacement", async () => {
			const toolBlock: ToolUse = {
				type: "tool_use",
				name: "search_and_replace",
				params: {
					path: "test.txt",
					search: "line2",
					replace: "replaced",
				},
				partial: false,
			}

			await searchAndReplaceTool(
				mockCline as any,
				toolBlock,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockCline.diffViewProvider.update).toHaveBeenCalledWith("line1\nreplaced\nline3\n", true)
			expect(mockPushToolResult).toHaveBeenCalledWith("Success")
		})
	})

	describe("multiple match handling", () => {
		beforeEach(() => {
			;(fs.readFile as jest.Mock).mockResolvedValue("apple\napple\napple\n")
		})

		it("fails when multiple matches without line range", async () => {
			const toolBlock: ToolUse = {
				type: "tool_use",
				name: "search_and_replace",
				params: {
					path: "test.txt",
					search: "apple",
					replace: "orange",
				},
				partial: false,
			}

			await searchAndReplaceTool(
				mockCline as any,
				toolBlock,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockCline.recordToolError).toHaveBeenCalledWith("search_and_replace")
			expect(mockPushToolResult).toHaveBeenCalledWith(expect.stringContaining("Multiple matches found"))
		})

		it("fails when multiple matches with too wide line range", async () => {
			const toolBlock: ToolUse = {
				type: "tool_use",
				name: "search_and_replace",
				params: {
					path: "test.txt",
					search: "apple",
					replace: "orange",
					start_line: "1",
					end_line: "3", // This range covers all lines, which is too wide
				},
				partial: false,
			}

			await searchAndReplaceTool(
				mockCline as any,
				toolBlock,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockCline.recordToolError).toHaveBeenCalledWith("search_and_replace")
			expect(mockPushToolResult).toHaveBeenCalledWith(expect.stringContaining("Multiple matches found"))
		})

		it("succeeds with line range when multiple matches", async () => {
			const toolBlock: ToolUse = {
				type: "tool_use",
				name: "search_and_replace",
				params: {
					path: "test.txt",
					search: "apple",
					replace: "orange",
					start_line: "2",
					end_line: "2",
				},
				partial: false,
			}

			await searchAndReplaceTool(
				mockCline as any,
				toolBlock,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockCline.diffViewProvider.update).toHaveBeenCalledWith("apple\norange\napple\n", true)
			expect(mockPushToolResult).toHaveBeenCalledWith("Success")
		})

		it("succeeds with refined search when multiple matches", async () => {
			;(fs.readFile as jest.Mock).mockResolvedValue("apple red\napple green\napple yellow\n")

			const toolBlock: ToolUse = {
				type: "tool_use",
				name: "search_and_replace",
				params: {
					path: "test.txt",
					search: "apple green",
					replace: "orange",
				},
				partial: false,
			}

			await searchAndReplaceTool(
				mockCline as any,
				toolBlock,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockCline.diffViewProvider.update).toHaveBeenCalledWith("apple red\norange\napple yellow\n", true)
			expect(mockPushToolResult).toHaveBeenCalledWith("Success")
		})
	})

	describe("edge cases", () => {
		it("handles regex patterns correctly", async () => {
			;(fs.readFile as jest.Mock).mockResolvedValue("123abc\n456def\n")

			const toolBlock: ToolUse = {
				type: "tool_use",
				name: "search_and_replace",
				params: {
					path: "test.txt",
					search: "\\d+a",
					replace: "num",
					use_regex: "true",
				},
				partial: false,
			}

			await searchAndReplaceTool(
				mockCline as any,
				toolBlock,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockCline.diffViewProvider.update).toHaveBeenCalledWith("numbc\n456def\n", true)
		})

		it("handles case-insensitive search", async () => {
			;(fs.readFile as jest.Mock).mockResolvedValue("ApPlE\norange\n4pple\n")

			const toolBlock: ToolUse = {
				type: "tool_use",
				name: "search_and_replace",
				params: {
					path: "test.txt",
					search: "apple",
					replace: "orange",
					ignore_case: "true",
				},
				partial: false,
			}

			await searchAndReplaceTool(
				mockCline as any,
				toolBlock,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockCline.diffViewProvider.update).toHaveBeenLastCalledWith("orange\norange\n4pple\n", true)
		})
	})
})
