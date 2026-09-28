-- Conjurer
-- Click: a button that conjures with the mouse, one cast per click, in the window and on the alert.
--
-- The client only repeats a held cast for a key bound to one of its own action bar buttons. Its
-- SecureTemplates.lua passes the "key press" flag to no mouse click, not even on its own bars
-- (ActionBarActionButtonMixin:TriggerSecureClick), so holding the mouse down conjures once; to
-- hold, Ready and a key are the way (a side mouse button can be the key).
--
-- The button is made from InsecureActionButtonTemplate, the client's template for casting from a
-- click out of combat on a frame that isn't protected, so it can sit in the window and on the
-- alert without locking either of them in combat. Its spell is the next row still short of its
-- target, counting what has landed but not reached the bags yet (about a second) and the cast
-- going now, so a click queued during a row's last cast already makes the next row.

local ADDON, ns = ...
local report = ns.report
local K = {}
ns.Click = K

local buttons = {}
local pending, lastCount, pendingAt = {}, {}, {}
local inflight -- { spell, guid } of the conjure being cast now
local PENDING_FOR = 5 -- seconds after which items still on their way are no longer counted

local function Pending(entry)
	local n = pending[entry.item] or 0
	if n > 0 and pendingAt[entry.item] and GetTime() - pendingAt[entry.item] > PENDING_FOR then
		pending[entry.item] = 0
		return 0
	end
	return n
end

-- What a row will have once everything cast so far has arrived.
function K.Expected(entry)
	local y = ns.Conjure.Yield(entry) or 1
	return ns.Count(entry.item) + Pending(entry) + ((inflight and inflight.spell == entry.spell) and y or 0)
end

-- The next row a click conjures: the first still short of its target, as Ready would take them.
function K.NextRow()
	for _, entry in ipairs(ns.Conjure.Rows()) do
		if ns.Known(entry.spell) and K.Expected(entry) < ns.Target(entry) then return entry end
	end
	return nil
end

-- ------------------------------------------------------------------
-- The buttons
-- ------------------------------------------------------------------

local function Paint(b)
	local row = K.NextRow()
	local fallback = false
	if not row and b.fallback then
		row = b.fallback()
		fallback = row ~= nil
	end
	b.row, b.isFallback = row, fallback
	if row then
		b:SetAttribute("type", "spell")
		b:SetAttribute("spell", row.spell)
		b.icon:SetTexture(ns.SpellIcon(row))
	else
		b:SetAttribute("type", nil)
		b:SetAttribute("spell", nil)
		local top = ns.TopKnown("water") or ns.WATER[1]
		b.icon:SetTexture(ns.SpellIcon(top))
	end
	b.icon:SetDesaturated((not row or ns.InCombat()) and true or false)
end

local function Tooltip(self)
	GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
	local row = self.row
	if ns.InCombat() then
		GameTooltip:SetText("Conjure by click", 1, 1, 1)
		GameTooltip:AddLine("Out of combat only.", 1, 0.5, 0.5, true)
	elseif row then
		GameTooltip:SetText("Conjure " .. ns.ShortName(row), 1, 1, 1)
		if self.isFallback then
			GameTooltip:AddLine("Every target is met, but you're low: a click conjures more anyway.", 1, 0.82, 0, true)
		else
			GameTooltip:AddLine(ns.Count(row.item) .. " of " .. ns.Target(row) .. " ("
				.. ns.PROFILE_BY_KEY[ns.ProfileKey()].label .. ")", 1, 0.82, 0)
		end
		GameTooltip:AddLine("Each click conjures once, then the next row comes up by itself.", 0.8, 0.8, 0.8, true)
	else
		GameTooltip:SetText("Nothing to conjure", 1, 1, 1)
		GameTooltip:AddLine("Every target is met. Raise a target to conjure more.", 0.8, 0.8, 0.8, true)
	end
	GameTooltip:AddLine("Holding the mouse button doesn't repeat: the game only repeats a held cast for a key. To hold, click play and hold "
		.. ns.Conjure.KeyText() .. " (a side mouse button can be the key).", 0.6, 0.85, 1, true)
	GameTooltip:Show()
