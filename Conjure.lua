-- Conjurer
-- Conjure: Ready, the borrowed action bar button and hold to cast.
--
-- Why a Blizzard bar button: the client's hold to cast (Options > Combat > Press and Hold Casting)
-- only repeats a cast that reaches UseAction with the "key press" flag set, and the client's own
-- SecureTemplates.xml says addons cannot set that flag on their own buttons. Blizzard's action bar
-- key bindings do set it (MultiActionButtonDown -> TryUseActionButton). So while Ready is lit,
-- Conjurer puts the next conjure spell on a button of an action bar you don't show and points your
-- chosen key at that button's own binding, MULTIACTIONBAR7BUTTON12 for example. Holding the key
-- is then exactly holding a normal action bar key, and the game repeats the cast.
--
-- When a row reaches its target the button gets the next row's spell straight away, so a hold
-- that keeps going moves on by itself if the game reads the button again for each repeat. When
-- every row is done the button is emptied and Ready switches off.

local ADDON, ns = ...
local report = ns.report
local C = {}
ns.Conjure = C

C.armed = false
C.where = nil   -- the borrowed button: { bar, index, slot, command, label, shown }
C.placed = nil  -- the entry the borrowed button holds
C.hold = { presses = 0, releases = 0, current = 0, best = 0, casts = 0, held = false }

local BARS = {
	{ bar = "MultiBar7", page = "MULTIBAR_7_ACTIONBAR_PAGE", fallback = 15, prefix = "MULTIACTIONBAR7BUTTON", label = "Action Bar 8" },
	{ bar = "MultiBar6", page = "MULTIBAR_6_ACTIONBAR_PAGE", fallback = 14, prefix = "MULTIACTIONBAR6BUTTON", label = "Action Bar 7" },
	{ bar = "MultiBar5", page = "MULTIBAR_5_ACTIONBAR_PAGE", fallback = 13, prefix = "MULTIACTIONBAR5BUTTON", label = "Action Bar 6" },
	{ bar = "MultiBarLeft", page = "LEFT_ACTIONBAR_PAGE", fallback = 4, prefix = "MULTIACTIONBAR4BUTTON", label = "Action Bar 5" },
	{ bar = "MultiBarRight", page = "RIGHT_ACTIONBAR_PAGE", fallback = 3, prefix = "MULTIACTIONBAR3BUTTON", label = "Action Bar 4" },
	{ bar = "MultiBarBottomRight", page = "BOTTOMRIGHT_ACTIONBAR_PAGE", fallback = 5, prefix = "MULTIACTIONBAR2BUTTON", label = "Action Bar 3" },
	{ bar = "MultiBarBottomLeft", page = "BOTTOMLEFT_ACTIONBAR_PAGE", fallback = 6, prefix = "MULTIACTIONBAR1BUTTON", label = "Action Bar 2" },
}
local BAR_BY_NAME = {}
for _, b in ipairs(BARS) do BAR_BY_NAME[b.bar] = b end

local CVARS = { "ActionButtonUseKeyHeldSpell", "ActionButtonUseKeyDown" }
local CVAR_LABEL = { ActionButtonUseKeyHeldSpell = "Press and Hold Casting", ActionButtonUseKeyDown = "Cast on Key Down" }

-- ------------------------------------------------------------------
-- Action bar slots
-- ------------------------------------------------------------------

local function ActionInfo(slot)
	if not GetActionInfo then return nil end
	local ok, kind, id = pcall(GetActionInfo, slot)
	if not ok then return nil end
	return ns.Clean(kind), ns.Clean(id)
end

local function HasAnAction(slot)
	local fn = (C_ActionBar and C_ActionBar.HasAction) or HasAction
	if fn then
		local ok, has = pcall(fn, slot)
		if ok then return ns.Clean(has) and true or false end
	end
	return ActionInfo(slot) ~= nil
end

