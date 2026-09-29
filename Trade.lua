-- Conjurer
-- Trade: the group, what each member is owed, and filling the trade window.
--
-- A member's share comes from their class, at the best rank they can eat or drink. What was
-- handed over is counted from the trade window itself at the moment you accept, and only once the
-- trade completes, so a cancelled trade gives nobody anything.
--
-- The client refuses a stack split straight across containers (seen with the bank), so a share
-- that is not whole stacks is split inside your bags first, into an empty slot, and that new stack
-- is then moved to the trade window whole.

local ADDON, ns = ...
local report = ns.report
local T = {}
ns.Trade = T

T.open = false      -- the trade window is open
T.partner = nil     -- the group member on the other side, if it is one
T.pending = {}      -- guid -> "owed" or "full": we asked them to trade, so fill when it opens
T.lastFill = "none yet"

local MAX_TRADE_SLOTS = 6

-- ------------------------------------------------------------------
-- The group
-- ------------------------------------------------------------------

local function Raid() return IsInRaid and IsInRaid() and true or false end

-- Everyone else in the group, or just your own raid group when "Include raid members" is off.
function T.Members()
	local list = {}
	local n = GetNumGroupMembers and GetNumGroupMembers() or 0
	if not n or n == 0 then return list end
	local raid = Raid()
	local mySub
	if raid and not ns.db.includeRaid and GetRaidRosterInfo then
		for i = 1, n do
			if UnitIsUnit("raid" .. i, "player") then
				local _, _, sub = GetRaidRosterInfo(i)
				mySub = sub
				break
			end
		end
	end
	local count = raid and n or (n - 1)
	for i = 1, count do
		local unit = raid and ("raid" .. i) or ("party" .. i)
		if UnitExists(unit) and not UnitIsUnit(unit, "player") then
			local keep = true
			if mySub then
				local _, _, sub = GetRaidRosterInfo(i)
				keep = sub == mySub
			end
			local guid = ns.Clean(UnitGUID(unit))
			if keep and guid then
				local _, class = UnitClass(unit)
				local level = ns.Clean(UnitLevel(unit))
				list[#list + 1] = {
					unit = unit,
					guid = guid,
					name = ns.Clean(UnitName(unit)) or "?",
					level = (type(level) == "number" and level > 0) and level or nil,
					class = ns.Clean(class),
					connected = ns.Clean(UnitIsConnected(unit)) ~= false,
				}
			end
		end
	end
	return list
end

function T.MemberByGuid(guid)
	if not guid then return nil end
	for _, m in ipairs(T.Members()) do
		if m.guid == guid then return m end
	end
	return nil
end

-- The best rank you know that someone of this level can use. With "Give the highest rank each
-- person can use" off, simply your best rank.
function T.RankFor(kind, level)
	local list = ns.KINDS[kind]
	for r = #list, 1, -1 do
		local entry = list[r]
		if ns.Known(entry.spell) and (not ns.db.bestRank or not level or entry.level <= level) then
			return entry
		end
	end
	return nil
end

-- What was handed to someone, while it still counts. After the time set in the Group section (0
-- means until you reset it) it's forgotten and they're owed a whole share again.
function T.Handed(guid)
	local h = guid and ns.db.handed[guid]
	if type(h) ~= "table" then return nil end
	local minutes = tonumber(ns.db.handedMinutes) or 0
	if minutes > 0 and h.t and (time() - h.t) >= minutes * 60 then
		ns.db.handed[guid] = nil
		ns.Log("forgot what " .. tostring(h.name) .. " was handed: " .. minutes .. " minutes passed")
		return nil
	end
	return h
end

-- Minutes until a hand-out is forgotten, or nil when it's kept until reset.
function T.HandedMinutesLeft(guid)
	local h = T.Handed(guid)
	local minutes = tonumber(ns.db.handedMinutes) or 0
	if not (h and h.t) or minutes <= 0 then return nil end
	return math.max(1, math.ceil((minutes * 60 - (time() - h.t)) / 60))
end

-- Someone's share: their class's, and for someone outside your group no more than the amounts set
-- for strangers.
function T.ShareFor(m)
	local share = ns.Share(m.class or "WARRIOR")
	if not m.stranger then return share end
	local cap = ns.db.strangers
	return { water = math.min(share.water or 0, cap.water or 0), food = math.min(share.food or 0, cap.food or 0) }
end

