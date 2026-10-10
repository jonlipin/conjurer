-- Conjurer
-- Skins: Conjurer's pieces in the window styles. Styles.lua does the choosing and the drawing
-- (Blizzard, Dark, or EllesmereUI's look); this file says what Conjurer has to restyle.
--
-- The click-to-conjure button and the icons that conjure are action buttons, so they are only
-- touched out of combat (Styles.OutOfCombat), and only their art: never an attribute. The hold to
-- cast button is one of the game's own action bar buttons and is never touched at all.

local ADDON, ns = ...
local Styles = ns.Styles
local Try, OutOfCombat = Styles.Try, Styles.OutOfCombat

local function S() return Styles.S end

local function Fonts(...)
	for i = 1, select("#", ...) do
		local fs = select(i, ...)
		if type(fs) == "table" and fs.GetFont then S().Font(fs) end
	end
end

local function SkinButton(button)
	if type(button) ~= "table" then return end
	S().Button(button)
	S().WhiteButtonLabel(button)
	if button.GetFontString then Fonts(button:GetFontString()) end
end

-- A border a style lays over a window sits above its children; a corner button goes back on top,
-- but no higher than its own window.
local function Raise(button, parent)
	local level = parent:GetFrameLevel() or 1
	for _, child in ipairs({ parent:GetChildren() }) do
		if child ~= button then level = math.max(level, child:GetFrameLevel() or 0) end
	end
	button:SetFrameLevel(level + 5)
end

-- Every font string in a frame and in the frames inside it, in the style's font (Dark keeps the
-- game's). The progress bars are passed by: their count stays outlined to read on the liquid.
local function FontsUnder(frame, skip, depth)
	depth = depth or 0
	if depth > 12 or type(frame) ~= "table" or skip[frame] or not frame.GetRegions then return end
	for _, region in ipairs({ frame:GetRegions() }) do
		if region.IsObjectType and region:IsObjectType("FontString") then S().Font(region) end
	end
	for _, child in ipairs({ frame:GetChildren() }) do FontsUnder(child, skip, depth + 1) end
end

-- An icon dressed as an action bar button (UI.DressIcon): the rounded mask, frame and pressed art
-- give way to a square icon with a thin edge, a flat press and a flat highlight. The glow round it
-- stays, since it says Ready is lit or that something runs low, and so does the play or stop sign.
local function SquareButton(b)
	if type(b) ~= "table" or b.skinned or type(b.icon) ~= "table" then return end
	b.skinned = true
	-- A square icon cannot be cropped through the mask, so the mask goes first.
	if b.iconMask and b.icon.RemoveMaskTexture then pcall(b.icon.RemoveMaskTexture, b.icon, b.iconMask) end
	S().SquareIcon(b.icon, b)
	if b.iconBorder then b.iconBorder:SetAlpha(0) end
	if b.iconPushed then
		b.iconPushed:ClearAllPoints()
		b.iconPushed:SetAllPoints(b.icon)
		b.iconPushed:SetColorTexture(0, 0, 0, 0.35)
	end
	if b.iconHighlight then
		b.iconHighlight:ClearAllPoints()
		b.iconHighlight:SetAllPoints(b.icon)
		b.iconHighlight:SetBlendMode("BLEND")
		b.iconHighlight:SetColorTexture(1, 1, 1, 0.12)
	end
	Fonts(b.count, b.playText)
end

-- The progress bar: the professions book's bronze frame gives way to a dark track with a thin edge,
-- and the liquid still flows along it. The plain stand-in bar takes the style's bar fill; its blue
-- and its green when full are still set as it fills.
local function Progress(bar)
	if type(bar) ~= "table" or bar.skinned then return end
	bar.skinned = true
	if bar.status then
		S().ApplyBarFill(bar.status)
		return
	end
	for _, pieces in ipairs(bar.artPieces or {}) do
		for _, piece in ipairs(pieces) do piece:SetAlpha(0) end
	end
	-- Where the fill shows at 100%: 3 in from the left, 4 from the right, 3 down, 2 up.
	local s = bar.scale or 1
	local track = bar:CreateTexture(nil, "BACKGROUND")
	track:SetPoint("TOPLEFT", bar, "TOPLEFT", 3 * s, -3 * s)
	track:SetPoint("BOTTOMRIGHT", bar, "BOTTOMRIGHT", -4 * s, 2 * s)
	track:SetColorTexture(0, 0, 0, 0.55)
	Styles.Outline(bar, track, "BORDER", 0, 0, 0, 1, 1)
	bar.track = track
end

-- A section header: a flat bar, with a + or - for open or closed in place of the list art's arrow
-- (UI.Layout sets it).
local function Header(h)
	if h.skinned then return end
	h.skinned = true
	S().Button(h)
	if not h.Sign then
		h.Sign = h:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
		h.Sign:SetPoint("RIGHT", -12, 0)
	end
end

local function RowIcon(row)
	if type(row.icon) ~= "table" then return end
	OutOfCombat("row icon", function() S().SquareIcon(row.icon, row.cast or row) end)
end

-- ---- the window ---------------------------------------------------------------------------------

local windowDone = false

local function SkinMainWindow()
	local P = ns.UI and ns.UI.parts
	if not P or windowDone then return end
	windowDone = true
	local frame = P.frame
	S().Shell(frame)
	-- EllesmereUI takes the round portrait off the game's windows it dresses, and so does this. The
	-- Ready button moves into the room it leaves, in line with the progress bar under it.
	local portraits = frame.PortraitContainer
	if type(portraits) == "table" then
		S().FadeRegions(portraits)
		if type(portraits.portrait) == "table" then portraits.portrait:SetAlpha(0) end
	end
	if type(frame.portrait) == "table" and frame.portrait.SetAlpha then frame.portrait:SetAlpha(0) end
	P.readyButton:ClearAllPoints()
	P.readyButton:SetPoint("TOPLEFT", frame, "TOPLEFT", 16, -32)
	if type(frame.CloseButton) == "table" then
		S().CloseButton(frame.CloseButton)
		Raise(frame.CloseButton, frame)
	end
	if frame.insetFrame then S().Inset(frame.insetFrame) end
	if P.scroll and type(P.scroll.ScrollBar) == "table" then S().ScrollBar(P.scroll.ScrollBar) end

	-- Water and Food keep a box of their own, a darker panel, with the profile tabs under it.
	if P.targetsBox then S().Panel(P.targetsBox, { inset = true }) end
	for _, tab in ipairs(P.tabs) do
		S().Tab(tab)
		-- The check on the tab Ready conjures says which one that is; the tab's restyle fades it.
		if tab.inUse then tab.inUse:SetAlpha(1) end
	end
	ns.SkinTabSelection(P.tabs, ns.PROFILE_BY_KEY[ns.UI.ViewKey()].index)
	for _, s in pairs(P.sections) do Header(s.header) end

	local made = ns.UI.made
	for _, b in ipairs(made.buttons) do SkinButton(b) end
	for _, cb in ipairs(made.checks) do S().Checkbox(cb) end
	for _, box in ipairs(made.edits) do S().EditBox(box) end

	-- Icons: the Ready and macro buttons, the rank and gem rows, and the You keep and Strangers rows.
	-- The class icons are pieces of a sheet or atlas, which a crop would spoil, so they stay.
	SquareButton(P.readyButton)
	SquareButton(P.macroButton)
	for _, kind in ipairs({ "water", "food" }) do
		for _, row in ipairs(P.rankRows[kind]) do RowIcon(row) end
	end
	for _, row in ipairs(P.gemRows) do RowIcon(row) end
	local strangers = P.sections.shares.body.strangers
	for _, row in ipairs({ P.shareRows[1], strangers }) do
		if row then S().SquareIcon(row.icon, row) end
	end
	Progress(P.progress)
	FontsUnder(frame, { [P.progress] = true })
	for _, row in ipairs(P.memberRows) do ns.SkinMemberRow(row) end
	OutOfCombat("click button", function() SquareButton(P.clickButton) end)
end

function ns.SkinWindow()
	if S() then Try("window", SkinMainWindow) end
end

-- The tab of the profile on view, as Conjurer picks it.
function ns.SkinTabSelection(tabs, index)
	if not S() then return end
	for i, tab in ipairs(tabs) do S().SetTabSelection(tab, i == index) end
end

function ns.SkinMemberRow(row)
	if not S() then return end
	Try("group row", function()
		SkinButton(row.button)
		Fonts(row.name, row.share, row.status)
	end)
end

-- ---- the quick access bar -----------------------------------------------------------------------

-- Its panel is the bag window's, as ShardGrid's windows are, and is restyled as they are. Its cog
-- and announce button keep their art, as ShardGrid's cog does, and are children of the bar rather
-- than of the panel, so a border laid over the panel stays under them.
local alertDone = false

function ns.SkinAlert()
	local A = ns.Alert and ns.Alert.parts
	if not S() or not A or alertDone then return end
	alertDone = true
	Try("quick access bar", function()
		if A.border then
			S().Shell(A.border)
			if A.border.title then
				Fonts(A.border.title)
				ns.Alert.TitleFontChanged()
			end
		end
		SquareButton(A.play)
		Progress(A.progress)
	end)
	OutOfCombat("quick access bar icons", function()
		SquareButton(A.conjure)
		for _, b in pairs(A.icons) do SquareButton(b) end
	end)
end

function ns.SkinAlertIcon(b)
	if not S() then return end
	OutOfCombat("quick access bar icon", function() SquareButton(b) end)
end

-- ---- the trade window's row ---------------------------------------------------------------------

-- The buttons under the game's trade window follow that window: EllesmereUI dresses it, Dark leaves
-- it as the game draws it.
function ns.SkinTradeRow(buttons)
	if not S() or Styles.Applied() ~= "eui" then return end
	OutOfCombat("trade buttons", function()
		for _, b in ipairs(buttons) do SkinButton(b) end
	end)
end

-- ---- everything that exists when a style is applied ---------------------------------------------

local function SkinAll()
	if ns.UI and ns.UI.parts then Try("window", SkinMainWindow) end
	ns.SkinAlert()
	if ns.Trade and ns.Trade.rowButtons then ns.SkinTradeRow(ns.Trade.rowButtons) end
	-- Laid out again: the headers' signs, and the bar's title in its font.
	if ns.UI and ns.UI.Refresh then ns.UI.Refresh() end
	if ns.Alert and ns.Alert.PaintBorder then ns.Alert.PaintBorder() end
end

Styles.Setup({
	addon = ADDON,
	title = "Conjurer",
	db = function() return ns.db end,
	report = ns.report,
	accent = { 0.25, 0.78, 0.92 }, -- the mage blue of Conjurer's name in chat
	skin = SkinAll,
})