-- The slot holds one of the conjure spells, so it is ours to reuse.
local function Ours(slot)
	local kind, id = ActionInfo(slot)
	return kind == "spell" and ns.BY_SPELL[id] ~= nil
end
C.Ours = Ours

local function Free(slot)
	return not HasAnAction(slot) or Ours(slot)
end

local function BarFrame(b) return _G[b.bar] end

-- The binding runs MultiActionButtonDown(bar, id), which reads bar.actionButtons[id].
local function Usable(b)
	local frame = BarFrame(b)
	return frame and type(frame.actionButtons) == "table" and frame.actionButtons[12] ~= nil
end

local function Shown(b)
	local frame = BarFrame(b)
	return frame and frame.IsShown and frame:IsShown() and true or false
end

local function Button(b, i)
	local frame = BarFrame(b)
	return frame and frame.actionButtons and frame.actionButtons[i]
end

local function SlotOf(b, i)
	local button = Button(b, i)
	local action = button and ns.Clean(button.action)
	if type(action) == "number" and action > 0 then return action end
	local page = tonumber(_G[b.page]) or b.fallback
	return (page - 1) * 12 + i
end

local function Where(b, i)
	local slot = SlotOf(b, i)
	if not (slot and Free(slot)) then return nil end
	local button = Button(b, i)
	local command = button and ns.Clean(button.commandName)
	return {
		bar = b.bar, index = i, slot = slot, label = b.label, shown = Shown(b),
		command = type(command) == "string" and command or (b.prefix .. i),
	}
end

-- A button on a bar you don't show, empty or already holding a conjure spell. The one used last
-- time comes first; a shown bar is used only when every hidden one is full.
function C.FindSlot()
	local saved = ns.db.slot
	if type(saved) == "table" and BAR_BY_NAME[saved.bar] and saved.index then
		local b = BAR_BY_NAME[saved.bar]
		if Usable(b) and not Shown(b) then
			local found = Where(b, saved.index)
			if found then return found end
		end
	end
	for pass = 1, 2 do
		for _, b in ipairs(BARS) do
			if Usable(b) and (Shown(b) == (pass == 2)) then
				for i = 12, 1, -1 do
					local found = Where(b, i)
					if found then return found end
				end
			end
		end
	end
	return nil
end

local function PickupSpellOnCursor(spell)
	local fn = (C_Spell and C_Spell.PickupSpell) or PickupSpell
	if not fn then return false, "this client has no PickupSpell" end
	local ok, err = pcall(fn, spell)
	if not ok then return false, tostring(err) end
	if not GetCursorInfo() then return false, "the spell did not come up on the cursor" end
	return true
end

local function PutOnSlot(slot)
	local fn = (C_ActionBar and C_ActionBar.PutActionInSlot) or PlaceAction
	if not fn then return false, "this client has no PutActionInSlot" end
	local ok, err = pcall(fn, slot)
	if not ok then return false, tostring(err) end
	return true
end

-- Puts an entry's spell on the borrowed button. Whatever the button held before comes back on the
-- cursor and is dropped, which only ever happens to a conjure spell of ours.
function C.Place(entry)
	local where = C.where
	if not where then return false, "no borrowed button" end
	if ns.InCombat() then return false, "in combat" end
	local kind, id = ActionInfo(where.slot)
	if kind == "spell" and id == entry.spell then
		C.placed = entry
		return true
	end
	if GetCursorInfo() then return false, "cursor busy" end
	if not Free(where.slot) then return false, "the button was taken by something else" end

	ns.Stage("placing " .. entry.name)
	local ok, why = PickupSpellOnCursor(entry.spell)
	if ok then ok, why = PutOnSlot(where.slot) end
	if GetCursorInfo() then ClearCursor() end
	ns.Stage("idle")

	kind, id = ActionInfo(where.slot)
	local placed = kind == "spell" and id == entry.spell
	report["last place"] = placed and ("ok, " .. entry.name .. " on slot " .. where.slot)
		or ("failed: " .. tostring(why or ("slot " .. where.slot .. " holds " .. tostring(kind) .. " " .. tostring(id))))
	ns.Log("place " .. entry.name .. " (spell " .. entry.spell .. "): " .. report["last place"])
	if placed then C.placed = entry end
	return placed, why
