-- Conjurer
-- Alert: the quick access bar. Icons for your conjured water and food, shown when they run low or
-- all the time, with the click-to-conjure button, play and stop for Ready, the cog and a progress bar.
--
-- One icon per kind that is low, side by side, each dressed as an action bar button with the proc
-- glow and how many you have left. Beside them, a play button that starts conjuring (stop while
-- it runs) and a cog that opens Conjurer. Started from here, the alert stays up until conjuring
-- stops, so its stop button stays in reach. It can show out of combat (the default), in combat, or
-- always, only for a kind you can conjure. "Low" counts your best rank and anything better you can
-- use (another mage's), since that is what you conjure; lower ranks count only when ticked.

local ADDON, ns = ...
local report = ns.report
local A = {}
ns.Alert = A

local SIZE = 40
local GAP = 6
local CONTROLS = 24
local holder, controls, playButton, cogButton, conjureButton, progress
local icons = {}
local wasLow = { water = false, food = false }
A.combat = false
A.preview = false
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
		local kind = self.kind
		GameTooltip:SetText("Conjured " .. ns.KIND_LABEL[kind]:lower() .. " is low", 1, 0.82, 0)
		local top = ns.TopKnown(kind)
		local what = (top and not ns.db.alert.lowerRanks) and (ns.ItemName(top) .. " or better") or "of every rank"
		GameTooltip:AddLine(A.Total(kind) .. " " .. what .. " left; the alert shows below " .. tostring(ns.db.alert[kind]) .. ".", 1, 1, 1, true)
	end
	if A.preview then GameTooltip:AddLine("Showing so you can move it. Drag it where you want it.", 0.6, 0.85, 1, true) end
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

local PLAY = { "charactercreate-customize-playbutton", "charactercreate-customize-playbutton-down" }
local STOP = { "charactercreate-customize-stopbutton", "charactercreate-customize-stopbutton-down" }

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

local function Build()
	if holder then return end
	ns.Stage("building the alert")
	holder = CreateFrame("Frame", "ConjurerAlert", UIParent)
	holder:SetSize(SIZE, SIZE)
	holder:SetFrameStrata("MEDIUM")
	holder:SetMovable(true)
	holder:SetClampedToScreen(true)
	Place()
	for _, kind in ipairs(ns.KIND_ORDER) do Icon({ key = kind, kind = kind }) end
	-- Conjures by click, one cast each: the next row short of its target, or when every target is met,
	-- whatever the alert shows as low.
	conjureButton = ns.Click and ns.Click.Make("ConjurerAlertConjure", holder, SIZE, function()
		for _, e in ipairs(Entries()) do
			if e.canShow and e.low then return e.gem or e.entry end
		end
		return nil
	end)

	controls = CreateFrame("Frame", nil, holder)
	controls:SetSize(CONTROLS, SIZE)
	playButton = ArtButton(controls, 22, "ConjurerAlertPlay", PLAY[1], PLAY[2], nil, "Go")
	playButton:SetPoint("TOP", controls, "TOP", 0, 0)
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
	cogButton = ArtButton(controls, 18, "ConjurerAlertSettings", "gm-icon-settings", "gm-icon-settings-pressed",
		"gm-icon-settings-hover", "...")
	cogButton:SetPoint("BOTTOM", controls, "BOTTOM", 0, 0)
	cogButton:SetScript("OnClick", ns.Guard("alert settings", function() ns.UI.Show() end))
	cogButton:SetScript("OnEnter", function(self)
		GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
		GameTooltip:SetText("Conjurer settings", 1, 1, 1)
		GameTooltip:AddLine("Targets, shares, the alert and more.", nil, nil, nil, true)
		GameTooltip:Show()
	end)
	cogButton:SetScript("OnLeave", function() GameTooltip:Hide() end)
	Drag(cogButton)
	report["alert buttons"] = (playButton.up and "play art" or "words") .. ", " .. (cogButton.up and "cog art" or "words")

	-- How far the conjuring has got, right under the icons and buttons.
	progress = ns.UI.NewProgress(holder, "ConjurerAlertProgress", SIZE, 10)
	progress:SetPoint("TOPLEFT", holder, "BOTTOMLEFT", 0, -5)
	progress:SetPoint("TOPRIGHT", holder, "BOTTOMRIGHT", 0, -5)
	Drag(progress)

	holder:Hide()
	ns.Stage("idle")
end

-- The play button shows stop while conjuring runs, and greys out in combat, when it can't start.
local function PaintPlay()
	if not playButton then return end
	local armed = ns.Conjure and ns.Conjure.armed
	if playButton.up then
		local set = armed and STOP or PLAY
		playButton.up = ns.HasAtlas(set[1]) and set[1] or playButton.up
		playButton.down = ns.HasAtlas(set[2]) and set[2] or playButton.up
		playButton.art:SetAtlas(playButton.up)
	elseif playButton.label then
		playButton.label:SetText(armed and "Stop" or "Go")
	end
	local usable = armed or not Fighting()
	playButton.art:SetDesaturated(not usable)
	playButton:SetAlpha(usable and 1 or 0.5)
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
		if ns.isMage and e.canShow and (A.preview or sticky or (low and A.RightTime()) or always) then
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
		local glowing = e.low or A.preview
		b.glow:SetShown(glowing and true or false)
		if glowing and not b.anim:IsPlaying() then b.anim:Play() elseif not glowing then b.anim:Stop() end
	end
	local iconsWidth = #show * SIZE + (#show - 1) * GAP
	controls:ClearAllPoints()
	local x = iconsWidth + GAP
	if conjureButton then
		conjureButton:ClearAllPoints()
		conjureButton:SetPoint("LEFT", holder, "LEFT", x, 0)
		conjureButton:Show()
		x = x + SIZE + GAP
	end
	controls:SetPoint("LEFT", holder, "LEFT", x, 0)
	holder:SetWidth(x + CONTROLS)
	PaintPlay()
	if progress then progress:Refresh() end
	holder:Show()
	report["alert showing"] = table.concat(labels, " and ") .. (A.preview and " (moving)" or "") .. (A.sticky and " (conjuring)" or "")
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
		if progress then progress:Refresh() end
	end
end

-- Shows both icons whatever you have, so they can be dragged into place.
function A.SetPreview(on)
	A.preview = on and true or false
	A.Update(true)
	ns.Refresh()
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
			.. ", buttons " .. tostring(report["alert buttons"] or "not built"),
	}
end
