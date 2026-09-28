-- Conjurer
-- Alert: icons that show when your conjured water or food runs low.
--
-- One icon per kind that is low, side by side, each dressed as an action bar button with the proc
-- glow and how many you have left. Drag either to move them; click to open Conjurer, right-click
-- to start conjuring. Hidden in combat, when nothing can be done about it, and only for a kind
-- you can conjure. "Low" counts every rank you are high enough to eat or drink.

local ADDON, ns = ...
local report = ns.report
local A = {}
ns.Alert = A

local SIZE = 40
local GAP = 6
local holder
local icons = {}
local wasLow = { water = false, food = false }
A.combat = false
A.preview = false

-- What you have of a kind that you are high enough to use, across every rank.
function A.Total(kind)
	local level = ns.Clean(UnitLevel("player"))
	level = type(level) == "number" and level or 60
	local n = 0
	for _, entry in ipairs(ns.KINDS[kind]) do
		if entry.level <= level then n = n + ns.Count(entry.item) end
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
	local kind = self.kind
	local label = ns.KIND_LABEL[kind]
	GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
	GameTooltip:SetText("Conjured " .. label:lower() .. " is low", 1, 0.82, 0)
	GameTooltip:AddLine(A.Total(kind) .. " left; the alert shows below " .. tostring(ns.db.alert[kind]) .. ".", 1, 1, 1, true)
	if A.preview then GameTooltip:AddLine("Showing so you can move it. Drag it where you want it.", 0.6, 0.85, 1, true) end
	GameTooltip:AddLine(" ")
	GameTooltip:AddLine("Click: open Conjurer", 0.7, 0.7, 0.7)
	GameTooltip:AddLine("Right-click: start conjuring", 0.7, 0.7, 0.7)
	GameTooltip:AddLine("Drag: move", 0.7, 0.7, 0.7)
	GameTooltip:Show()
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
	for _, kind in ipairs(ns.KIND_ORDER) do
		local b = CreateFrame("Button", "ConjurerAlert" .. ns.KIND_LABEL[kind], holder)
		b:SetSize(SIZE, SIZE)
		b.kind = kind
		ns.UI.DressIcon(b, SIZE)
		b.count = b:CreateFontString(nil, "OVERLAY", "NumberFontNormal")
		b.count:SetPoint("BOTTOMRIGHT", -3, 3)
		b.glow, b.anim = ns.UI.MakeGlow(b, SIZE)
		b:RegisterForClicks("LeftButtonUp", "RightButtonUp")
		b:RegisterForDrag("LeftButton")
		b:SetScript("OnDragStart", function() holder:StartMoving() end)
		b:SetScript("OnDragStop", ns.Guard("alert drag", function()
			holder:StopMovingOrSizing()
			SavePoint()
		end))
		b:SetScript("OnClick", ns.Guard("alert click", function(_, which)
			if which == "RightButton" then
				if ns.Conjure.armed then ns.Conjure.Disarm("Ready is off.") else ns.Conjure.Arm() end
			else
				ns.UI.Show()
			end
		end))
		b:SetScript("OnEnter", Tooltip)
		b:SetScript("OnLeave", function() GameTooltip:Hide() end)
		b:Hide()
		icons[kind] = b
	end
	holder:Hide()
	ns.Stage("idle")
end

-- Shows the icons for whatever is low right now. quiet: take the state without a sound (login).
function A.Update(quiet)
	if not ns.db then return end
	local db = ns.db.alert
	local show = {}
	for _, kind in ipairs(ns.KIND_ORDER) do
		local low = A.Low(kind)
		if low and not wasLow[kind] then
			ns.Log("alert: " .. kind .. " low, " .. A.Total(kind) .. " left (alert below " .. tostring(db[kind]) .. ")")
			if db.sound and not quiet then pcall(PlaySound, (SOUNDKIT and SOUNDKIT.MAP_PING) or 3175, "SFX") end
		elseif wasLow[kind] and not low then
			ns.Log("alert: " .. kind .. " fine again, " .. A.Total(kind) .. " left")
		end
		wasLow[kind] = low
		local canShow = ns.isMage and ns.TopKnown(kind) ~= nil
		if (A.preview and canShow) or (low and not (A.combat or ns.InCombat())) then show[#show + 1] = kind end
	end
	if #show == 0 then
		if holder then holder:Hide() end
		report["alert showing"] = "nothing"
		return
	end
	Build()
	for _, kind in ipairs(ns.KIND_ORDER) do icons[kind]:Hide() end
	for i, kind in ipairs(show) do
		local b = icons[kind]
		local top = ns.TopKnown(kind)
		b.icon:SetTexture(top and ns.ItemIcon(top) or nil)
		b.count:SetText(A.Total(kind))
		b:ClearAllPoints()
		b:SetPoint("LEFT", holder, "LEFT", (i - 1) * (SIZE + GAP), 0)
		b:Show()
		b.glow:Show()
		if not b.anim:IsPlaying() then b.anim:Play() end
	end
	holder:SetWidth(#show * SIZE + (#show - 1) * GAP)
	holder:Show()
	report["alert showing"] = table.concat(show, " and ") .. (A.preview and " (moving)" or "")
end

-- Shows both icons whatever you have, so they can be dragged into place.
function A.SetPreview(on)
	A.preview = on and true or false
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
	return "water below " .. tostring(db.water) .. ", food below " .. tostring(db.food)
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
		"low alert: " .. (db.enabled and "on" or "off") .. ", water " .. A.Total("water") .. " (below " .. tostring(db.water)
			.. "), food " .. A.Total("food") .. " (below " .. tostring(db.food) .. "), showing " .. tostring(report["alert showing"] or "nothing"),
	}
end
