-- Conjurer
-- Bags: reading the bags. Stacks of an item, empty slots, and how much more of an item fits.
--
-- Only ordinary bags count: a profession bag won't take food or water.

local ADDON, ns = ...
local B = {}
ns.Bags = B

function B.NumBags() return NUM_BAG_SLOTS or 4 end

function B.SlotInfo(bag, slot)
	if not (C_Container and C_Container.GetContainerItemInfo) then return nil end
	local ok, info = pcall(C_Container.GetContainerItemInfo, bag, slot)
	if ok and type(info) == "table" then return info end
	return nil
end

function B.NumSlots(bag)
	if not (C_Container and C_Container.GetContainerNumSlots) then return 0 end
	local ok, n = pcall(C_Container.GetContainerNumSlots, bag)
	return (ok and tonumber(n)) or 0
end

-- A bag that takes anything (bag family 0).
function B.Ordinary(bag)
	if not (C_Container and C_Container.GetContainerNumFreeSlots) then return true end
	local ok, _, family = pcall(C_Container.GetContainerNumFreeSlots, bag)
	return not ok or (tonumber(ns.Clean(family)) or 0) == 0
end

-- The unlocked stacks of an item, biggest first.
function B.Stacks(item)
	local list = {}
	for bag = 0, B.NumBags() do
		for slot = 1, B.NumSlots(bag) do
			local info = B.SlotInfo(bag, slot)
			if info and ns.Clean(info.itemID) == item and not info.isLocked then
				list[#list + 1] = { bag = bag, slot = slot, count = ns.Clean(info.stackCount) or 0 }
			end
		end
	end
	table.sort(list, function(a, b) return a.count > b.count end)
	return list
end

-- An empty slot in an ordinary bag, the given bag first.
function B.FreeBagSlot(prefer)
	local order = { prefer }
	for bag = 0, B.NumBags() do
		if bag ~= prefer then order[#order + 1] = bag end
	end
	for _, bag in ipairs(order) do
		if bag and B.Ordinary(bag) then
			for slot = 1, B.NumSlots(bag) do
				if not B.SlotInfo(bag, slot) then return bag, slot end
			end
		end
	end
	return nil
end

-- How many more of an item fit: the room left on its own stacks and every empty ordinary slot. A
-- mana gem doesn't stack, so it takes a slot of its own.
function B.Room(item)
	local entry = ns.BY_ITEM[item]
	local stack = (entry and entry.kind == "gem") and 1 or ns.STACK
	local room = 0
	for bag = 0, B.NumBags() do
		if B.Ordinary(bag) then
			for slot = 1, B.NumSlots(bag) do
				local info = B.SlotInfo(bag, slot)
				if not info then
					room = room + stack
				elseif ns.Clean(info.itemID) == item then
					room = room + math.max(0, stack - (ns.Clean(info.stackCount) or 0))
				end
			end
		end
	end
	return room
end

-- ------------------------------------------------------------------
-- Tidying
--
-- Loose stacks of conjured food and water are merged, the smallest onto the biggest that has room,
-- one move at a time with a pause for the server between (the next move waits for the bags to
-- settle), and only when nothing else is going on: out of combat, Ready off, no trade open,
-- nothing on the cursor and nothing being cast. Whole stacks are then ready to hand over.
--
-- Only what makes loose stacks asks for a tidy: a conjure landing, Ready going off, a trade
-- closing. Eating and drinking don't: in game every bite set it off again (user, 2026-09-29).
-- Asked for, it carries on as the bags settle until the stacks are whole, then stops.
-- ------------------------------------------------------------------

local TIDY_DELAY = 1.5
local tidyQueued = false
local tidyPausedUntil = 0
B.tidyWanted = false

local function Casting()
	if not UnitCastingInfo then return false end
	local ok, name = pcall(UnitCastingInfo, "player")
	return ok and ns.Clean(name) ~= nil
end

-- What stops a tidy now, or nil.
function B.Busy()
	if ns.InCombat() then return "in combat" end
	if ns.Conjure and ns.Conjure.armed then return "Ready is lit" end
	if ns.Trade and (ns.Trade.open or ns.Trade.job) then return "trading" end
	if GetCursorInfo() then return "something on the cursor" end
	if Casting() then return "casting" end
	return nil
end

-- Whether a bag slot is waiting on the server (a move not answered yet).
function B.Locked(bag, slot)
	local info = B.SlotInfo(bag, slot)
	return info ~= nil and info.isLocked and true or false
end

-- The next merge: an item and two of its stacks that aren't full, smallest and biggest. Given a
-- set of item ids, only those.
function B.NextMerge(items)
	for _, list in ipairs({ ns.WATER, ns.FOOD }) do
		for _, entry in ipairs(list) do
			local partial = {}
			if items and not items[entry.item] then partial = nil end
			for _, s in ipairs(partial and B.Stacks(entry.item) or {}) do
				if s.count < ns.STACK then partial[#partial + 1] = s end
			end
			if partial and #partial >= 2 then return entry, partial[#partial], partial[1] end
		end
	end
	return nil
end

function B.TidyStep()
	tidyQueued = false
	if not (B.tidyWanted and ns.db and ns.db.tidy) or GetTime() < tidyPausedUntil or B.Busy() then return end
	local entry, from, to = B.NextMerge()
	if not entry then
		B.tidyWanted = false
		return
	end
	if not B.MergeOnce(entry, from, to) then
		-- Something about these bags won't take it: leave them alone for a while.
		tidyPausedUntil = GetTime() + 60
	end
end

-- One merge: the smaller stack picked up and dropped on the bigger. False when the bags refused it.
function B.MergeOnce(entry, from, to, why)
	ns.Stage("tidying " .. entry.name)
	pcall(C_Container.PickupContainerItem, from.bag, from.slot)
	if GetCursorInfo() then pcall(C_Container.PickupContainerItem, to.bag, to.slot) end
	local refused = GetCursorInfo() ~= nil
	if refused then ClearCursor() end
	ns.Stage("idle")
	ns.Log("tidy: " .. from.count .. " " .. entry.name .. " onto " .. to.count .. (why and (" " .. why) or "")
		.. (refused and " (refused)" or ""))
	return not refused
end

function B.TidySoon()
	if tidyQueued or not (B.tidyWanted and ns.db and ns.db.tidy) then return end
	tidyQueued = true
	ns.After(TIDY_DELAY, B.TidyStep)
end

-- Asks for a tidy, which runs as soon as nothing else is going on.
function B.RequestTidy()
	B.tidyWanted = true
	B.TidySoon()
end

-- A tidy asked for carries on as the bags settle, or once a fight or a trade is over.
ns.On("BAG_UPDATE_DELAYED", function() B.TidySoon() end)
ns.On("PLAYER_REGEN_ENABLED", function() B.TidySoon() end)
ns.On("TRADE_CLOSED", function() B.RequestTidy() end)

-- A conjure of food or water landing asks for one.
local conjures = CreateFrame("Frame")
conjures:SetScript("OnEvent", ns.Guard("tidy cast watch", function(_, _, unit, _, spell)
	if ns.Clean(unit) ~= "player" then return end
	local entry = ns.BY_SPELL[ns.Clean(spell)]
	if entry and entry.kind ~= "gem" then B.RequestTidy() end
end))
if conjures.RegisterUnitEvent then
	pcall(conjures.RegisterUnitEvent, conjures, "UNIT_SPELLCAST_SUCCEEDED", "player")
else
	pcall(conjures.RegisterEvent, conjures, "UNIT_SPELLCAST_SUCCEEDED")
end
