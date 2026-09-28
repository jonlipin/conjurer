-- Conjurer
-- Minimap: a button on the minimap rim.
--
-- Built by hand rather than through LibDBIcon. It sits at a saved angle, and dragging it moves it
-- around the rim. Left click opens the window, right click turns Ready on or off.

local ADDON, ns = ...
local report = ns.report
local M = {}
ns.Minimap = M

local button

-- The angle in DEGREES. The game's own global atan2 already answers in degrees while math.atan2
-- answers in radians, so each route is converted on its own terms.
local function AngleDegrees(y, x)
	if math.atan2 then return math.deg(math.atan2(y, x)) end
	if atan2 then return atan2(y, x) end
	return math.deg(math.atan(y, x))
end

local function Place()
	if not button then return end
	local angle = math.rad(ns.db.minimap.angle or 200)
	local radius = ((Minimap:GetWidth() or 140) / 2) + 6
	button:ClearAllPoints()
	button:SetPoint("CENTER", Minimap, "CENTER", math.cos(angle) * radius, math.sin(angle) * radius)
end

local function Icon()
	local top = ns.WATER[#ns.WATER]
	if C_Spell and C_Spell.GetSpellTexture then
		local ok, icon = pcall(C_Spell.GetSpellTexture, top.spell)
		if ok and icon then return icon end
	end
	return "Interface\\Icons\\INV_Drink_18"
end

local function Tooltip(self)
	GameTooltip:SetOwner(self, "ANCHOR_LEFT")
	GameTooltip:SetText("Conjurer", 1, 1, 1)
	local title, detail = ns.Conjure.Status()
	GameTooltip:AddLine(title, ns.Conjure.armed and 0.35 or 1, ns.Conjure.armed and 0.85 or 0.82, ns.Conjure.armed and 1 or 0)
	GameTooltip:AddLine(detail, 0.8, 0.8, 0.8, true)
	GameTooltip:AddLine("Group: " .. ns.Trade.Summary(), 0.6, 0.85, 1)
	GameTooltip:AddLine(" ")
	GameTooltip:AddLine("Left-click: open Conjurer", 0.7, 0.7, 0.7)
	GameTooltip:AddLine("Right-click: Ready on or off", 0.7, 0.7, 0.7)
	GameTooltip:AddLine("Drag: move around the minimap", 0.7, 0.7, 0.7)
	GameTooltip:Show()
end

local function Build()
	button = CreateFrame("Button", "ConjurerMinimapButton", Minimap)
	button:SetSize(31, 31)
	button:SetFrameStrata("MEDIUM")
	button:SetFrameLevel((Minimap:GetFrameLevel() or 1) + 8)
	button:RegisterForClicks("LeftButtonUp", "RightButtonUp")
	button:RegisterForDrag("LeftButton")
	button:SetHighlightTexture("Interface\\Minimap\\UI-Minimap-ZoomButton-Highlight")

	local backing = button:CreateTexture(nil, "BACKGROUND")
	backing:SetSize(20, 20)
	backing:SetPoint("TOPLEFT", 7, -5)
	backing:SetTexture("Interface\\Minimap\\UI-Minimap-Background")

	local icon = button:CreateTexture(nil, "ARTWORK")
	icon:SetSize(17, 17)
	icon:SetPoint("TOPLEFT", 8, -6)
	icon:SetTexture(Icon())
	button.icon = icon

	-- Lit while Ready is on, like the window's Ready button.
	local lit = button:CreateTexture(nil, "OVERLAY", nil, 1)
	lit:SetSize(24, 24)
	lit:SetPoint("CENTER", icon, "CENTER")
	lit:SetColorTexture(0.35, 0.75, 1, 0.35)
	lit:SetBlendMode("ADD")
	lit:Hide()
	button.lit = lit

	local border = button:CreateTexture(nil, "OVERLAY")
	border:SetSize(53, 53)
	border:SetPoint("TOPLEFT")
	border:SetTexture("Interface\\Minimap\\MiniMap-TrackingBorder")

	button:SetScript("OnClick", ns.Guard("minimap button", function(_, which)
		if which == "RightButton" then
			if ns.isMage then ns.Conjure.Toggle() else ns.Print("Conjurer is for mages.") end
		else
			ns.UI.Toggle()
		end
	end))
	button:SetScript("OnDragStart", function(self)
		self:SetScript("OnUpdate", function()
			local mx, my = Minimap:GetCenter()
			local scale = Minimap:GetEffectiveScale()
			local cx, cy = GetCursorPosition()
			if not (mx and my and cx and cy and scale and scale ~= 0) then return end
			ns.db.minimap.angle = AngleDegrees(cy / scale - my, cx / scale - mx) % 360
			Place()
		end)
	end)
	button:SetScript("OnDragStop", function(self) self:SetScript("OnUpdate", nil) end)
	button:SetScript("OnEnter", Tooltip)
	button:SetScript("OnLeave", function() GameTooltip:Hide() end)
end

function M.Apply()
	if not Minimap or not ns.db then return end
	local wanted = ns.db.minimap.shown and ns.isMage
	if not button then
		if not wanted then return end
		local ok, err = pcall(Build)
		report["minimap button"] = ok and "ok" or ("failed: " .. tostring(err))
		if not ok then return end
	end
	button:SetShown(wanted and true or false)
	Place()
	M.Refresh()
end

function M.Refresh()
	if button and button.lit then button.lit:SetShown(ns.Conjure and ns.Conjure.armed or false) end
end

function M.Init()
	M.Apply()
end