end

-- Empties the borrowed button, but only while it holds one of our spells.
function C.ClearSlot()
	local where = C.where
	if not where or ns.InCombat() or GetCursorInfo() then return false end
	if not Ours(where.slot) then return false end
	ns.Stage("emptying the borrowed button")
	local fn = (C_ActionBar and C_ActionBar.PickupAction) or PickupAction
	if fn then pcall(fn, where.slot) end
	if GetCursorInfo() then ClearCursor() end
	ns.Stage("idle")
	C.placed = nil
	local emptied = not Ours(where.slot)
	ns.Log("empty the borrowed button (slot " .. where.slot .. "): " .. (emptied and "ok" or "still holds a conjure spell"))
	return emptied
end

-- ------------------------------------------------------------------
-- Hold to cast settings
-- ------------------------------------------------------------------

local function GetSetting(name)
	local fn = (C_CVar and C_CVar.GetCVar) or GetCVar
	if not fn then return nil end
	local ok, v = pcall(fn, name)
	if ok and v ~= nil then return tostring(v) end
	return nil
end
C.GetSetting = GetSetting

local function SetSetting(name, value)
	local fn = (C_CVar and C_CVar.SetCVar) or SetCVar
	if not fn then return false end
	local ok = pcall(fn, name, value)
	return ok and GetSetting(name) == tostring(value)
end

-- Hold to cast needs both settings on.
function C.HoldReady()
	return GetSetting("ActionButtonUseKeyHeldSpell") == "1" and GetSetting("ActionButtonUseKeyDown") ~= "0"
end

-- Both settings as they stand: "1", "0", or nil where this client has no such setting.
function C.SettingState()
	return GetSetting("ActionButtonUseKeyHeldSpell"), GetSetting("ActionButtonUseKeyDown")
end

-- Turns both on for good, as if ticked in Options > Combat, and forgets any value Ready was going
-- to put back.
function C.TurnSettingsOn()
	if ns.InCombat() then
		ns.Print("Change it out of combat.")
		return false
	end
	local ok = true
	for _, name in ipairs(CVARS) do
		if GetSetting(name) ~= nil and GetSetting(name) ~= "1" then
			ns.Stage("turning on " .. name)
			local done = SetSetting(name, "1")
			ns.Stage("idle")
			ns.Log("setting " .. name .. " turned on for good: " .. (done and "ok" or "the client refused"))
			ok = ok and done
		end
		if ns.db.savedCVars then ns.db.savedCVars[name] = nil end
	end
	if ns.db.savedCVars and not next(ns.db.savedCVars) then ns.db.savedCVars = nil end
	if ok then
		ns.Print("Press and Hold Casting and Cast on Key Down are on.")
	else
		ns.Print("The game didn't let Conjurer change it. Tick Press and Hold Casting in Options > Combat.")
	end
	ns.Refresh()
	return ok
end

-- Turns both settings on while Ready is lit, remembering what they were. The memory is saved, so
-- a reload in the middle still puts them back at the next login.
function C.TakeSettings()
	if not ns.db.manageCVars then return end
	local saved = ns.db.savedCVars or {}
	for _, name in ipairs(CVARS) do
		local current = GetSetting(name)
		if current == nil then
			report["setting " .. name] = "not on this client"
		elseif current ~= "1" then
			if saved[name] == nil then saved[name] = current end
			ns.Stage("turning on " .. name)
			local ok = SetSetting(name, "1")
			ns.Stage("idle")
			report["setting " .. name] = ok and ("turned on by Conjurer (was " .. current .. ")") or "the client refused to change it"
		else
			report["setting " .. name] = "already on"
		end
		ns.Log("setting " .. name .. ": " .. tostring(report["setting " .. name]))
	end
	ns.db.savedCVars = next(saved) and saved or nil
