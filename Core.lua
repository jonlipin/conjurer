-- Conjurer
-- Core: the conjure data, saved settings, events, slash commands and the debug report.

local ADDON, ns = ...

ns.version = "1.0.0"
ns.report = {}   -- one line per fact about this client, printed by /conjure debug
ns.refused = {}  -- actions the client refused, with the stage the addon was in at the time
ns.stage = "load"

local report = ns.report

-- ------------------------------------------------------------------
-- The conjure spells and what they make
--
-- Checked against the client's own tables for build 1.60.1.70009 (SpellEffect for the item each
-- rank creates, ItemSparse for the level needed to eat or drink it). Every item stacks to 20.
-- ------------------------------------------------------------------

ns.WATER = {
	{ rank = 1, spell = 5504,  item = 5350,  level = 1,  name = "Conjured Water" },
	{ rank = 2, spell = 5505,  item = 2288,  level = 5,  name = "Conjured Fresh Water" },
	{ rank = 3, spell = 5506,  item = 2136,  level = 15, name = "Conjured Purified Water" },
	{ rank = 4, spell = 6127,  item = 3772,  level = 25, name = "Conjured Spring Water" },
	{ rank = 5, spell = 10138, item = 8077,  level = 35, name = "Conjured Mineral Water" },
	{ rank = 6, spell = 10139, item = 8078,  level = 45, name = "Conjured Sparkling Water" },
	{ rank = 7, spell = 10140, item = 8079,  level = 55, name = "Conjured Crystal Water" },
}
ns.FOOD = {
	{ rank = 1, spell = 587,   item = 5349,  level = 1,  name = "Conjured Muffin" },
	{ rank = 2, spell = 597,   item = 1113,  level = 5,  name = "Conjured Bread" },
	{ rank = 3, spell = 990,   item = 1114,  level = 15, name = "Conjured Rye" },
	{ rank = 4, spell = 6129,  item = 1487,  level = 25, name = "Conjured Pumpernickel" },
	{ rank = 5, spell = 10144, item = 8075,  level = 35, name = "Conjured Sourdough" },
	{ rank = 6, spell = 10145, item = 8076,  level = 45, name = "Conjured Sweet Roll" },
	{ rank = 7, spell = 28612, item = 22895, level = 55, name = "Conjured Cinnamon Roll" },
}
-- How many items one cast makes (SpellEffect/SpellLevels, same build): base plus perLevel for each
-- level above the rank's own, counting up to its maxLevel. Checked in game at level 8: rank 1
-- water made 10 (2 + 2 x 4) and rank 1 food 6 (2 + 2 x 2).
local YIELD = {
	[5504] = { 2, 2, 4, 13 }, [5505] = { 2, 2, 10, 19 }, [5506] = { 2, 2, 20, 29 }, [6127] = { 2, 2, 30, 39 },
	[10138] = { 2, 2, 40, 49 }, [10139] = { 2, 2, 50, 59 }, [10140] = { 10, 2, 60, 65 },
	[587] = { 2, 2, 6, 15 }, [597] = { 2, 2, 12, 21 }, [990] = { 2, 2, 22, 31 }, [6129] = { 2, 2, 32, 41 },
	[10144] = { 2, 2, 42, 51 }, [10145] = { 2, 2.25, 52, 61 }, [28612] = { 10, 2, 60, 65 },
}

-- The yield of one cast at a level, from the spell data.
function ns.FormulaYield(entry, level)
	local y = YIELD[entry.spell]
	if not (y and type(level) == "number") then return nil end
	local steps = math.max(0, math.min(level, y[4]) - y[3])
	return math.floor(y[1] + y[2] * steps)
end

ns.KINDS = { water = ns.WATER, food = ns.FOOD }
ns.KIND_ORDER = { "water", "food" }
ns.KIND_LABEL = { water = "Water", food = "Food" }
ns.STACK = 20

ns.BY_SPELL, ns.BY_ITEM = {}, {}
for _, kind in ipairs(ns.KIND_ORDER) do
	for _, entry in ipairs(ns.KINDS[kind]) do
		entry.kind = kind
		ns.BY_SPELL[entry.spell] = entry
		ns.BY_ITEM[entry.item] = entry
	end