end

-- A click button of the given size. fallback, when given, names what to conjure once every target
-- is met (the alert uses it for whatever it shows as low). Nil when the client lacks the template.
function K.Make(name, parent, size, fallback)
	local ok, b = pcall(CreateFrame, "Button", name, parent, "InsecureActionButtonTemplate")
	if not (ok and b) then
		report["click button"] = "none (no InsecureActionButtonTemplate)"
		return nil
	end
	b:SetSize(size, size)
	b:RegisterForClicks("LeftButtonUp")
	-- The cast happens on the release, whatever Cast on Key Down says.
	b:SetAttribute("useOnKeyDown", false)
	ns.UI.DressIcon(b, size)
	b.fallback = fallback
	b:SetScript("PostClick", ns.Guard("click conjure", function(self)
		if ns.InCombat() then
			ns.Log("click in combat: nothing (out of combat only)")
		elseif self.row then
			ns.Log("click: conjure " .. self.row.name .. (self.isFallback and " (the alert's pick)" or "") .. " ("
				.. ns.Count(self.row.item) .. "/" .. ns.Target(self.row) .. ")")
		else
			ns.Log("click: nothing to conjure")
		end
	end))
	b:SetScript("OnEnter", Tooltip)
	b:SetScript("OnLeave", function() GameTooltip:Hide() end)
	buttons[#buttons + 1] = b
	report["click button"] = "InsecureActionButtonTemplate"
	Paint(b)
	return b
end

function K.Refresh()
	for _, b in ipairs(buttons) do Paint(b) end
end

-- ------------------------------------------------------------------
-- Casts and arrivals
-- ------------------------------------------------------------------

local castFrame = CreateFrame("Frame")
castFrame:SetScript("OnEvent", ns.Guard("click cast watch", function(_, event, unit, guid, spell)
	if ns.Clean(unit) ~= "player" then return end
	spell, guid = ns.Clean(spell), ns.Clean(guid)
	local entry = spell and ns.BY_SPELL[spell]
	if not entry then return end
	if event == "UNIT_SPELLCAST_START" then
		inflight = { spell = spell, guid = guid }
	elseif event == "UNIT_SPELLCAST_SUCCEEDED" then
		if inflight and inflight.guid == guid then inflight = nil end
		if lastCount[entry.item] == nil then lastCount[entry.item] = ns.Count(entry.item) end
		pending[entry.item] = (pending[entry.item] or 0) + (ns.Conjure.Yield(entry) or 1)
		pendingAt[entry.item] = GetTime()
	elseif inflight and inflight.guid == guid then
		inflight = nil
	end
	K.Refresh()
end))
for _, event in ipairs({ "UNIT_SPELLCAST_START", "UNIT_SPELLCAST_SUCCEEDED", "UNIT_SPELLCAST_INTERRUPTED",
	"UNIT_SPELLCAST_FAILED", "UNIT_SPELLCAST_FAILED_QUIET" }) do
	if castFrame.RegisterUnitEvent then
		pcall(castFrame.RegisterUnitEvent, castFrame, event, "player")
	else
		pcall(castFrame.RegisterEvent, castFrame, event)
	end
end

-- What reached the bags comes off what was on its way, however many updates it takes.
ns.On("BAG_UPDATE_DELAYED", function()
	for item in pairs(pending) do
		local now = ns.Count(item)
		local before = lastCount[item]
		if before and now > before then pending[item] = math.max(0, pending[item] - (now - before)) end
		lastCount[item] = now
	end
	K.Refresh()
end)
ns.On("PLAYER_REGEN_DISABLED", function() K.Refresh() end)
ns.On("PLAYER_REGEN_ENABLED", function() K.Refresh() end)

ns.debugSources[#ns.debugSources + 1] = function()
	local b = buttons[1]
	return {
		"click button: " .. tostring(report["click button"] or "not built") .. "; next "
			.. tostring(b and b.row and b.row.name or "nothing"),
	}
end