end

function C.GiveBackSettings()
	local saved = ns.db and ns.db.savedCVars
	if not saved or ns.InCombat() then return end
	if ns.db.leaveCVarsOn then
		ns.Log("settings left on (the option to leave them on is ticked)")
		ns.db.savedCVars = nil
		return
	end
	for name, value in pairs(saved) do
		local ok = SetSetting(name, value)
		ns.Log("setting " .. name .. " put back to " .. tostring(value) .. (ok and "" or " (the client refused)"))
	end
	ns.db.savedCVars = nil
end

-- ------------------------------------------------------------------
-- The binding
--
-- The override binding belongs to a secure frame whose state driver clears it the moment combat
-- starts, so the key can never keep conjuring in a fight, even if the addon's own combat handler
-- came too late.
-- ------------------------------------------------------------------

local owner
local function Owner()
	if owner then return owner end
	local ok, frame = pcall(CreateFrame, "Frame", "ConjurerBindingOwner", UIParent, "SecureHandlerStateTemplate")
	if ok and frame then
		owner = frame
		local fine = pcall(function()
			frame:SetAttribute("_onstate-conjurercombat", [[ if newstate == "on" then self:ClearBindings() end ]])
			RegisterStateDriver(frame, "conjurercombat", "[combat] on; off")
		end)
		report["combat guard"] = fine and "secure state driver" or "could not register the state driver"
	else
		owner = CreateFrame("Frame", "ConjurerBindingOwner", UIParent)
		report["combat guard"] = "none (no SecureHandlerStateTemplate)"
	end
	return owner
end

local function Bind()
	local key, where = ns.db.key, C.where
	if not (key and where) then return false end
	ns.Stage("binding " .. key)
	local ok, err = pcall(SetOverrideBinding, Owner(), true, key, where.command)
	ns.Stage("idle")
	local check = GetBindingAction and select(2, pcall(GetBindingAction, key, true))
	report["binding"] = key .. " -> " .. where.command .. (ok and "" or (" failed: " .. tostring(err)))
		.. " (the client now reads " .. tostring(check) .. ")"
	ns.Log("bind " .. report["binding"])
	return ok
end

local function Unbind()
	if owner and ClearOverrideBindings then
		local ok, err = pcall(ClearOverrideBindings, owner)
		ns.Log("unbind: " .. (ok and "ok" or ("failed: " .. tostring(err))))
	end
end

-- The key's name the way the game prints it.
function C.KeyText(key)
	key = key or (ns.db and ns.db.key)
	if not key then return "no key" end
	if GetBindingText then
		local ok, text = pcall(GetBindingText, key)
		if ok and type(text) == "string" and text ~= "" then return text end
	end
	return key
end

-- ------------------------------------------------------------------
-- The plan
-- ------------------------------------------------------------------