end

-- The classes of the original game, in the order the game lists them.
ns.CLASS_FALLBACK = { "WARRIOR", "PALADIN", "HUNTER", "ROGUE", "PRIEST", "SHAMAN", "MAGE", "WARLOCK", "DRUID" }

-- What each class is handed by default: casters want water, everyone eats.
local SHARE_DEFAULTS = {
	WARRIOR = { water = 0, food = 20 },
	ROGUE = { water = 0, food = 20 },
	HUNTER = { water = 20, food = 20 },
	DRUID = { water = 20, food = 20 },
	PALADIN = { water = 20, food = 20 },
	SHAMAN = { water = 20, food = 20 },
	PRIEST = { water = 40, food = 20 },
	WARLOCK = { water = 40, food = 20 },
	MAGE = { water = 0, food = 0 },
}
ns.SHARE_DEFAULTS = SHARE_DEFAULTS

local DEFAULTS = {
	profiles = {},
	profile = "solo",
	profileAuto = true,
	shares = {},
	keep = { water = 40, food = 20 },
	key = "F",
	autoFill = true,
	bestRank = true,
	includeRaid = true,
	chime = true,
	manageCVars = true,
	leaveCVarsOn = false,
	yield = {},
	collapsed = { options = true },
	minimap = { shown = true, angle = 200 },
	handed = {},
	macro = { perCharacter = true, auto = false, made = false },
	alert = { enabled = true, water = 20, food = 10, sound = false, when = "out" },
	announce = { shown = false, groupOnly = true },
}

local function Merge(into, from)
	for k, v in pairs(from) do
		if type(v) == "table" then
			if type(into[k]) ~= "table" then into[k] = {} end
			Merge(into[k], v)
		elseif into[k] == nil then
			into[k] = v
		end
	end
end

-- ------------------------------------------------------------------
-- Small helpers
-- ------------------------------------------------------------------

function ns.Print(msg)
	DEFAULT_CHAT_FRAME:AddMessage("|cff3fc7ebConjurer|r: " .. tostring(msg))
end

-- The stage names what the addon was doing, so a refused action can be traced to it: this client
-- reports the refused function as UNKNOWN().
function ns.Stage(name) ns.stage = name end

-- Values the client has marked secret cannot be tested or compared; they are treated as absent.
function ns.Clean(v)
	if issecretvalue and issecretvalue(v) then return nil end
	return v
end

-- ------------------------------------------------------------------
-- The log
--
-- What happens in game is written to ConjurerLog, an account-wide saved variable. The client
-- writes it to WTF\Account\<account>\SavedVariables\Conjurer.lua at every /reload and logout,
-- where tools/conjurer-log.js reads it, so a test session needs nothing copied out of chat: play,
-- /reload, and the whole story is on disk. /conjure note <text> marks a moment in it.
-- ------------------------------------------------------------------

local LOG_MAX = 800
local early = {}

local function Stamp()
	return (date and date("%H:%M:%S")) or "--:--:--"
end

