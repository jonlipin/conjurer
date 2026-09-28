-- Conjurer
-- Macro: one action bar button that eats and drinks at the same time.
--
-- Food and water are both used instantly, so one macro can /use both in the same press. Conjurer
-- writes it with the best rank of each you have in your bags and are high enough to use, falling
-- back to the best you can make, and keeps it current as your bags change. Items go by id, so the
-- macro works in any client language. The macro is only ever touched out of combat, when the
-- client allows it.

local ADDON, ns = ...
local report = ns.report
local Mac = {}
ns.Macro = Mac

Mac.NAME = "Conjurer Eat"
local ICON = 134400 -- the question mark, which #showtooltip turns into the item's own icon

local function Limits()
	local consts = Constants and Constants.MacroConsts
	return (consts and consts.MAX_ACCOUNT_MACROS) or MAX_ACCOUNT_MACROS or 120,
		(consts and consts.MAX_CHARACTER_MACROS) or MAX_CHARACTER_MACROS or 18
end

-- The best rank of a kind you have and can use; else the best you can make.
function Mac.Pick(kind)
	local level = ns.Clean(UnitLevel("player"))
	level = type(level) == "number" and level or 60
	local list = ns.KINDS[kind]
	for r = #list, 1, -1 do
		local entry = list[r]
		if entry.level <= level and ns.Count(entry.item) > 0 then return entry end
	end
	for r = #list, 1, -1 do
		local entry = list[r]
		if entry.level <= level and ns.Known(entry.spell) then return entry end
	end
	return nil
end

function Mac.Body()
	local food, water = Mac.Pick("food"), Mac.Pick("water")
	if not (food or water) then return nil end
	local lines = { "#showtooltip" }
	if food then lines[#lines + 1] = "/use item:" .. food.item end
	if water then lines[#lines + 1] = "/use item:" .. water.item end
	return table.concat(lines, "\n"), food, water
end

function Mac.Index()
	if not GetMacroIndexByName then return 0 end
	local ok, index = pcall(GetMacroIndexByName, Mac.NAME)
	return (ok and tonumber(index)) or 0
end

local function BodyOf(index)
	if GetMacroBody then
		local ok, body = pcall(GetMacroBody, index)
		if ok then return body end
	end
	if GetMacroInfo then
		local ok, _, _, body = pcall(GetMacroInfo, index)
		if ok then return body end
	end
	return nil
end

function Mac.IsCharacterMacro(index)
	local accountMax = Limits()
	return index > accountMax
end

-- Makes or updates the macro. In combat it waits for the fight to end.
function Mac.Write(userAsked)
	local db = ns.db.macro
	if ns.InCombat() then
		Mac.pending = true
		return false, "in combat"
	end
	Mac.pending = false
	local body = Mac.Body()
	if not body then
		if userAsked then ns.Print("You have no conjured food or water to put in a macro yet.") end
		Mac.status = "nothing to eat or drink yet"
		return false, "nothing to use"
	end
	local index = Mac.Index()
	if index > 0 then
		if BodyOf(index) == body then
			Mac.status = "up to date"
			return true
		end
		ns.Stage("editing the macro")
		local ok, err = pcall(EditMacro, index, Mac.NAME, ICON, body)
		ns.Stage("idle")
		Mac.status = ok and "up to date" or ("could not be updated: " .. tostring(err))
		ns.Log("macro " .. (ok and "updated: " or "update failed: ") .. body:gsub("\n", " | ") .. (ok and "" or (" " .. tostring(err))))
		return ok
	end

	local accountMax, characterMax = Limits()
	local numAccount, numCharacter = 0, 0
	if GetNumMacros then numAccount, numCharacter = GetNumMacros() end
	local perCharacter = db.perCharacter and true or false
	if perCharacter and (numCharacter or 0) >= characterMax then perCharacter = false end
	if not perCharacter and (numAccount or 0) >= accountMax then
		perCharacter = (numCharacter or 0) < characterMax
		if not perCharacter then
			ns.Print("Your macro lists are full. Delete a macro to make room for " .. Mac.NAME .. ".")
			Mac.status = "no room for it"
			return false, "macros full"
		end
	end
	ns.Stage("making the macro")
	local ok, result = pcall(CreateMacro, Mac.NAME, ICON, body, perCharacter)
	ns.Stage("idle")
	if ok and tonumber(result) and tonumber(result) > 0 then
		db.made = true
		db.auto = true
		Mac.status = "up to date"
		ns.Log("macro made (" .. (perCharacter and "character" or "account") .. "): " .. body:gsub("\n", " | "))
		if userAsked then ns.Print(Mac.NAME .. " is in your " .. (perCharacter and "character" or "general") .. " macros. Drag it from Conjurer onto your bar.") end
		return true
	end
	Mac.status = "could not be made: " .. tostring(result)
	ns.Log("macro make failed: " .. tostring(result))
	return false, result
end

-- Puts the macro on the cursor so it can be dropped on an action bar, making it first if needed.
function Mac.Pickup()
	if ns.InCombat() then
		ns.Print("Macros can't be picked up in combat.")
		return
	end
	if Mac.Index() == 0 then Mac.Write(true) end
	local index = Mac.Index()
	if index > 0 and PickupMacro then pcall(PickupMacro, index) end
end

-- Keeps it current. A macro that was made and has since gone was deleted by you, so it is left gone.
function Mac.Update()
	local db = ns.db and ns.db.macro
	if not (db and db.auto and db.made and ns.isMage) then return end
	if Mac.Index() == 0 then
		db.auto = false
		db.made = false
		Mac.status = "deleted"
		ns.Log("macro was deleted by the player; stopped keeping it")
		ns.Print(Mac.NAME .. " was deleted, so Conjurer stopped keeping it. Make it again from the window.")
		return
	end
	Mac.Write(false)
end

function Mac.Summary()
	if Mac.Index() > 0 then return Mac.status or "made" end
	return "not made yet"
end

function Mac.Init()
	if ns.db.macro.auto and ns.db.macro.made then Mac.Update() end
end

ns.On("BAG_UPDATE_DELAYED", function() Mac.Update() end)
ns.On("PLAYER_LEVEL_UP", function() ns.After(1, Mac.Update) end)
ns.On("PLAYER_REGEN_ENABLED", function() if Mac.pending then Mac.Update() end end)

ns.debugSources[#ns.debugSources + 1] = function()
	local index = Mac.Index()
	local body = Mac.Body()
	return {
		"macro: " .. (index > 0 and ("made, index " .. index .. (Mac.IsCharacterMacro(index) and " (character)" or " (account)"))
			or "not made") .. "; keep updated " .. tostring(ns.db and ns.db.macro.auto) .. "; status " .. tostring(Mac.status),
		"macro body: " .. (body and body:gsub("\n", " | ") or "nothing to use"),
	}
end