-- What a member is still owed: their class share minus what they were handed, one line per kind.
-- With full set, the whole share again. The second value counts kinds with nothing you can make.
function T.Owed(m, full)
	local out, missing = {}, 0
	local share = T.ShareFor(m)
	local handed = (not full) and T.Handed(m.guid) or {}
	for _, kind in ipairs(ns.KIND_ORDER) do
		local want = (share[kind] or 0) - (handed[kind] or 0)
		if want > 0 then
			local entry = T.RankFor(kind, m.level)
			if entry then
				out[#out + 1] = { entry = entry, count = want }
			else
				missing = missing + 1
			end
		end
	end
	return out, missing
end

function T.ShareText(m)
	local share = T.ShareFor(m)
	local parts = {}
	for _, kind in ipairs(ns.KIND_ORDER) do
		local n = share[kind] or 0
		if n > 0 then
			local entry = T.RankFor(kind, m.level)
			parts[#parts + 1] = n .. " " .. (entry and ns.ShortName(entry) or ns.KIND_LABEL[kind]:lower())
		end
	end
	return #parts > 0 and table.concat(parts, ", ") or "nothing"
end

local function InRange(unit)
	if not CheckInteractDistance then return true end
	local ok, near = pcall(CheckInteractDistance, unit, 2)
	if not ok then return true end
	near = ns.Clean(near)
	if near == nil then return true end
	return near and true or false
end

T.COLORS = {
	ready = { 0.35, 0.75, 1 },
	short = { 1, 0.6, 0.2 },
	done = { 0.4, 0.85, 0.4 },
	grey = { 0.55, 0.55, 0.55 },
}

-- A member's line: the status text, its colour, and the label for their button (nil for none).
function T.Status(m)
	local share = T.ShareFor(m)
	if (share.water or 0) + (share.food or 0) == 0 then return "No share", "grey", nil end
	local owed, missing = T.Owed(m)
	local trading = T.open and T.partner and T.partner.guid == m.guid
	if #owed == 0 then
		if missing > 0 then return "Nothing you can make", "grey", nil end
		local left = T.HandedMinutesLeft(m.guid)
		return "Handed out" .. (left and (" (" .. left .. "m)") or ""), "done", trading and "Fill" or "Again"
	end
	if not m.connected then return "Offline", "grey", nil end
	if not trading and not InRange(m.unit) then return "Out of range", "grey", "Trade" end
	for _, p in ipairs(owed) do
		local have = ns.Count(p.entry.item)
		if have < p.count then
			return "Short " .. (p.count - have) .. " " .. ns.ShortName(p.entry), "short", trading and "Fill" or "Trade"
		end
	end
	return "Ready", "ready", trading and "Fill" or "Trade"
end

function T.Summary()
	local members = T.Members()
	if #members == 0 then return "not in a group" end
	local handed, short = 0, 0
	for _, m in ipairs(members) do
		local _, tone = T.Status(m)
		if tone == "done" then handed = handed + 1 elseif tone == "short" then short = short + 1 end
	end
	return handed .. " of " .. #members .. " handed out" .. (short > 0 and (", " .. short .. " short") or "")
end

-- Sets every target to what the group is owed plus what you keep for yourself.
function T.FillTargets(announce)
	local sums = { water = {}, food = {} }
	local function Add(entry, n)
		if entry and n and n > 0 then
			sums[entry.kind][entry.rank] = (sums[entry.kind][entry.rank] or 0) + n
		end
	end
	local myLevel = ns.Clean(UnitLevel("player"))
	for _, kind in ipairs(ns.KIND_ORDER) do
		Add(T.RankFor(kind, type(myLevel) == "number" and myLevel or nil), ns.db.keep[kind] or 0)
	end
	for _, m in ipairs(T.Members()) do
		for _, p in ipairs((T.Owed(m))) do Add(p.entry, p.count) end
	end
	local parts = {}
	for _, kind in ipairs(ns.KIND_ORDER) do
		local list = ns.KINDS[kind]
		for r = #list, 1, -1 do
			local n = sums[kind][r] or 0
			ns.SetTarget(list[r], n)
			if n > 0 then parts[#parts + 1] = n .. " " .. ns.ShortName(list[r]) end
		end
	end
	-- They went into the profile Ready conjures to, so the window shows that one.
	if ns.UI then ns.UI.viewKey = nil end
	if announce then
		ns.Print("Targets set from your group: " .. (#parts > 0 and table.concat(parts, ", ") or "nothing") .. ".")
	end
	-- Lower ranks set for low-level players stay hidden, and unconjured, until they're shown.
	if not ns.db.showAllRanks then
		local hidden = {}
		for _, kind in ipairs(ns.KIND_ORDER) do
			for _, entry in ipairs(ns.KINDS[kind]) do
				if (sums[kind][entry.rank] or 0) > 0 and not ns.Shown(entry) then hidden[#hidden + 1] = ns.ShortName(entry) end
			end
		end
		if #hidden > 0 then
			ns.Print("Some of your group need a lower rank (" .. table.concat(hidden, ", ")
				.. "). Tick Show all ranks to see and conjure it.")
		end
	end
	ns.Refresh()
end

function T.ResetHanded()
	wipe(ns.db.handed)
	ns.Refresh()
end

-- ------------------------------------------------------------------
-- Bags and the trade window
-- ------------------------------------------------------------------

-- Looked up when used, so this file still loads when Bags.lua isn't (an update needing a restart).
local function SlotInfo(...) return ns.Bags and ns.Bags.SlotInfo(...) end
local function Stacks(...) return ns.Bags and ns.Bags.Stacks(...) or {} end
local function FreeBagSlot(...) if ns.Bags then return ns.Bags.FreeBagSlot(...) end end

-- One slot of our side of the trade window: nil when empty, else the item id (nil if unreadable)
-- and the count.
local function TradeSlot(i)
	if not GetTradePlayerItemInfo then return nil end
	local ok, name, _, count, _, _, _, _, itemID = pcall(GetTradePlayerItemInfo, i)
	if not ok or not name then return nil end
	itemID = ns.Clean(itemID)
	if type(itemID) ~= "number" and GetTradePlayerItemLink then
		local okLink, link = pcall(GetTradePlayerItemLink, i)
		if okLink and type(link) == "string" then itemID = tonumber(link:match("item:(%d+)")) end
	end
	return true, itemID, ns.Clean(count) or 0
end

-- What is on our side of the window (item id -> count) and which slots are still empty.
function T.ReadOffer()
	local offer, free = {}, {}
	for i = 1, MAX_TRADE_SLOTS do
		local used, id, count = TradeSlot(i)
		if not used then
			free[#free + 1] = i
		elseif id then
			offer[id] = (offer[id] or 0) + count
		end
	end
	return offer, free
end

-- ------------------------------------------------------------------
-- Filling
-- ------------------------------------------------------------------

-- Before anything goes in, loose stacks of what's about to be given are merged, so whole stacks
-- go over rather than a 13 and a 7 (the user's ask). One move at a time, each waited out until
-- both stacks are answered, then the fill goes on. With tidying switched off the stacks stay as
-- they are. True when it has started merging (and will carry on by itself).
local function TidyFirst(items, andThen)
	if not (ns.db.tidy and ns.Bags and ns.Bags.NextMerge(items)) then return false end
	T.job = { tidying = true }
	ns.Log("trade: tidying stacks first")
	local moves = 0
	local function Next()
		if not (T.open and T.job and T.job.tidying) then return end
		local entry, from, to = ns.Bags.NextMerge(items)
		if not entry or moves >= 12 or GetCursorInfo() or not ns.Bags.MergeOnce(entry, from, to, "before the trade") then
			T.job = nil
			andThen()
			return
		end
		moves = moves + 1
		local waits = 0
		local function Answered()
			waits = waits + 1
			if waits < 10 and (ns.Bags.Locked(from.bag, from.slot) or ns.Bags.Locked(to.bag, to.slot)) then
				ns.After(0.2, Answered)
			else
				Next()
			end
		end
		ns.After(0.2, Answered)
	end
	Next()
	return true
end

function T.Fill(m, full, tidied)
	ns.Log("fill for " .. tostring(m and m.name) .. " starting" .. (full and " (whole share)" or "")
		.. (tidied and " (stacks tidied)" or ""))
	if not T.open then
		ns.Log("fill stopped: the trade window is not open")
		return false, "the trade window is not open"
	end
	if ns.InCombat() then
		ns.Log("fill stopped: in combat")
		return false, "in combat"
	end
	if T.job then
		ns.Log("fill stopped: one is already running")
		return false, "a fill is already running"
	end
	if not tidied then
		local items = {}
		for _, p in ipairs((T.Owed(m, full))) do items[p.entry.item] = true end
		if TidyFirst(items, function() T.Fill(m, full, true) end) then return true end
	end
	local offer, free = T.ReadOffer()
	local steps, short = {}, {}
	for _, p in ipairs((T.Owed(m, full))) do
		local need = p.count - (offer[p.entry.item] or 0)
		for _, s in ipairs(Stacks(p.entry.item)) do
			if need <= 0 then break end
			if s.count <= need then
				steps[#steps + 1] = { op = "move", bag = s.bag, slot = s.slot, n = s.count, entry = p.entry }
				need = need - s.count
			else
				steps[#steps + 1] = { op = "split", bag = s.bag, slot = s.slot, n = need, entry = p.entry }
				need = 0
			end
		end
		if need > 0 then short[#short + 1] = need .. " " .. ns.ShortName(p.entry) end
	end
	local dropped = 0
	while #steps > #free do
		table.remove(steps)
		dropped = dropped + 1
	end
	for i, step in ipairs(steps) do step.trade = free[i] end
	T.job = { guid = m.guid, name = m.name, steps = steps, i = 1, done = 0, failed = 0, waits = 0 }
	T.lastFill = m.name .. ": " .. #steps .. " stack" .. (#steps == 1 and "" or "s") .. " to place"
		.. (#short > 0 and (", short " .. table.concat(short, " and ")) or "")
		.. (dropped > 0 and (", " .. dropped .. " left out (trade window full)") or "")
	if #short > 0 then ns.Print("Short for " .. m.name .. ": " .. table.concat(short, " and ") .. ".") end
	local plan = {}
	for _, step in ipairs(steps) do
		plan[#plan + 1] = step.op .. " " .. step.n .. " " .. step.entry.name .. " bag " .. step.bag .. " slot " .. step.slot
			.. " -> trade " .. tostring(step.trade)
	end
	ns.Log("fill " .. T.lastFill .. (#plan > 0 and (": " .. table.concat(plan, "; ")) or ""))
	T.Step()
	return true
end

local function Finish(job)
	T.lastFill = T.lastFill .. "; placed " .. job.done .. (job.failed > 0 and (", refused " .. job.failed) or "")
	report["last trade fill"] = T.lastFill
	ns.Log("fill finished: " .. T.lastFill)
	T.job = nil
	ns.Refresh()
end

function T.Step()
	local job = T.job
	if not job then return end
	if not T.open then
		T.job = nil
		return
	end
	local step = job.steps[job.i]
	if not step then
		Finish(job)
		return
	end
	-- Something of the player's own is on the cursor: wait for it to go, a few seconds at most.
	if GetCursorInfo() then
		job.waits = job.waits + 1
		if job.waits > 20 then
			T.lastFill = T.lastFill .. "; stopped, the cursor stayed busy"
			Finish(job)
			return
		end
		ns.After(0.25, T.Step)
		return
	end

	ns.Stage("filling trade slot " .. tostring(step.trade))
	if step.op == "split" then
		local bag, slot = FreeBagSlot(step.bag)
		if bag then
			pcall(C_Container.SplitContainerItem, step.bag, step.slot, step.n)
			if GetCursorInfo() then pcall(C_Container.PickupContainerItem, bag, slot) end
			if GetCursorInfo() then
				ClearCursor()
				job.failed = job.failed + 1
				job.i = job.i + 1
				ns.Log("step " .. job.i - 1 .. ": split of " .. step.n .. " into bag " .. bag .. " slot " .. slot .. " refused")
			else
				-- The new stack is locked until the server answers; move it whole next time.
				ns.Log("step " .. job.i .. ": split " .. step.n .. " into bag " .. bag .. " slot " .. slot)
				step.op, step.bag, step.slot = "move", bag, slot
			end
			ns.Stage("idle")
			ns.After(0.6, T.Step)
			return
		end
		-- No empty bag slot: try the split straight into the window.
		pcall(C_Container.SplitContainerItem, step.bag, step.slot, step.n)
	else
		local info = SlotInfo(step.bag, step.slot)
		if not info then
			job.failed = job.failed + 1
			job.i = job.i + 1
			ns.Stage("idle")
			ns.After(0.1, T.Step)
			return
		end
		if info.isLocked then
			step.lockWaits = (step.lockWaits or 0) + 1
			ns.Stage("idle")
			if step.lockWaits <= 12 then
				ns.After(0.25, T.Step)
				return
			end
		end
		pcall(C_Container.PickupContainerItem, step.bag, step.slot)
	end
	local held = GetCursorInfo() ~= nil
	if held and ClickTradeButton then pcall(ClickTradeButton, step.trade) end
	if GetCursorInfo() then
		ClearCursor()
		job.failed = job.failed + 1
		ns.Log("step " .. job.i .. ": trade slot " .. tostring(step.trade) .. " refused " .. step.n .. " " .. step.entry.name)
	elseif not held then
		job.failed = job.failed + 1
		ns.Log("step " .. job.i .. ": nothing came up on the cursor from bag " .. step.bag .. " slot " .. step.slot)
	else
		job.done = job.done + 1
		ns.Log("step " .. job.i .. ": " .. step.n .. " " .. step.entry.name .. " into trade slot " .. tostring(step.trade))
	end
	ns.Stage("idle")
	job.i = job.i + 1
	ns.After(0.3, T.Step)
end

-- Whoever is on the other side of the trade, as a member: the group member when it is one, else
-- read from the trade's own unit, so a share can be given to anyone.
function T.PartnerAsMember()
	if T.partner then return T.partner end
	local guid = ns.Clean(UnitGUID("NPC"))
	if not guid then return nil end
	local _, class = UnitClass("NPC")
	local level = ns.Clean(UnitLevel("NPC"))
	return {
		unit = "NPC", guid = guid, name = ns.Clean(UnitName("NPC")) or "?",
		level = (type(level) == "number" and level > 0) and level or nil,
		class = ns.Clean(class), connected = true, stranger = true,
	}
end

-- Starts moving items into the trade window, one step at a time.
local function StartJob(m, steps, what)
	T.job = { guid = m and m.guid, name = m and m.name or "?", steps = steps, i = 1, done = 0, failed = 0, waits = 0 }
	T.lastFill = (m and m.name or "?") .. ": " .. what
	ns.Log("trade: " .. T.lastFill)
	T.Step()
end

-- The moves that put this many of an item in the window: a stack of exactly that many whole,
-- else whole stacks biggest first and the rest split off.
local function Plan(entry, need)
	local steps = {}
	local stacks = Stacks(entry.item)
	for _, s in ipairs(stacks) do
		if s.count == need then
			return { { op = "move", bag = s.bag, slot = s.slot, n = need, entry = entry } }
		end
	end
	for _, s in ipairs(stacks) do
		if need <= 0 then break end
		if s.count <= need then
			steps[#steps + 1] = { op = "move", bag = s.bag, slot = s.slot, n = s.count, entry = entry }
			need = need - s.count
		else
			steps[#steps + 1] = { op = "split", bag = s.bag, slot = s.slot, n = need, entry = entry }
			need = 0
		end
	end
	return steps
end

-- One stack of your best food or water the other side can use, your fullest first, into the next
-- free slot: for someone who just asks for a stack. Shares don't come into it.
function T.AddStack(kind, tidied)
	if not T.open or ns.InCombat() then return end
	if T.job then
		ns.Print("Wait a moment: Conjurer is still putting things in the trade window.")
		return
	end
	if not tidied then
		local items = {}
		for _, e in ipairs(ns.KINDS[kind]) do items[e.item] = true end
		if TidyFirst(items, function() T.AddStack(kind, true) end) then return end
	end
	local m = T.PartnerAsMember()
	local _, free = T.ReadOffer()
	if #free == 0 then
		ns.Print("The trade window is full.")
		return
	end
	local level = m and m.level
	local list = ns.KINDS[kind]
	for r = #list, 1, -1 do
		local entry = list[r]
		if not ns.db.bestRank or not level or entry.level <= level then
			local s = Stacks(entry.item)[1]
			if s then
				StartJob(m, { { op = "move", bag = s.bag, slot = s.slot, n = s.count, entry = entry, trade = free[1] } },
					"a stack of " .. s.count .. " " .. entry.name)
				return
			end
		end
	end
	ns.Print("You have no conjured " .. kind .. (level and (" a level " .. level .. " can use") or "") .. ".")
end

-- Takes everything of yours back out of the trade window.
function T.ClearTrade()
	if not T.open or ns.InCombat() then return end
	T.job = nil
	local cleared = 0
	for i = 1, MAX_TRADE_SLOTS do
		if TradeSlot(i) and not GetCursorInfo() then
			pcall(ClickTradeButton, i)
			if GetCursorInfo() then
				ClearCursor()
				cleared = cleared + 1
			end
		end
	end
	ns.Log("trade: cleared " .. cleared .. " slot" .. (cleared == 1 and "" or "s"))
end

-- Puts this many of an item in the window: what you just conjured with the trade open.
function T.Give(entry, n)
	if not T.open or n <= 0 or ns.InCombat() then return end
	if T.job then
		ns.After(0.5, function() T.Give(entry, n) end)
		return
	end
	local _, free = T.ReadOffer()
	local steps = Plan(entry, n)
	local dropped = 0
	while #steps > #free do
		table.remove(steps)
		dropped = dropped + 1
	end
	if #steps == 0 then
		ns.Print("The trade window is full, so the " .. ns.ShortName(entry) .. " you conjured stays in your bags.")
		return
	end
	for i, step in ipairs(steps) do step.trade = free[i] end
	StartJob(T.PartnerAsMember(), steps, n .. " " .. entry.name .. " just conjured" .. (dropped > 0 and ", some left out (trade window full)" or ""))
end

-- A button under the game's trade window that puts their share in by hand: for when the automatic
-- fill is off, didn't happen, or the other side isn't in your group. A share already handed over
-- is given again whole, since the button is an explicit ask.
local tradeButton

-- A button in the row under the trade window.
local function TradeRowButton(name, text, width)
	local ok, b = pcall(CreateFrame, "Button", name, TradeFrame, "UIPanelButtonTemplate")
	if not (ok and b) then
		b = CreateFrame("Button", name, TradeFrame)
		local fs = b:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
		fs:SetAllPoints()
		b:SetFontString(fs)
		local bg = b:CreateTexture(nil, "BACKGROUND")
		bg:SetAllPoints()
		bg:SetColorTexture(0.3, 0.05, 0.05, 0.9)
	end
	b:SetSize(width, 22)
	b:SetText(text)
	return b
end

local function RowTip(b, title, body)
	b:SetScript("OnEnter", function(self)
		GameTooltip:SetOwner(self, "ANCHOR_BOTTOM")
		GameTooltip:SetText(title, 1, 1, 1)
		GameTooltip:AddLine(body, nil, nil, nil, true)
		GameTooltip:Show()
	end)
	b:SetScript("OnLeave", function() GameTooltip:Hide() end)
end

function T.ShowTradeButton()
	if not TradeFrame then
		report["trade button"] = "no TradeFrame on this client"
		return
	end
	if not tradeButton then
		local b = TradeRowButton("ConjurerTradeButton", "Conjurer: give share", 140)
		b:SetPoint("TOPLEFT", TradeFrame, "BOTTOMLEFT", 4, -2)
		-- Beside it: a stack of water, a stack of food, and taking it all back out.
		local water = TradeRowButton("ConjurerTradeWater", "+ Water", 64)
		water:SetPoint("LEFT", b, "RIGHT", 4, 0)
		water:SetScript("OnClick", ns.Guard("trade add water", function() T.AddStack("water") end))
		RowTip(water, "Add a stack of water", "Your best conjured water they can use, your fullest stack first. Click again for another.")
		local food = TradeRowButton("ConjurerTradeFood", "+ Food", 60)
		food:SetPoint("LEFT", water, "RIGHT", 4, 0)
		food:SetScript("OnClick", ns.Guard("trade add food", function() T.AddStack("food") end))
		RowTip(food, "Add a stack of food", "Your best conjured food they can use, your fullest stack first. Click again for another.")
		local clear = TradeRowButton("ConjurerTradeClear", "Clear", 56)
		clear:SetPoint("LEFT", food, "RIGHT", 4, 0)
		clear:SetScript("OnClick", ns.Guard("trade clear", T.ClearTrade))
		RowTip(clear, "Clear the trade window", "Takes everything you put in back out, into your bags.")
		b:SetScript("OnClick", ns.Guard("trade give share", function()
			local m = T.PartnerAsMember()
			if not m then
				ns.Print("Couldn't tell who the trade is with.")
				return
			end
			if not T.partner then T.partner = m end
			T.Fill(m, #(T.Owed(m)) == 0)
		end))
		b:SetScript("OnEnter", function(self)
			GameTooltip:SetOwner(self, "ANCHOR_BOTTOM")
			local m = T.PartnerAsMember()
			GameTooltip:SetText("Give their share", 1, 1, 1)
			if m then
				GameTooltip:AddLine(m.name .. ": " .. T.ShareText(m), nil, nil, nil, true)
			end
			GameTooltip:AddLine("Puts it in the trade window. You still press Trade to finish.", 0.8, 0.8, 0.8, true)
			GameTooltip:Show()
		end)
		b:SetScript("OnLeave", function() GameTooltip:Hide() end)
		tradeButton = b
		report["trade button"] = "under the trade window"
	end
	tradeButton:Show()
end

-- Asks a member to trade, or fills the window when the trade with them is already open.
function T.Request(m, full)
	if ns.InCombat() then
		ns.Print("You can't trade in combat.")
		return
	end
	if T.open then
		if T.partner and T.partner.guid == m.guid then
			T.Fill(m, full)
		else
			ns.Print("Finish the trade you have open first.")
		end
		return
	end
	T.pending[m.guid] = full and "full" or "owed"
	ns.Stage("opening a trade with " .. tostring(m.name))
	local ok, err = pcall(InitiateTrade, m.unit)
	ns.Stage("idle")
	report["open trade"] = ok and "asked" or ("failed: " .. tostring(err))
	ns.Log("asked " .. tostring(m.name) .. " (" .. m.unit .. ") to trade" .. (full and ", whole share again" or "")
		.. ": " .. report["open trade"])
end

-- ------------------------------------------------------------------
-- Counting what was handed over
-- ------------------------------------------------------------------

local function Record(offer)
	if T.recorded or not T.partner or not offer then return end
	T.recorded = true
	local guid = T.partner.guid
	local entryFor = T.Handed(guid) or {}
	local parts = {}
	for id, n in pairs(offer) do
		local entry = ns.BY_ITEM[id]
		if entry and n > 0 then
			entryFor[entry.kind] = (entryFor[entry.kind] or 0) + n
			parts[#parts + 1] = n .. " " .. ns.ShortName(entry)
		end
	end
	if #parts > 0 then
		entryFor.name = T.partner.name
		entryFor.t = time()
		ns.db.handed[guid] = entryFor
		table.sort(parts)
		ns.Print("Handed " .. T.partner.name .. " " .. table.concat(parts, " and ") .. ".")
		report["last trade"] = T.partner.name .. ": " .. table.concat(parts, ", ")
		ns.Log("handed " .. report["last trade"])
		ns.SnapshotReport("trade with " .. T.partner.name)
	end
	ns.Refresh()
end

ns.On("TRADE_SHOW", function()
	T.open = true
	T.recorded = false
	T.accepted = false
	T.offer = nil
	T.countsAtAccept = nil
	local guid = ns.Clean(UnitGUID("NPC"))
	T.partner = T.MemberByGuid(guid)
	local asked = guid and T.pending[guid]
	if guid then T.pending[guid] = nil end
	-- Someone outside the group gets filled too when that's ticked, up to the amounts for strangers.
	if not T.partner and guid and ns.db.strangers.autoFill then T.partner = T.PartnerAsMember() end
	T.incoming, T.incomingSeen, T.toGive = {}, {}, {}
	local m = T.partner
	local fill = m and (asked or ((m.stranger or ns.db.autoFill) and #(T.Owed(m)) > 0))
	ns.Log("trade opened with " .. (m and (m.name .. " (" .. tostring(m.class) .. " " .. tostring(m.level) .. ")")
		or ("someone outside the group " .. tostring(guid))) .. (m and m.stranger and " (outside the group)" or "")
		.. "; " .. (fill and "filling" or "not filling")
		.. (asked and (" (asked, " .. asked .. ")") or ""))
	if fill then
		ns.After(0.3, function()
			-- Compared by GUID: the member table is rebuilt whenever the group is read again.
			if not T.open then
				ns.Log("fill for " .. m.name .. " skipped: the trade closed first")
			elseif not (T.partner and T.partner.guid == m.guid) then
				ns.Log("fill for " .. m.name .. " skipped: the trade is now with " .. tostring(T.partner and T.partner.name))
			elseif T.job then
				ns.Log("fill for " .. m.name .. " skipped: a fill is already running")
			else
				T.Fill(m, asked == "full")
			end
		end)
	end
	T.ShowTradeButton()
	ns.Refresh()
end)

local function OfferText(offer)
	local parts = {}
	for id, n in pairs(offer or {}) do
		parts[#parts + 1] = n .. " " .. (ns.BY_ITEM[id] and ns.BY_ITEM[id].name or ("item " .. id))
	end
	table.sort(parts)
	return #parts > 0 and table.concat(parts, ", ") or "nothing"
end

ns.On("TRADE_PLAYER_ITEM_CHANGED", function()
	if T.open then T.offer = T.ReadOffer() end
end)

-- The window as it stood when you accepted is what the other side gets if the trade completes.
ns.On("TRADE_ACCEPT_UPDATE", function(mine, theirs)
	mine, theirs = ns.Clean(mine), ns.Clean(theirs)
	if mine == 1 then
		T.offer = T.ReadOffer()
		T.countsAtAccept = {}
		for id in pairs(T.offer) do T.countsAtAccept[id] = ns.Count(id) end
		T.accepted = true
	else
		T.accepted = false
	end
	ns.Log("trade accept: you " .. tostring(mine) .. ", them " .. tostring(theirs) .. "; offering " .. OfferText(T.offer))
end)

ns.On("UI_INFO_MESSAGE", function(_, message)
	if ERR_TRADE_COMPLETE and ns.Clean(message) == ERR_TRADE_COMPLETE then
		ns.Log("trade complete message")
		Record(T.offer)
	end
end)

ns.On("TRADE_CLOSED", function()
	ns.Log("trade closed" .. (T.recorded and " (counted)" or (T.accepted and " (checking the bags)" or " (not completed)")))
	T.open = false
	T.job = nil
	-- No "trade complete" message was recognised: the bags tell whether the items left.
	if T.accepted and not T.recorded and T.offer and T.countsAtAccept then
		local offer, before, partner = T.offer, T.countsAtAccept, T.partner
		ns.After(1, function()
			if T.recorded or T.partner ~= partner then return end
			for id, n in pairs(offer) do
				if ns.BY_ITEM[id] and (before[id] or 0) - ns.Count(id) < n then return end
			end
			Record(offer)
		end)
	end
	ns.Refresh()
end)

-- ------------------------------------------------------------------
-- Conjuring with the trade open
--
-- What you conjure while a trade is open goes into the window once it reaches your bags: casting
-- then says "this is for them". What arrives within a moment goes in together, so a cast whose
-- items come in two parts still fills one slot.
-- ------------------------------------------------------------------

T.incoming, T.incomingSeen, T.toGive = {}, {}, {}
local GIVE_AFTER = 1
local giveQueued = false

local function GiveArrived()
	giveQueued = false
	for item, n in pairs(T.toGive) do
		T.toGive[item] = nil
		if n > 0 and ns.BY_ITEM[item] then T.Give(ns.BY_ITEM[item], n) end
	end
end

local tradeCasts = CreateFrame("Frame")
tradeCasts:SetScript("OnEvent", ns.Guard("trade cast watch", function(_, _, unit, _, spell)
	if ns.Clean(unit) ~= "player" or not T.open or not ns.db.tradeConjure then return end
	spell = ns.Clean(spell)
	local entry = spell and ns.BY_SPELL[spell]
	if not entry or entry.kind == "gem" then return end
	local item = entry.item
	if T.incomingSeen[item] == nil then T.incomingSeen[item] = ns.Count(item) end
	T.incoming[item] = (T.incoming[item] or 0) + (ns.Conjure.Yield(entry) or 1)
	ns.Log("conjured with the trade open: " .. entry.name .. " goes in when it arrives")
end))
if tradeCasts.RegisterUnitEvent then
	pcall(tradeCasts.RegisterUnitEvent, tradeCasts, "UNIT_SPELLCAST_SUCCEEDED", "player")
else
	pcall(tradeCasts.RegisterEvent, tradeCasts, "UNIT_SPELLCAST_SUCCEEDED")
end

ns.On("BAG_UPDATE_DELAYED", function()
	if not T.open then return end
	for item, n in pairs(T.incoming) do
		local now = ns.Count(item)
		local before = T.incomingSeen[item] or now
		if n > 0 and now > before then
			local arrived = math.min(n, now - before)
			T.incoming[item] = n - arrived
			T.toGive[item] = (T.toGive[item] or 0) + arrived
			if not giveQueued then
				giveQueued = true
				ns.After(GIVE_AFTER, GiveArrived)
			end
		end
		T.incomingSeen[item] = now
	end
end)

ns.On("GROUP_ROSTER_UPDATE", function() ns.Refresh() end)
ns.On("UNIT_LEVEL", function() ns.Refresh() end)
ns.On("GROUP_LEFT", function()
	if ns.db then wipe(ns.db.handed) end
	ns.Refresh()
end)

-- ------------------------------------------------------------------
-- Player tooltips
--
-- Hovering a friendly player shows what Conjurer would hand them, at the rank they can use, and
-- whether they've had it: group members as the Group section has them, anyone else as a stranger.
-- ------------------------------------------------------------------

local function TooltipUnit(tooltip, data)
	local guid = type(data) == "table" and ns.Clean(data.guid)
	if guid and UnitTokenFromGUID then
		local ok, unit = pcall(UnitTokenFromGUID, guid)
		unit = ok and ns.Clean(unit)
		if type(unit) == "string" then return unit end
	end
	if tooltip and tooltip.GetUnit then
		local ok, _, unit = pcall(tooltip.GetUnit, tooltip)
		unit = ok and ns.Clean(unit)
		if type(unit) == "string" then return unit end
	end
	return nil
end

-- The line for a unit's tooltip, or nil when there's nothing to say.
function T.TooltipLine(unit)
	if not (ns.db and ns.db.tooltip and ns.isMage) then return nil end
	if not (UnitIsPlayer and ns.Clean(UnitIsPlayer(unit))) then return nil end
	if UnitIsUnit(unit, "player") then return nil end
	if UnitIsFriend and not ns.Clean(UnitIsFriend("player", unit)) then return nil end
	local guid = ns.Clean(UnitGUID(unit))
	if not guid then return nil end
	local m = T.MemberByGuid(guid)
	if not m then
		local _, class = UnitClass(unit)
		local level = ns.Clean(UnitLevel(unit))
		m = { unit = unit, guid = guid, name = ns.Clean(UnitName(unit)) or "?", class = ns.Clean(class),
			level = (type(level) == "number" and level > 0) and level or nil, stranger = true }
	end
	local share = T.ShareText(m)
	if share == "nothing" then return nil end
	local line = "Conjurer: " .. share
	if T.Handed(guid) then
		local left = T.HandedMinutesLeft(guid)
		line = line .. " (handed out" .. (left and (", " .. left .. "m left") or "") .. ")"
	end
	return line
end

local function AddToTooltip(tooltip, data)
	if tooltip ~= GameTooltip then return end
	local unit = TooltipUnit(tooltip, data)
	if not unit then return end
	local ok, line = pcall(T.TooltipLine, unit)
	if ok and line then tooltip:AddLine(line, 0.25, 0.78, 0.92) end
end

if TooltipDataProcessor and TooltipDataProcessor.AddTooltipPostCall and Enum and Enum.TooltipDataType
	and Enum.TooltipDataType.Unit then
	pcall(TooltipDataProcessor.AddTooltipPostCall, Enum.TooltipDataType.Unit, ns.Guard("player tooltip", AddToTooltip))
	report["player tooltips"] = "TooltipDataProcessor"
elseif GameTooltip and GameTooltip.HookScript then
	pcall(GameTooltip.HookScript, GameTooltip, "OnTooltipSetUnit", ns.Guard("player tooltip", AddToTooltip))
	report["player tooltips"] = "OnTooltipSetUnit"
else
	report["player tooltips"] = "no way to hook them on this client"
end

ns.debugSources[#ns.debugSources + 1] = function()
	local handed = 0
	for _ in pairs(ns.db and ns.db.handed or {}) do handed = handed + 1 end
	return {
		"group: " .. T.Summary() .. "; handed out to " .. handed .. " so far; auto fill " .. tostring(ns.db and ns.db.autoFill),
		"trade: " .. (T.open and "open" or "closed") .. ", last fill " .. tostring(T.lastFill),
		"trade functions: InitiateTrade " .. (InitiateTrade and "yes" or "no") .. ", ClickTradeButton "
			.. (ClickTradeButton and "yes" or "no") .. ", GetTradePlayerItemInfo " .. (GetTradePlayerItemInfo and "yes" or "no"),
	}
end
