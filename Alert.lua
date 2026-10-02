-- Conjurer
-- Alert: the quick access bar. Icons for your conjured water and food, shown when they run low or
-- all the time, with the click-to-conjure button, the Ready button, the cog and a progress bar, in
-- the bag window's panel (or without it).
--
-- One icon per kind that is low, side by side, each dressed as an action bar button with the proc
-- glow and how many you have left. Beside them, a Ready button like the window's, lit while Ready
-- is (play starts conjuring, stop ends it), and a cog that opens Conjurer. Started from here, the alert stays up until conjuring
-- stops, so its stop button stays in reach. It can show out of combat (the default), in combat, or
-- always, only for a kind you can conjure. "Low" counts your best rank and anything better you can
-- use (another mage's), since that is what you conjure; lower ranks count only when ticked.

local ADDON, ns = ...
local report = ns.report
local A = {}
ns.Alert = A

local SIZE = 40
local GAP = 2 -- the action bars' spacing
local CONTROLS = 24 -- the cog's room at the end of the row, when there's no panel to hold it
-- The options button ShardGrid has in its title bar: the dropdown settings cog, gold in a square.
local COG = 20
local COG_ART = {
	{ "common-dropdown-a-button-settings", "common-dropdown-a-button-settings-hover", "common-dropdown-a-button-settings-pressed" },
	{ "common-dropdown-a-button-settings-shadowless", "common-dropdown-a-button-settings-hover-shadowless",
		"common-dropdown-a-button-settings-pressed-shadowless" },
	{ "gm-icon-settings", "gm-icon-settings-hover", "gm-icon-settings-pressed" },
}
-- The professions book's bar at its own height, as far under the icons as it is over the panel's edge.
local PROGRESS_H, PROGRESS_GAP = 23, 2
-- Its frame sits 2 in from the art's ends, so it reaches 2 past the row to line up with the icons.
local PROGRESS_OUT = 2
-- The panel round the bar: the bag window's, as ShardGrid's soul shard and summons windows use. The
-- bar sits this far inside it, under the title bar. Its metal corners overlap below MIN_W by MIN_H,
-- so a smaller panel is drawn at that size and shrunk to fit instead, no further than MIN_FIT.
local PANEL_TEMPLATES = {
	{ "DefaultPanelFlatTemplate", function(f) return f.NineSlice ~= nil end },
	{ "DefaultPanelTemplate", function(f) return f.NineSlice ~= nil end },
	{ "ButtonFrameTemplate", function(f) return f.NineSlice ~= nil or f.Inset ~= nil end },
}
local INSET = { left = 10, right = 8, top = 27, bottom = 9 }
local SIDE = 6 -- more room at the sides, on screen, out of what the narrow gaps save
local MIN_W, MIN_H, MIN_FIT = 156, 110, 0.5
local BASE_LEVEL = 10 -- the panel's level; the bar and its buttons sit well above it
local holder, playButton, cogButton, conjureButton, announceButton, progress, border, titleFont
local cogX = 0 -- where the cog goes in the row without the panel
local icons = {}
local wasLow = { water = false, food = false }
A.combat = false
A.sticky = nil -- kinds that stay up while conjuring started from the alert runs

A.WHEN = { "out", "in", "always" }
A.WHEN_LABEL = { out = "Out of combat", ["in"] = "In combat", always = "In and out of combat" }

-- What you have of a kind that counts for the alert: your best rank and any better one you are high
-- enough to use, or every rank you can use when lower ranks count too.
function A.Total(kind)
	local level = ns.Clean(UnitLevel("player"))
	level = type(level) == "number" and level or 60
	local top = ns.TopKnown(kind)
	local lowest = (top and not (ns.db and ns.db.alert.lowerRanks)) and top.level or 0
	local n = 0
	for _, entry in ipairs(ns.KINDS[kind]) do
		if entry.level <= level and entry.level >= lowest then n = n + ns.Count(entry.item) end
	end
	return n
end

function A.Low(kind)
	local db = ns.db and ns.db.alert
	if not (db and db.enabled and ns.isMage) then return false end
	if not ns.TopKnown(kind) then return false end
	local below = tonumber(db[kind]) or 0
	return below > 0 and A.Total(kind) < below
end

local function Fighting() return A.combat or ns.InCombat() end

-- Whether this is a moment the alert may show: out of combat, in combat, or always.
function A.RightTime()
	local when = ns.db.alert.when or "out"
	if when == "always" then return true end
	if when == "in" then return Fighting() end
	return not Fighting()
end

local function SavePoint()
	local point, _, relPoint, x, y = holder:GetPoint(1)
	ns.db.alert.point = { point, relPoint, x, y }
end

-- The size slider's scale, a half to twice the size.
local function Scale()
	local pct = tonumber(ns.db.alert.scale) or 100
	return math.max(0.5, math.min(2, pct / 100))
end

local function Place()
	holder:ClearAllPoints()
	local p = ns.db.alert.point
	if type(p) == "table" and p[1] then
		holder:SetPoint(p[1], UIParent, p[2] or p[1], p[3] or 0, p[4] or 0)
	else
		holder:SetPoint("CENTER", UIParent, "CENTER", 0, 180)
	end
end

local function Tooltip(self)
	GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
	if self.gem then
		local have = ns.Count(self.gem.item) > 0
		GameTooltip:SetText(ns.ItemName(self.gem) .. (have and " is in your bags" or " is missing"), 1, 0.82, 0)
		GameTooltip:AddLine("Conjurer keeps one of each mana gem you tick.", 1, 1, 1, true)
	else
		-- Low only when it is: kept on screen as a quick bar, plenty shows here too.
		local kind = self.kind
		local low = A.Low(kind)
		GameTooltip:SetText("Conjured " .. ns.KIND_LABEL[kind]:lower() .. (low and " is low" or ""), 1, 0.82, 0)
		local top = ns.TopKnown(kind)
		local what = (top and not ns.db.alert.lowerRanks) and (ns.ItemName(top) .. " or better") or "of every rank"
		local below = tonumber(ns.db.alert[kind]) or 0
		GameTooltip:AddLine((low and "Only " or "") .. A.Total(kind) .. " " .. what .. (low and " left." or " in your bags."), 1, 1, 1, true)
		GameTooltip:AddLine(below > 0 and ("Low is fewer than " .. below .. ": the icon glows then.")
			or "Never counted as low: its threshold is 0.", 0.8, 0.8, 0.8, true)
	end
	GameTooltip:AddLine(" ")
	if self.castable and self.castEntry then
		GameTooltip:AddLine("Click: conjure " .. ns.ShortName(self.castEntry) .. ", one cast" .. (ns.InCombat() and " (out of combat)" or ""), 0.7, 0.7, 0.7)
	else
		GameTooltip:AddLine("Click: open Conjurer", 0.7, 0.7, 0.7)
	end
	GameTooltip:AddLine("Right-click: start or stop Ready (hold " .. ns.Conjure.KeyText() .. ")", 0.7, 0.7, 0.7)
	GameTooltip:AddLine("Drag: move", 0.7, 0.7, 0.7)
	GameTooltip:Show()
end

local function Drag(region)
	region:RegisterForDrag("LeftButton")
	region:SetScript("OnDragStart", function() holder:StartMoving() end)
	region:SetScript("OnDragStop", ns.Guard("alert drag", function()
		holder:StopMovingOrSizing()
		SavePoint()
	end))
end

-- Starts conjuring, or stops it. Started here, the icons now showing stay up while it runs.
function A.TogglePlay()
	local C = ns.Conjure
	if C.armed then
		C.Disarm("Ready is off.")
		return
	end
	if C.Arm() then
		A.sticky = {}
		for key, b in pairs(icons) do
			if b:IsShown() then A.sticky[key] = true end
		end
	end
	A.Update(true)
end

-- A mana gem you keep, know and haven't got.
function A.GemMissing(gem)
	local db = ns.db and ns.db.alert
	if not (db and db.enabled and ns.isMage) then return false end
	return ns.KeepsGem(gem) and ns.Known(gem.spell) and ns.Count(gem.item) == 0
end

-- Everything the alert can show, in order: water, food, then the gems you keep, best first.
local function Entries()
	local list = {}
	for _, kind in ipairs(ns.KIND_ORDER) do
		local top = ns.TopKnown(kind)
		list[#list + 1] = { key = kind, kind = kind, entry = top, canShow = top ~= nil, low = A.Low(kind), label = kind }
	end
	for r = #ns.GEMS, 1, -1 do
		local gem = ns.GEMS[r]
		list[#list + 1] = { key = "gem" .. gem.spell, gem = gem, entry = gem, label = gem.name,
			canShow = ns.KeepsGem(gem) and ns.Known(gem.spell), low = A.GemMissing(gem) }
	end
	return list
end

-- A small button made of three atlases (up, down, highlight), or a word when they are missing.
local function ArtButton(parent, size, name, up, down, over, fallbackText)
	local b = CreateFrame("Button", name, parent)
	b:SetSize(size, size)
	b.art = b:CreateTexture(nil, "ARTWORK")
	b.art:SetAllPoints()
	if up and ns.HasAtlas(up) then
		b.up, b.down = up, (down and ns.HasAtlas(down)) and down or up
		b.art:SetAtlas(b.up)
		local hl = b:CreateTexture(nil, "HIGHLIGHT")
		hl:SetAllPoints()
		if over and ns.HasAtlas(over) then
			hl:SetAtlas(over)
		else
			hl:SetAtlas(b.up)
			hl:SetBlendMode("ADD")
			hl:SetAlpha(0.35)
		end
		b:SetScript("OnMouseDown", function(self) self.art:SetAtlas(self.down) end)
		b:SetScript("OnMouseUp", function(self) self.art:SetAtlas(self.up) end)
	else
		b.art:SetColorTexture(0.1, 0.1, 0.1, 0.9)
		b.label = b:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
		b.label:SetPoint("CENTER")
		b.label:SetText(fallbackText)
		local hl = b:CreateTexture(nil, "HIGHLIGHT")
		hl:SetAllPoints()
		hl:SetColorTexture(1, 1, 1, 0.15)
	end
	return b
end

-- The icon for an entry, made the first time it's needed.
local function Icon(e)
	if icons[e.key] then return icons[e.key] end
	local name = e.gem and ("ConjurerAlertGem" .. e.gem.rank) or ("ConjurerAlert" .. ns.KIND_LABEL[e.kind])
	-- A click conjures what the icon shows, when the client has the template for it.
	local b = ns.Click and ns.Click.CastButton(name, holder) or CreateFrame("Button", name, holder)
	b:SetSize(SIZE, SIZE)
	b.kind, b.gem = e.kind, e.gem
	ns.UI.DressIcon(b, SIZE)
	b.count = b:CreateFontString(nil, "OVERLAY", "NumberFontNormal")
	b.count:SetPoint("BOTTOMRIGHT", -3, 3)
	b.glow, b.anim = ns.UI.MakeGlow(b, SIZE)
	b:RegisterForClicks("LeftButtonUp", "RightButtonUp")
	Drag(b)
	if b.castable then
		-- The template's own click conjures; a right click, which it leaves alone, is Ready.
		b:SetScript("PostClick", ns.Guard("alert click", function(self, which)
			if which == "RightButton" then A.TogglePlay() else ns.Click.LogCast(self, "alert icon") end
		end))
	else
		b:SetScript("OnClick", ns.Guard("alert click", function(_, which)
			if which == "RightButton" then A.TogglePlay() else ns.UI.Show() end
		end))
	end
	b:SetScript("OnEnter", Tooltip)
	b:SetScript("OnLeave", function() GameTooltip:Hide() end)
	b:Hide()
	icons[e.key] = b
	return b
end

-- The bag window's panel round the bar, titled Conjurer. Its background takes a drag too.
local function BuildBorder()
	local used
	for _, c in ipairs(PANEL_TEMPLATES) do
		local ok, made = pcall(CreateFrame, "Frame", "ConjurerAlertBorder", holder, c[1])
		if ok and made and (not c[2] or c[2](made)) then
			border, used = made, c[1]
			break
		end
		if ok and made then made:Hide() end
	end
	if not border then
		local ok, made = pcall(CreateFrame, "Frame", "ConjurerAlertBorder", holder, "BackdropTemplate")
		border = (ok and made) or CreateFrame("Frame", "ConjurerAlertBorder", holder)
		used = "backdrop"
		if border.SetBackdrop then
			border:SetBackdrop({
				bgFile = "Interface\\Tooltips\\UI-Tooltip-Background",
				edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border",
				tile = true, tileSize = 16, edgeSize = 14,
				insets = { left = 3, right = 3, top = 3, bottom = 3 },
			})
			border:SetBackdropColor(0.05, 0.05, 0.05, 0.92)
		else
			local bg = border:CreateTexture(nil, "BACKGROUND")
			bg:SetAllPoints()
			bg:SetColorTexture(0.05, 0.05, 0.05, 0.92)
			used = "plain"
		end
	end
	report["alert frame"] = used
	if used == "ButtonFrameTemplate" then
		if ButtonFrameTemplate_HidePortrait then pcall(ButtonFrameTemplate_HidePortrait, border) end
		if ButtonFrameTemplate_HideButtonBar then pcall(ButtonFrameTemplate_HideButtonBar, border) end
		if border.Inset then border.Inset:Hide() end
	end
	if border.CloseButton then border.CloseButton:Hide() end
	local title = border.TitleText or (border.TitleContainer and border.TitleContainer.TitleText)
	if title then title:SetText("Conjurer") end
	border.title = title
	-- Under the icons and buttons: its metal and background low, the bar well above.
	border:SetFrameLevel(BASE_LEVEL)
	if border.NineSlice and border.NineSlice.SetFrameLevel then border.NineSlice:SetFrameLevel(BASE_LEVEL + 1) end
	if type(border.Bg) == "table" and border.Bg.SetFrameLevel then border.Bg:SetFrameLevel(BASE_LEVEL) end
	border:EnableMouse(true)
	Drag(border)
end

local function Build()
	if holder then return end
	ns.Stage("building the alert")
	holder = CreateFrame("Frame", "ConjurerAlert", UIParent)
	holder:SetSize(SIZE, SIZE)
	holder:SetFrameStrata("MEDIUM")
	-- Set before its buttons are made, so they all start above the panel round them.
	holder:SetFrameLevel(BASE_LEVEL + 10)
	holder:SetScale(Scale())
	holder:SetMovable(true)
	holder:SetClampedToScreen(true)
	Place()
	BuildBorder()
	for _, kind in ipairs(ns.KIND_ORDER) do Icon({ key = kind, kind = kind }) end
	-- Conjures by click, one cast each: the next row short of its target, or when every target is met,
	-- whatever the alert shows as low.
	conjureButton = ns.Click and ns.Click.Make("ConjurerAlertConjure", holder, SIZE, function()
		for _, e in ipairs(Entries()) do
			if e.canShow and e.low then return e.gem or e.entry end
		end
		return nil
	end)

	-- Ready, as in the window: the next row's icon with play over it, glowing while Ready is lit.
	playButton = ns.UI.NewReadyButton(holder, "ConjurerAlertPlay", SIZE)
	playButton:SetScript("OnClick", ns.Guard("alert play", A.TogglePlay))
	playButton:SetScript("OnEnter", function(self)
		GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
		if ns.Conjure.armed then
			GameTooltip:SetText("Stop conjuring", 1, 1, 1)
		else
			GameTooltip:SetText("Start conjuring", 1, 1, 1)
			GameTooltip:AddLine("Then hold " .. ns.Conjure.KeyText() .. " to conjure up to your targets.", nil, nil, nil, true)
		end
		GameTooltip:Show()
	end)
	playButton:SetScript("OnLeave", function() GameTooltip:Hide() end)
	Drag(playButton)
	-- In the panel's title bar, or at the end of the row without the panel; placed with the panel.
	local cogArt = COG_ART[#COG_ART]
	for _, set in ipairs(COG_ART) do
		if ns.HasAtlas(set[1]) then cogArt = set break end
	end
	cogButton = ArtButton(holder, COG, "ConjurerAlertSettings", cogArt[1], cogArt[3], cogArt[2], "...")
	cogButton:SetScript("OnClick", ns.Guard("alert settings", function() ns.UI.Show() end))
	cogButton:SetScript("OnEnter", function(self)
		GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
		GameTooltip:SetText("Conjurer settings", 1, 1, 1)
		GameTooltip:AddLine("Targets, shares, the alert and more.", nil, nil, nil, true)
		GameTooltip:Show()
	end)
	cogButton:SetScript("OnLeave", function() GameTooltip:Hide() end)
	Drag(cogButton)
	report["alert buttons"] = (playButton.playArt and "play art" or "words") .. ", " .. (cogButton.up and "cog art" or "words")

	-- The announce button, when it's turned on, after the click-to-conjure one.
	announceButton = ns.Announce and ns.Announce.Make(holder, COG)
	if announceButton then Drag(announceButton) end

	-- How far the conjuring has got, right under the icons and buttons.
	progress = ns.UI.NewProgress(holder, "ConjurerAlertProgress", SIZE, PROGRESS_H)
	progress:SetPoint("TOPLEFT", holder, "BOTTOMLEFT", -PROGRESS_OUT, -PROGRESS_GAP)
	progress:SetPoint("TOPRIGHT", holder, "BOTTOMRIGHT", PROGRESS_OUT, -PROGRESS_GAP)
	Drag(progress)

	holder:Hide()
	ns.Stage("idle")
end

-- The Ready button lights up while Ready is, as the window's does, and greys out in combat, when
-- conjuring can't start.
local function PaintPlay()
	if not playButton then return end
	ns.UI.PaintReady(playButton)
	local usable = (ns.Conjure and ns.Conjure.armed) or not Fighting()
	if not usable then playButton.icon:SetDesaturated(true) end
	playButton:SetAlpha(usable and 1 or 0.5)
end

-- The cog sits where ShardGrid's does, in the title bar's right end, sized to the shrunk panel as
-- its is, and the announce button mirrors it at the left end, 2 further in, as the panel's left edge
-- is 2 wider. Without the panel the cog ends the row, with the announce button under it when it
-- shows, the two a little smaller to fit one over the other.
local function PlaceCog(on)
	if not cogButton then return end
	local announce = announceButton and announceButton:IsShown()
	cogButton:ClearAllPoints()
	if announceButton then announceButton:ClearAllPoints() end
	if on then
		local fit = border.fit or 1
		local size = math.min(COG, 26 * fit)
		cogButton:SetSize(size, size)
		cogButton:SetPoint("TOPRIGHT", border, "TOPRIGHT", -5 * fit, -3 * fit)
		if announceButton then
			announceButton:SetSize(size, size)
			announceButton:SetPoint("TOPLEFT", border, "TOPLEFT", 7 * fit, -3 * fit)
		end
	elseif announce then
		local size = (SIZE - 4) / 2
		local x = cogX + (CONTROLS - size) / 2
		cogButton:SetSize(size, size)
		cogButton:SetPoint("TOPLEFT", holder, "TOPLEFT", x, 0)
		announceButton:SetSize(size, size)
		announceButton:SetPoint("BOTTOMLEFT", holder, "BOTTOMLEFT", x, 0)
	else
		cogButton:SetSize(COG, COG)
		cogButton:SetPoint("LEFT", holder, "LEFT", cogX + (CONTROLS - COG) / 2, 0)
	end
end

-- The panel's title: Conjurer, or how far the conjuring has got, the progress bar's count, as
-- ShardGrid's title gives its shard count. Green once every target is met.
function A.Title()
	if not ns.db.alert.titleProgress then return "Conjurer" end
	local done, total = ns.Conjure.Progress()
	if not total or total <= 0 then return "Nothing to conjure" end
	local text = done .. " of " .. total .. " (" .. math.floor(done * 100 / total) .. "%)"
	return done >= total and ("|cff80ff80" .. text .. "|r") or text
end

-- The panel round everything shown, the progress bar included, or no panel when it's turned off.
-- Too small for its metal corners, it is drawn at their size and shrunk, as ShardGrid's are: its
-- insets shrink with it, and its title is made bigger to stay readable.
function A.PaintBorder()
	if not border then return end
	local on = ns.db.alert.frame and true or false
	local withBar = progress and ns.db.alert.progress
	local below = withBar and (PROGRESS_GAP + PROGRESS_H) or 0
	local w, h = (holder:GetWidth() or SIZE) + 2 * SIDE, SIZE + below
	local fit = math.min(1, w / (MIN_W - INSET.left - INSET.right), h / (MIN_H - INSET.top - INSET.bottom))
	fit = math.max(MIN_FIT, fit)
	border:SetShown(on)
	border:SetScale(fit)
	-- In the panel's own units, so on screen the insets shrink with it.
	border:ClearAllPoints()
	border:SetPoint("TOPLEFT", holder, "TOPLEFT", -INSET.left - SIDE / fit, INSET.top)
	-- To the row's right edge either way: the progress bar reaches a little past it.
	local right = INSET.right + ((withBar and SIDE - PROGRESS_OUT) or SIDE) / fit
	border:SetPoint("BOTTOMRIGHT", withBar and progress or holder, "BOTTOMRIGHT", right, -INSET.bottom)
	border.fit = fit
	PlaceCog(on)
	local title = border.title
	if title then title:SetText(A.Title()) end
	if title and title.GetFont and title.SetFont then
		if not titleFont then titleFont = { title:GetFont() } end
		if titleFont[1] and titleFont[2] then
			title:SetFont(titleFont[1], math.min(titleFont[2] / fit, titleFont[2] * 1.5), titleFont[3])
		end
	end
	-- Kept on screen whole: the panel when it shows, the progress bar under the icons always.
	if holder.SetClampRectInsets then
		local s = on and fit or 0
		local side = on and SIDE or 0
		holder:SetClampRectInsets(-INSET.left * s - side, INSET.right * s + side, INSET.top * s, -(below + INSET.bottom * s))
	end
end

-- The progress bar under the icons, and the count written on it, each shown as the options say.
function A.PaintProgress()
	if not progress then return end
	local db = ns.db.alert
	progress:SetShown(db.progress and true or false)
	progress.text:SetShown(db.progressText and true or false)
	if db.progress then progress:Refresh() end
	A.PaintBorder()
end

-- Shows the icons for whatever is low right now. quiet: take the state without a sound (login).
function A.Update(quiet)
	if not ns.db then return end
	local db = ns.db.alert
	if A.sticky and not ns.Conjure.armed then A.sticky = nil end
	local show, labels = {}, {}
	for _, e in ipairs(Entries()) do
		local low = e.low
		if low and not wasLow[e.key] then
			if e.gem then
				ns.Log("alert: " .. e.gem.name .. " missing")
			else
				ns.Log("alert: " .. e.kind .. " low, " .. A.Total(e.kind) .. " left (alert below " .. tostring(db[e.kind]) .. ")")
			end
			if db.sound and not quiet and A.RightTime() then pcall(PlaySound, (SOUNDKIT and SOUNDKIT.MAP_PING) or 3175, "SFX") end
		elseif wasLow[e.key] and not low then
			ns.Log("alert: " .. e.label .. (e.gem and " back in your bags" or (" fine again, " .. A.Total(e.kind) .. " left")))
		end
		wasLow[e.key] = low
		local sticky = A.sticky and A.sticky[e.key]
		-- Kept on screen as a quick bar: water and food whether low or not (a gem only when missing).
		local always = db.enabled and db.always and not e.gem and A.RightTime()
		if ns.isMage and e.canShow and (sticky or (low and A.RightTime()) or always) then
			show[#show + 1] = e
			labels[#labels + 1] = e.label
		end
	end
	if #show == 0 then
		if holder then holder:Hide() end
		report["alert showing"] = "nothing"
		return
	end
	Build()
	for _, b in pairs(icons) do b:Hide() end
	for i, e in ipairs(show) do
		local b = Icon(e)
		b.icon:SetTexture(e.entry and ns.ItemIcon(e.entry) or nil)
		if ns.Click then ns.Click.SetCast(b, e.entry) end
		b.count:SetText(e.gem and "" or A.Total(e.kind))
		b:ClearAllPoints()
		b:SetPoint("LEFT", holder, "LEFT", (i - 1) * (SIZE + GAP), 0)
		b:Show()
		local glowing = e.low
		b.glow:SetShown(glowing and true or false)
		if glowing and not b.anim:IsPlaying() then b.anim:Play() elseif not glowing then b.anim:Stop() end
	end
	local iconsWidth = #show * SIZE + (#show - 1) * GAP
	local x = iconsWidth + GAP
	if conjureButton then
		conjureButton:ClearAllPoints()
		conjureButton:SetPoint("LEFT", holder, "LEFT", x, 0)
		conjureButton:Show()
		x = x + SIZE + GAP
	end
	-- The announce button, placed with the cog: in the panel's title bar, or under the cog without it.
	if announceButton then announceButton:SetShown(ns.Announce.Wanted()) end
	playButton:ClearAllPoints()
	playButton:SetPoint("LEFT", holder, "LEFT", x, 0)
	x = x + SIZE + GAP
	-- The cog takes the panel's title bar, or the end of the row without the panel.
	cogX = x
	holder:SetWidth(db.frame and (x - GAP) or (x + CONTROLS))
	PaintPlay()
	A.PaintProgress()
	holder:Show()
	report["alert showing"] = table.concat(labels, " and ") .. (A.sticky and " (conjuring)" or "")
		.. (db.always and " (kept on screen)" or "")
end

-- Called with every refresh of the addon: keeps the play button's face and the counts current.
function A.Refresh()
	if A.sticky and not ns.Conjure.armed then
		A.sticky = nil
		A.Update(true)
		return
	end
	if holder and holder:IsShown() then
		for _, b in pairs(icons) do
			if b:IsShown() then b.count:SetText(b.gem and "" or A.Total(b.kind)) end
		end
		PaintPlay()
		A.PaintProgress()
	end
end

-- The size slider: the bar's scale, keeping its top left corner where it is on screen.
function A.SetScale(pct)
	ns.db.alert.scale = pct
	if not holder then return end
	local old, s = holder:GetScale(), Scale()
	local left, top = holder:GetLeft(), holder:GetTop()
	holder:SetScale(s)
	if left and top and old then
		holder:ClearAllPoints()
		holder:SetPoint("TOPLEFT", UIParent, "BOTTOMLEFT", left * old / s, top * old / s)
		SavePoint()
	end
end

function A.SetWhen(when)
	ns.db.alert.when = when
	ns.Log("alert shows: " .. tostring(A.WHEN_LABEL[when]))
	A.Update(true)
	ns.Refresh()
end

function A.Summary()
	local db = ns.db.alert
	if not db.enabled then return "off" end
	local low = {}
	for _, kind in ipairs(ns.KIND_ORDER) do
		if A.Low(kind) then low[#low + 1] = kind end
	end
	for r = #ns.GEMS, 1, -1 do
		if A.GemMissing(ns.GEMS[r]) then low[#low + 1] = ns.GEMS[r].name end
	end
	return (db.always and "always shown" or "shown when low") .. ", water below " .. tostring(db.water)
		.. ", food below " .. tostring(db.food) .. ", "
		.. (A.WHEN_LABEL[db.when or "out"] or "Out of combat"):lower()
		.. (#low > 0 and (", " .. table.concat(low, " and ") .. " low now") or "")
end

function A.Init()
	A.Update(true)
end

ns.On("BAG_UPDATE_DELAYED", function() A.Update() end)
ns.On("SPELLS_CHANGED", function() A.Update(true) end)
ns.On("PLAYER_LEVEL_UP", function() ns.After(1, function() A.Update() end) end)
ns.On("PLAYER_REGEN_DISABLED", function()
	A.combat = true
	A.Update()
end)
ns.On("PLAYER_REGEN_ENABLED", function()
	A.combat = false
	A.Update()
end)

ns.debugSources[#ns.debugSources + 1] = function()
	local db = ns.db and ns.db.alert
	if not db then return {} end
	return {
		"quick access bar: " .. (db.enabled and "on" or "off") .. ", " .. (db.always and "always shown" or "shown when low")
			.. ", " .. tostring(A.WHEN_LABEL[db.when or "out"]):lower()
			.. ", water " .. A.Total("water") .. " (below " .. tostring(db.water) .. "), food " .. A.Total("food")
			.. " (below " .. tostring(db.food) .. "), showing " .. tostring(report["alert showing"] or "nothing")
			.. ", buttons " .. tostring(report["alert buttons"] or "not built")
			.. ", frame " .. (db.frame and "on" or "off") .. " (" .. tostring(report["alert frame"] or "not built") .. ")"
			.. ", size " .. tostring(db.scale or 100) .. "%" .. (db.titleProgress and ", count in its title" or "")
			.. ", progress bar " .. (db.progress and "on" or "off") .. " (" .. tostring(report["progress bar art"] or "not built") .. ")",
	}
end