function ns.Log(msg)
	local line = Stamp() .. " " .. tostring(msg)
	local log = ns.logTable
	if not log then
		early[#early + 1] = line
		return
	end
	local entries = log.entries
	entries[#entries + 1] = "#" .. tostring(log.session) .. " " .. line
	while #entries > LOG_MAX do table.remove(entries, 1) end
end

local function OpenLog()
	if type(ConjurerLog) ~= "table" then ConjurerLog = {} end
	local log = ConjurerLog
	log.entries = type(log.entries) == "table" and log.entries or {}
	log.session = (tonumber(log.session) or 0) + 1
	log.version = ns.version
	ns.logTable = log
	for _, line in ipairs(early) do
		log.entries[#log.entries + 1] = "#" .. log.session .. " " .. line
	end
	early = {}
end

-- The debug report as it stands, kept in the log file too.
function ns.SnapshotReport(why)
	local log = ns.logTable
	if not log or not ns.DebugReport then return end
	local ok, lines = pcall(ns.DebugReport)
	if ok then
		log.report = lines
		log.reportAt = ((date and date("%Y-%m-%d %H:%M:%S")) or "?") .. " (" .. tostring(why) .. ")"
	end
end

-- A handler that logs its own failure instead of breaking the button it sits on.
function ns.Guard(label, fn)
	return function(...)
		local ok, err = pcall(fn, ...)
		if not ok then
			ns.Log("ERROR in " .. label .. ": " .. tostring(err))
			report["last error"] = label .. ": " .. tostring(err)
			ns.Print("Something went wrong (" .. label .. "). It's in the log.")
		end
	end
end

function ns.After(seconds, fn)
	local guarded = ns.Guard("timer", fn)
	if C_Timer and C_Timer.After then
		C_Timer.After(seconds, guarded)
	else
		guarded()
	end
end

-- SetAtlas raises nothing for a name the client lacks, so the atlas table is asked instead.
function ns.HasAtlas(atlas)
	if not (C_Texture and C_Texture.GetAtlasInfo) then return false end
	local ok, info = pcall(C_Texture.GetAtlasInfo, atlas)
	return ok and info ~= nil
end

function ns.InCombat()
	return InCombatLockdown and InCombatLockdown() and true or false
end

function ns.Count(item)
	if C_Item and C_Item.GetItemCount then
		local ok, n = pcall(C_Item.GetItemCount, item)
		if ok and type(ns.Clean(n)) == "number" then return n end
	end
	if GetItemCount then
		local ok, n = pcall(GetItemCount, item)
		if ok and type(ns.Clean(n)) == "number" then return n end
	end
	return 0
end

function ns.Known(spell)
	if C_SpellBook and C_SpellBook.IsSpellKnown then
		local ok, known = pcall(C_SpellBook.IsSpellKnown, spell)
		if ok and ns.Clean(known) ~= nil then return known and true or false end
	end
	if IsSpellKnown then
		local ok, known = pcall(IsSpellKnown, spell)
		if ok then return ns.Clean(known) and true or false end
	end
	if IsPlayerSpell then
		local ok, known = pcall(IsPlayerSpell, spell)
		if ok then return ns.Clean(known) and true or false end
	end
	return false
end

-- ------------------------------------------------------------------
-- Profiles
--
-- One set of targets per kind of group: solo, a party, raids of up to 10, 20 or 40, and
-- battlegrounds sized like Warsong Gulch, Arathi Basin and Alterac Valley. The profile in use
-- follows your group (a battleground by its own size, from the instance) unless you pick one by
-- hand; a hand pick holds until your group moves into another size.
-- ------------------------------------------------------------------

ns.PROFILES = {
	{ key = "solo", label = "Solo", tip = "When you're on your own.", water = 40, food = 20 },
	{ key = "party", label = "Party", tip = "In a party of up to five.", water = 100, food = 60 },
	{ key = "raid10", label = "Raid 10", tip = "In a raid of up to 10.", water = 160, food = 80 },
	{ key = "raid20", label = "Raid 20", tip = "In a raid of 11 to 20.", water = 240, food = 100 },
	{ key = "raid40", label = "Raid 40", tip = "In a raid of more than 20.", water = 300, food = 120 },
	{ key = "bg10", label = "BG 10", tip = "In a battleground of up to 10 a side, like Warsong Gulch.", water = 100, food = 60 },
	{ key = "bg20", label = "BG 20", tip = "In a battleground of 11 to 20 a side, like Arathi Basin.", water = 160, food = 80 },
	{ key = "bg40", label = "AV 40", tip = "In a battleground of more than 20 a side, like Alterac Valley.", water = 240, food = 100 },
}
ns.PROFILE_BY_KEY = {}
for i, def in ipairs(ns.PROFILES) do
	def.index = i
	ns.PROFILE_BY_KEY[def.key] = def
end

-- A profile's targets ({ water = {rank = n}, food = {...} }), the one in use when no key is given.
function ns.Profile(key)
	key = key or (ns.db and ns.db.profile) or "solo"
	if not ns.PROFILE_BY_KEY[key] then key = "solo" end
	local profiles = ns.db.profiles
	local p = profiles[key]
	if type(p) ~= "table" then
		p = {}
		profiles[key] = p
	end
	if type(p.water) ~= "table" then p.water = {} end
	if type(p.food) ~= "table" then p.food = {} end
	return p
end

function ns.ProfileKey()
	local key = ns.db and ns.db.profile
	return ns.PROFILE_BY_KEY[key] and key or "solo"
end

function ns.Target(entry)
	if not ns.db then return 0 end
	return tonumber(ns.Profile()[entry.kind][entry.rank]) or 0
end

-- Zero is stored rather than removed, so a target the player cleared stays cleared.
function ns.SetTarget(entry, value)
	ns.Profile()[entry.kind][entry.rank] = math.max(0, math.floor((tonumber(value) or 0) + 0.5))
end

-- The best rank of a kind this character knows.
function ns.TopKnown(kind)
	local list = ns.KINDS[kind]
	for r = #list, 1, -1 do
		if ns.Known(list[r].spell) then return list[r] end
	end
end

-- Each profile starts with its own amounts at your best ranks (Solo with what you keep), once you
-- know at least one conjure spell.
function ns.SeedTargets()
	if not ns.db or not ns.isMage then return end
	for _, def in ipairs(ns.PROFILES) do
		local p = ns.Profile(def.key)
		if not p.seeded then
			local any = false
			for _, kind in ipairs(ns.KIND_ORDER) do
				local top = ns.TopKnown(kind)
				if top then
					any = true
					local amount = def.key == "solo" and (ns.db.keep[kind] or 0) or def[kind]
					if (tonumber(p[kind][top.rank]) or 0) == 0 then p[kind][top.rank] = amount end
				end
			end
			if any then p.seeded = true end
		end
	end
end

-- The kind of group you're in now, as a profile key.
function ns.Bracket()
	local inInstance, kind = false, nil
	if IsInInstance then
		local ok, a, b = pcall(IsInInstance)
		if ok then inInstance, kind = ns.Clean(a), ns.Clean(b) end
	end
	local n = (GetNumGroupMembers and GetNumGroupMembers()) or 0
	n = tonumber(ns.Clean(n)) or 0
	if inInstance and kind == "pvp" then
		local size
		if GetInstanceInfo then
			local ok, _, _, _, _, maxPlayers = pcall(GetInstanceInfo)
			if ok then size = tonumber(ns.Clean(maxPlayers)) end
		end
		if not size or size <= 0 then size = n end
		if size <= 10 then return "bg10" elseif size <= 20 then return "bg20" end
		return "bg40"
	end
	if n <= 1 then return "solo" end
	if not (IsInRaid and IsInRaid()) then return "party" end
	if n <= 10 then return "raid10" elseif n <= 20 then return "raid20" end
	return "raid40"
end

function ns.SetProfile(key, why)
	if not ns.PROFILE_BY_KEY[key] or ns.db.profile == key then return false end
	ns.db.profile = key
	ns.Log("profile: " .. ns.PROFILE_BY_KEY[key].label .. " (" .. tostring(why) .. ")")
	if ns.Conjure and ns.Conjure.armed then ns.Conjure.Update() end
	ns.Refresh()
	return true
end

-- Moves to the profile for your group, when your group has moved into another size.
function ns.FollowGroup(quiet)
	if not (ns.db and ns.db.profileAuto) then return end
	local bracket = ns.Bracket()
	if bracket == ns.db.lastBracket then return end
	ns.db.lastBracket = bracket
	if ns.SetProfile(bracket, "your group") and not quiet then
		ns.Print("Profile: " .. ns.PROFILE_BY_KEY[bracket].label .. ".")
	end
end

-- The item's name as the client spells it, once the client has it cached.
function ns.ItemName(entry)
	if C_Item and C_Item.GetItemNameByID then
		local ok, name = pcall(C_Item.GetItemNameByID, entry.item)
		if ok and type(name) == "string" and name ~= "" then return name end
	end
	if C_Item and C_Item.RequestLoadItemDataByID then pcall(C_Item.RequestLoadItemDataByID, entry.item) end
	return entry.name
end

-- "Conjured Crystal Water" reads as "Crystal Water" in the rows, where the word only repeats.
function ns.ShortName(entry)
	if not entry then return "" end
	local name = ns.ItemName(entry)
	return (name:gsub("^Conjured ", ""))
end

function ns.ItemIcon(entry)
	if C_Item and C_Item.GetItemIconByID then
		local ok, icon = pcall(C_Item.GetItemIconByID, entry.item)
		if ok and icon then return icon end
	end
	return entry.kind == "water" and "Interface\\Icons\\INV_Drink_18" or "Interface\\Icons\\INV_Misc_Food_73"
end

function ns.SpellIcon(entry)
	if C_Spell and C_Spell.GetSpellTexture then
		local ok, icon = pcall(C_Spell.GetSpellTexture, entry.spell)
		if ok and icon then return icon end
	end
	return ns.ItemIcon(entry)
end

-- The classes of this game. Not asked of the client: its class list comes from the modern game and
-- can hold classes Forever doesn't have. A group member of any other class still gets a share
-- (20 and 20 unless set), just without a row of its own.
function ns.Classes()
	return ns.CLASS_FALLBACK
end

function ns.ClassName(file)
	if LOCALIZED_CLASS_NAMES_MALE and LOCALIZED_CLASS_NAMES_MALE[file] then return LOCALIZED_CLASS_NAMES_MALE[file] end
	return file:sub(1, 1) .. file:sub(2):lower()
end

function ns.ClassColor(file)
	local c = RAID_CLASS_COLORS and file and RAID_CLASS_COLORS[file]
	if c then return c.r, c.g, c.b end
	return 1, 1, 1
end

function ns.ClassHex(file)
	local r, g, b = ns.ClassColor(file)
	return string.format("ff%02x%02x%02x", math.floor(r * 255 + 0.5), math.floor(g * 255 + 0.5), math.floor(b * 255 + 0.5))
end

-- Puts a class icon on a texture: the class atlas when the client has it, else the character
-- creation sheet.
function ns.SetClassIcon(texture, file)
	local atlas = file and ("classicon-" .. file:lower())
	if atlas and ns.HasAtlas(atlas) then
		texture:SetAtlas(atlas)
		texture:SetTexCoord(0, 1, 0, 1)
		return
	end
	local coords = CLASS_ICON_TCOORDS and file and CLASS_ICON_TCOORDS[file]
	if coords then
		texture:SetTexture("Interface\\Glues\\CharacterCreate\\UI-CharacterCreate-Classes")
		texture:SetTexCoord(coords[1], coords[2], coords[3], coords[4])
	else
		texture:SetTexture("Interface\\Icons\\INV_Misc_QuestionMark")
		texture:SetTexCoord(0, 1, 0, 1)
	end
end

function ns.Share(file)
	local share = ns.db.shares[file]
	if not share then
		local d = SHARE_DEFAULTS[file] or { water = 20, food = 20 }
		share = { water = d.water, food = d.food }
		ns.db.shares[file] = share
	end
	return share
end

-- ------------------------------------------------------------------
-- Events
-- ------------------------------------------------------------------

local handlers = {}
local events = CreateFrame("Frame")
ns.eventFrame = events

function ns.On(event, fn)
	if not handlers[event] then
		handlers[event] = {}
		pcall(events.RegisterEvent, events, event)
	end
	local list = handlers[event]
	list[#list + 1] = fn
end

events:SetScript("OnEvent", function(_, event, ...)
	local list = handlers[event]
	if not list then return end
	for _, fn in ipairs(list) do
		local ok, err = pcall(fn, ...)
		if not ok then
			report["error in " .. event] = tostring(err)
			ns.Log("ERROR in " .. event .. ": " .. tostring(err))
		end
	end
end)

-- Anything that changes what the window shows asks for one refresh; several asks in the same
-- moment make one.
local refreshQueued = false
function ns.Refresh()
	if refreshQueued then return end
	refreshQueued = true
	ns.After(0, function()
		refreshQueued = false
		if ns.UI and ns.UI.Refresh then ns.UI.Refresh() end
		if ns.Alert and ns.Alert.Refresh then ns.Alert.Refresh() end
		if ns.Minimap and ns.Minimap.Refresh then ns.Minimap.Refresh() end
	end)
end

local function Refused(kind, addon, fn)
	if addon ~= ADDON then return end
	local stack = debugstack and debugstack(3, 4, 0) or ""
	ns.refused[#ns.refused + 1] = { kind = kind, fn = tostring(fn), stage = ns.stage, stack = stack }
	ns.Log("REFUSED " .. kind .. " " .. tostring(fn) .. " during " .. tostring(ns.stage) .. " | "
		.. tostring(stack):gsub("\n", " | "))
end
ns.On("ADDON_ACTION_FORBIDDEN", function(addon, fn) Refused("forbidden", addon, fn) end)
ns.On("ADDON_ACTION_BLOCKED", function(addon, fn) Refused("blocked", addon, fn) end)

-- Lua errors raised in Conjurer's own files, from anywhere (a script handler the guards don't
-- cover), go to the log as well as to whatever handler was there before.
local function HookErrors()
	if not (geterrorhandler and seterrorhandler) then return end
	local ok = pcall(function()
		local previous = geterrorhandler()
		seterrorhandler(function(msg, ...)
			if tostring(msg):find("Conjurer", 1, true) then ns.Log("LUA ERROR: " .. tostring(msg)) end
			if previous then return previous(msg, ...) end
		end)
	end)
	report["error capture"] = ok and "on" or "not allowed on this client"
end

-- Before profiles there was one set of targets; it becomes the Solo profile.
local function Migrate(db)
	if type(db.targets) == "table" then
		local solo = type(db.profiles.solo) == "table" and db.profiles.solo or {}
		solo.water = type(db.targets.water) == "table" and db.targets.water or {}
		solo.food = type(db.targets.food) == "table" and db.targets.food or {}
		solo.seeded = db.seeded
		db.profiles.solo = solo
		db.targets = nil
		db.migrated = "targets moved into the Solo profile"
	elseif db.seeded ~= nil then
		db.profiles.solo = type(db.profiles.solo) == "table" and db.profiles.solo or {}
		db.profiles.solo.seeded = db.seeded
	end
	db.seeded = nil
	-- Yields learned before 2026-09-28's fix came from single bag updates, which split a cast's
	-- items across stacks (a water cast was once learned as 1). The spell data takes over again.
	if (tonumber(db.yieldVersion) or 0) < 2 then
		db.yield = {}
		db.yieldVersion = 2
	end
end

local function OpenDB()
	ConjurerDB = ConjurerDB or {}
	Merge(ConjurerDB, DEFAULTS)
	Migrate(ConjurerDB)
	ns.db = ConjurerDB
end

ns.On("ADDON_LOADED", function(name)
	if name ~= ADDON then return end
	OpenDB()
	OpenLog()
	HookErrors()
	if ns.db.migrated then
		ns.Log("saved settings: " .. ns.db.migrated)
		ns.db.migrated = nil
	end
end)

ns.On("PLAYER_LOGIN", function()
	if not ns.db then OpenDB() end
	if not ns.logTable then OpenLog() end
	local _, class = UnitClass("player")
	ns.isMage = class == "MAGE"
	report["class"] = tostring(class)
	local build, number = "?", "?"
	if GetBuildInfo then build, number = GetBuildInfo() end
	ns.Log("session start: Conjurer " .. ns.version .. ", client " .. tostring(build) .. "." .. tostring(number) .. ", "
		.. tostring(ns.Clean(UnitName("player"))) .. " " .. tostring(class) .. " " .. tostring(ns.Clean(UnitLevel("player"))))
	ns.Stage("login")
	ns.SeedTargets()
	ns.FollowGroup(true)
	for _, module in ipairs({ ns.Conjure, ns.Trade, ns.Macro, ns.UI, ns.Alert, ns.Announce, ns.Minimap }) do
		if module and module.Init then
			local ok, err = pcall(module.Init)
			if not ok then
				report["init error"] = tostring(err)
				ns.Log("ERROR at login: " .. tostring(err))
			end
		end
	end
	ns.Stage("idle")
	-- A report a few seconds in, once the spellbook and bags are settled.
	ns.After(5, function() ns.SnapshotReport("login") end)
end)

-- The bags already read empty by the time this fires on this client, so no report is taken here.
ns.On("PLAYER_LOGOUT", function()
	ns.Log("session end (logout or reload)")
end)

ns.On("BAG_UPDATE_DELAYED", function() ns.Refresh() end)
ns.On("SPELLS_CHANGED", function()
	ns.SeedTargets()
	ns.Refresh()
end)
ns.On("GET_ITEM_INFO_RECEIVED", function() ns.Refresh() end)
ns.On("GROUP_ROSTER_UPDATE", function() ns.FollowGroup() end)
ns.On("GROUP_LEFT", function() ns.FollowGroup() end)
ns.On("PLAYER_ENTERING_WORLD", function() ns.FollowGroup() end)
ns.On("ZONE_CHANGED_NEW_AREA", function() ns.FollowGroup() end)

-- ------------------------------------------------------------------
-- The debug report
-- ------------------------------------------------------------------

ns.debugSources = {}

function ns.DebugReport()
	local lines = {}
	local build, number = "?", "?"
	if GetBuildInfo then build, number = GetBuildInfo() end
	lines[#lines + 1] = "Conjurer " .. ns.version .. " debug report, client " .. tostring(build) .. "." .. tostring(number)
	for _, source in ipairs(ns.debugSources) do
		local ok, more = pcall(source)
		if ok and type(more) == "table" then
			for _, line in ipairs(more) do lines[#lines + 1] = line end
		elseif not ok then
			lines[#lines + 1] = "report section failed: " .. tostring(more)
		end
	end
	local keys = {}
	for k in pairs(report) do keys[#keys + 1] = k end
	table.sort(keys)
	for _, k in ipairs(keys) do lines[#lines + 1] = k .. ": " .. tostring(report[k]) end
	if #ns.refused == 0 then
		lines[#lines + 1] = "refused actions: none"
	else
		for i, r in ipairs(ns.refused) do
			lines[#lines + 1] = "refused " .. i .. ": " .. r.kind .. " " .. r.fn .. " during " .. tostring(r.stage)
			for stackLine in tostring(r.stack):gmatch("[^\n]+") do
				lines[#lines + 1] = "    " .. stackLine
			end
		end
	end
	return lines
end

-- ------------------------------------------------------------------
-- Slash commands
-- ------------------------------------------------------------------

local function Help()
	ns.Print("/conjure opens the window.")
	ns.Print("/conjure ready turns Ready on or off.")
	ns.Print("/conjure fill sets the targets from your group.")
	ns.Print("/conjure reset puts the window back in the middle of the screen.")
	ns.Print("/conjure debug prints what Conjurer found on this client.")
	ns.Print("/conjure note <text> writes a line into the log; /reload saves the log to disk.")
end

SLASH_CONJURER1 = "/conjure"
SLASH_CONJURER2 = "/conjurer"
SlashCmdList["CONJURER"] = function(raw)
	raw = (raw or ""):gsub("^%s+", ""):gsub("%s+$", "")
	local msg = raw:lower()
	if msg ~= "" then ns.Log("/conjure " .. raw) end
	if msg == "debug" then
		ns.SnapshotReport("/conjure debug")
		for _, line in ipairs(ns.DebugReport()) do DEFAULT_CHAT_FRAME:AddMessage(line) end
	elseif msg:sub(1, 4) == "note" then
		ns.SnapshotReport("/conjure note")
		ns.Print("Noted. /reload writes the log to disk.")
	elseif msg == "help" or msg == "?" then
		Help()
	elseif not ns.isMage then
		ns.Print("Conjurer is for mages; this character can't conjure food or water.")
	elseif msg == "ready" then
		if ns.Conjure then ns.Conjure.Toggle() end
	elseif msg == "fill" then
		if ns.Trade then ns.Trade.FillTargets(true) end
	elseif msg == "reset" then
		if ns.UI then ns.UI.ResetPosition() end
	else
		if ns.UI then ns.UI.Toggle() end
	end
end