-- Every row with a target, water first, best rank first.
function C.Rows()
	local rows = {}
	for _, kind in ipairs(ns.KIND_ORDER) do
		local list = ns.KINDS[kind]
		for r = #list, 1, -1 do
			if ns.Target(list[r]) > 0 then rows[#rows + 1] = list[r] end
		end
	end
	return rows
end

-- The first row still short of its target that this character can cast.
function C.CurrentRow()
	for _, entry in ipairs(C.Rows()) do
		if ns.Known(entry.spell) and ns.Count(entry.item) < ns.Target(entry) then return entry end
	end
	return nil
end

local function Chime(which)
	if not ns.db.chime then return end
	local id
	if which == "done" then
		id = (SOUNDKIT and SOUNDKIT.TUTORIAL_POPUP) or 7355
	else
		id = (SOUNDKIT and SOUNDKIT.IG_QUEST_LIST_COMPLETE) or 878
	end
	pcall(PlaySound, id, "SFX")
end

-- A line in the middle of the screen, where it is seen while holding a key with the window shut.
local function Announce(text)
	if UIErrorsFrame and UIErrorsFrame.AddMessage then
		pcall(UIErrorsFrame.AddMessage, UIErrorsFrame, text, 0.25, 0.78, 0.92, 1)
	end
end

local placeTries = 0
local function PlaceSoon(entry)
	local placed, why = C.Place(entry)
	if placed or not C.armed then
		placeTries = 0
		return placed
	end
	if why == "cursor busy" and placeTries < 40 then
		placeTries = placeTries + 1
		ns.After(0.25, function()
			if C.armed and C.CurrentRow() == entry then PlaceSoon(entry) end
		end)
	end
	return false
end

-- ------------------------------------------------------------------
-- Ready
-- ------------------------------------------------------------------

local function Refuse(message)
	ns.Print(message)
	ns.Log("Ready refused: " .. message)
	return false
end

function C.Arm()
	if C.armed then return true end
	if not ns.isMage then return Refuse("Conjurer is for mages; this character can't conjure food or water.") end
	if ns.InCombat() then return Refuse("You can't get Ready in combat.") end
	local row = C.CurrentRow()
	if not row then return Refuse("Nothing to conjure: every target is met. Raise a target first.") end
	if not ns.db.key then return Refuse("Pick the key you'll hold first, with the Key button.") end
	local where = C.FindSlot()
	if not where then
		report["borrowed button"] = "none free"
		return Refuse("Every action bar button is in use. Empty one button on Action Bar 6, 7 or 8 for Conjurer to borrow.")
	end
	C.where = where
	ns.db.slot = { bar = where.bar, index = where.index }
	report["borrowed button"] = where.label .. " button " .. where.index .. ", slot " .. where.slot
		.. (where.shown and " (a bar you show)" or " (a hidden bar)") .. ", binding " .. where.command

	ns.Log("Ready: next row " .. row.name .. " " .. ns.Count(row.item) .. "/" .. ns.Target(row) .. ", borrowing "
		.. report["borrowed button"])
	C.TakeSettings()
	local placed, why = C.Place(row)
	if not placed then
		C.GiveBackSettings()
		return Refuse("Couldn't put " .. ns.ShortName(row) .. " on the borrowed button: " .. tostring(why) .. ".")
	end
	if not Bind() then
		C.ClearSlot()
		C.GiveBackSettings()
		return Refuse("Couldn't bind " .. C.KeyText() .. ". Try another key.")
	end

	C.armed = true
	C.working, C.lastCount, C.early, C.inFlight = row, nil, nil, nil
	ns.Log("Ready is lit; hold to cast " .. (C.HoldReady() and "on" or "OFF (one cast per press)"))
	if not C.HoldReady() then
		ns.Print("Press and Hold Casting is off, so each press conjures once. Turn it on in Options > Combat to hold instead.")
	end
	if where.shown then
		ns.Print("Borrowed " .. where.label .. " button " .. where.index .. " (every hidden bar was full); it's emptied again when Ready goes off.")
	end
	Announce("Ready: hold " .. C.KeyText() .. " to conjure " .. ns.ShortName(row) .. ".")
	ns.Refresh()
	return true
end

function C.Disarm(reason)
	if not C.armed then return end
	C.armed = false
	Unbind()
	if ns.InCombat() then
		C.pendingCleanup = true
	else
		C.ClearSlot()
		C.GiveBackSettings()
	end
	C.placed = nil
	C.working, C.lastCount, C.early, C.inFlight = nil, nil, nil, nil
	C.hold.held = false
	if reason then ns.Print(reason) end
	ns.Log("Ready off: " .. tostring(reason) .. (C.pendingCleanup and " (button emptied after combat)" or ""))
	ns.SnapshotReport("Ready off")
	ns.Refresh()
end

function C.Toggle()
	if C.armed then
		C.Disarm("Ready is off.")
	else
		C.Arm()
	end
end

-- The key changed while Ready is lit.
function C.Rebind()
	if not C.armed or ns.InCombat() then return end
	Unbind()
	if not Bind() then C.Disarm("Couldn't bind " .. C.KeyText() .. ". Ready is off.") end
end

-- ------------------------------------------------------------------
-- Moving on from row to row
--
-- Seen in game (log of 2026-09-28): the client queues the next repeat of a held cast just before
-- the current one ends, and ends the hold once the button holds something else. A swap made after
-- a row's last cast has landed is one queued cast too late, so it made one conjure too many. So
-- Conjurer learns how many items one cast of each rank makes (it grows with your level) and, when
-- a cast that has just started will reach its row's target, swaps the button while that cast is
-- still going: the hold then ends exactly at the target. Either way the next row takes a new press.
-- ------------------------------------------------------------------

local function Level()
	local level = ns.Clean(UnitLevel("player"))
	return type(level) == "number" and level or 0
end

-- Items one cast of this rank makes at your level, once seen.
function C.Yield(entry)
	local y = ns.db.yield and ns.db.yield[entry.spell]
	if type(y) == "table" and y.level == Level() and tonumber(y.n) and y.n > 0 then return y.n end
	return nil
end

local function Learn(entry, n)
	if n <= 0 or n > 60 then return end
	ns.db.yield = ns.db.yield or {}
	local old = ns.db.yield[entry.spell]
	if type(old) == "table" and old.n == n and old.level == Level() then return end
	ns.db.yield[entry.spell] = { n = n, level = Level() }
	ns.Log("learned: one " .. entry.name .. " cast makes " .. n .. " at level " .. Level())
end

-- The row that comes after this one, as if this one were finished.
local function NextRowAfter(entry)
	for _, e in ipairs(C.Rows()) do
		if e ~= entry and ns.Known(e.spell) and ns.Count(e.item) < ns.Target(e) then return e end
	end
	return nil
end

-- A conjure has just started. If it will reach its row's target, the button moves on now.
function C.CastStarted(spell, guid)
	if not C.armed or ns.InCombat() then return end
	local placed = C.placed
	if not placed or placed.spell ~= spell then return end
	C.inFlight = guid
	local y = C.Yield(placed)
	if not y or ns.Count(placed.item) + y < ns.Target(placed) then return end
	local nextRow = NextRowAfter(placed)
	local ok
	if nextRow then ok = C.Place(nextRow) else ok = C.ClearSlot() end
	if ok then
		C.early = placed
		ns.Log("this cast finishes " .. placed.name .. "; the button " .. (nextRow and ("now holds " .. nextRow.name) or "is empty")
			.. ", so the hold stops at the target")
	end
end

-- The cast that was going to finish the row failed or was interrupted: the row isn't done, so its
-- spell goes back on the button.
function C.CastFailed(guid)
	if not (C.armed and guid and guid == C.inFlight) then return end
	C.inFlight = nil
	if C.early then
		ns.Log("the finishing cast of " .. C.early.name .. " didn't land; its spell goes back on the button")
		C.early = nil
		if C.working then PlaceSoon(C.working) end
	end
end

-- Called whenever the bags change: learns the yield, announces a finished row, keeps the button
-- on the row being conjured, and finishes when nothing is left.
function C.Update()
	if not C.armed or ns.InCombat() then return end
	local working = C.working
	if working then
		local now = ns.Count(working.item)
		if C.lastCount and now > C.lastCount then Learn(working, now - C.lastCount) end
		C.lastCount = now
	end
	local row = C.CurrentRow()
	if working and row ~= working then
		C.early = nil
		C.lastCount = nil
		if row and ns.Count(working.item) >= ns.Target(working) then
			Chime("row")
			Announce(ns.ShortName(working) .. " done. Let go, then hold " .. C.KeyText() .. " again for " .. ns.ShortName(row) .. ".")
			ns.Log("row done: " .. working.name .. " " .. ns.Count(working.item) .. "/" .. ns.Target(working) .. "; next "
				.. row.name .. (C.hold.held and " (key still held)" or ""))
		end
	end
	if not row then
		Chime("done")
		Announce("All conjured. You can let go.")
		C.Disarm("Everything is conjured. Ready is off.")
		return
	end
	C.working = row
	if C.placed ~= row and not C.early then PlaceSoon(row) end
end

-- ------------------------------------------------------------------
-- What the window shows about Ready
-- ------------------------------------------------------------------

function C.Status()
	if not ns.isMage then return "Not a mage", "Conjurer only works on a mage." end
	local row = C.armed and (C.placed or C.CurrentRow()) or C.CurrentRow()
	if C.armed then
		row = C.working or row
		local detail = row and (ns.ShortName(row) .. ": " .. ns.Count(row.item) .. " of " .. ns.Target(row)) or "Finishing"
		if not C.HoldReady() then detail = detail .. ". Hold to cast is off, so press once per cast" end
		return "Ready: hold " .. C.KeyText(), detail
	end
	if not row then return "Nothing to conjure", "Every target is met. Raise a target to conjure more." end
	local detail = "Then hold " .. C.KeyText() .. " to conjure. Next: " .. ns.ShortName(row) .. ", "
		.. ns.Count(row.item) .. " of " .. ns.Target(row) .. "."
	if not C.HoldReady() and not ns.db.manageCVars then
		detail = detail .. " Hold to cast is off in the game's options."
	end
	return "Click play to start", detail
end

-- ------------------------------------------------------------------
-- Watching the hold
--
-- The bar button's own press and release come through MultiActionButtonDown/Up, and each finished
-- conjure through UNIT_SPELLCAST_SUCCEEDED, so the report can say whether one press gave several
-- casts, which is the proof that hold to cast works on this client.
-- ------------------------------------------------------------------

local function IsOurButton(barName, id)
	local where = C.where
	return where and barName == where.bar and id == where.index
end

local function OnPress(barName, id)
	if not IsOurButton(barName, id) then return end
	C.hold.presses = C.hold.presses + 1
	C.hold.held = true
	C.hold.current = 0
	ns.Log("key down on " .. barName .. " " .. id .. " (holds " .. (C.placed and C.placed.name or "nothing") .. ")")
end

local function OnRelease(barName, id)
	if not IsOurButton(barName, id) then return end
	C.hold.releases = C.hold.releases + 1
	C.hold.held = false
	if C.hold.current > C.hold.best then C.hold.best = C.hold.current end
	ns.Log("key up after " .. C.hold.current .. " conjure" .. (C.hold.current == 1 and "" or "s") .. " in this hold")
end

local CAST_EVENTS = { "UNIT_SPELLCAST_START", "UNIT_SPELLCAST_SUCCEEDED", "UNIT_SPELLCAST_INTERRUPTED",
	"UNIT_SPELLCAST_FAILED", "UNIT_SPELLCAST_FAILED_QUIET" }

local castFrame = CreateFrame("Frame")
castFrame:SetScript("OnEvent", ns.Guard("cast watch", function(_, event, unit, guid, spell)
	if ns.Clean(unit) ~= "player" then return end
	spell, guid = ns.Clean(spell), ns.Clean(guid)
	if not (spell and ns.BY_SPELL[spell]) then return end
	if event == "UNIT_SPELLCAST_START" then
		C.CastStarted(spell, guid)
		return
	elseif event ~= "UNIT_SPELLCAST_SUCCEEDED" then
		C.CastFailed(guid)
		return
	end
	if guid and guid == C.inFlight then C.inFlight = nil end
	ns.Log("cast " .. ns.BY_SPELL[spell].name .. (C.hold.held and " (key held)" or ""))
	C.hold.casts = C.hold.casts + 1
	if C.hold.held then
		C.hold.current = C.hold.current + 1
		if C.hold.current > C.hold.best then C.hold.best = C.hold.current end
	end
end))

function C.Init()
	Owner()
	-- A reload or a crash while Ready was lit left the settings changed; put them back.
	C.GiveBackSettings()
	if hooksecurefunc then
		if MultiActionButtonDown then pcall(hooksecurefunc, "MultiActionButtonDown", OnPress) end
		if MultiActionButtonUp then pcall(hooksecurefunc, "MultiActionButtonUp", OnRelease) end
		report["press watch"] = (MultiActionButtonDown and MultiActionButtonUp) and "hooked" or "no MultiActionButtonDown on this client"
	end
	for _, event in ipairs(CAST_EVENTS) do
		if castFrame.RegisterUnitEvent then
			pcall(castFrame.RegisterUnitEvent, castFrame, event, "player")
		else
			pcall(castFrame.RegisterEvent, castFrame, event)
		end
	end
end

ns.On("BAG_UPDATE_DELAYED", function() C.Update() end)

-- PLAYER_REGEN_DISABLED comes just before the client locks the interface, so the binding and the
-- button can usually still be cleaned up here; the state driver above covers the rest.
ns.On("PLAYER_REGEN_DISABLED", function()
	if C.armed then C.Disarm("Ready switched off: you entered combat.") end
end)

ns.On("PLAYER_REGEN_ENABLED", function()
	if C.pendingCleanup and not C.armed then
		C.pendingCleanup = false
		C.ClearSlot()
		C.GiveBackSettings()
	end
end)

ns.On("PLAYER_LOGOUT", function()
	if C.armed then
		C.armed = false
		C.ClearSlot()
		C.GiveBackSettings()
	end
end)

-- ------------------------------------------------------------------
-- Debug report
-- ------------------------------------------------------------------

ns.debugSources[#ns.debugSources + 1] = function()
	local lines = {}
	lines[#lines + 1] = "mage: " .. tostring(ns.isMage) .. "; key: " .. tostring(ns.db and ns.db.key)
		.. " (" .. C.KeyText() .. "); Ready: " .. (C.armed and "lit" or "off")
	lines[#lines + 1] = "profile: " .. ns.PROFILE_BY_KEY[ns.ProfileKey()].label .. "; follows your group: "
		.. tostring(ns.db and ns.db.profileAuto) .. "; your group now: " .. ns.PROFILE_BY_KEY[ns.Bracket()].label
	for _, name in ipairs(CVARS) do
		lines[#lines + 1] = CVAR_LABEL[name] .. " (" .. name .. "): " .. tostring(GetSetting(name))
			.. ((ns.db and ns.db.savedCVars and ns.db.savedCVars[name]) and (", will go back to " .. ns.db.savedCVars[name]) or "")
	end
	local where = C.where or C.FindSlot()
	if where then
		local kind, id = ActionInfo(where.slot)
		lines[#lines + 1] = "button to borrow: " .. where.label .. " button " .. where.index .. ", slot " .. where.slot
			.. ", " .. (where.shown and "shown" or "hidden") .. ", binding " .. where.command
			.. ", holds " .. tostring(kind) .. " " .. tostring(id)
	else
		lines[#lines + 1] = "button to borrow: none free"
	end
	local h = C.hold
	local verdict
	if h.best >= 2 then
		verdict = "works (" .. h.best .. " casts in one hold)"
	elseif h.presses > 0 then
		verdict = "not seen yet (one cast per press so far)"
	else
		verdict = "not tried yet"
	end
	lines[#lines + 1] = "hold to cast: " .. verdict .. "; presses " .. h.presses .. ", releases " .. h.releases
		.. ", conjures seen " .. h.casts
	local known = {}
	for _, kind in ipairs(ns.KIND_ORDER) do
		local ranks = {}
		for _, entry in ipairs(ns.KINDS[kind]) do
			if ns.Known(entry.spell) then ranks[#ranks + 1] = entry.rank end
		end
		known[#known + 1] = kind .. " " .. (#ranks > 0 and table.concat(ranks, ",") or "none")
	end
	lines[#lines + 1] = "known ranks: " .. table.concat(known, "; ")
	return lines
end
