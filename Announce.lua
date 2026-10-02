-- Conjurer
-- Announce: a button on the quick access bar that tells your party, raid or battleground to trade
-- you for food and water, with how much of each you have left.
--
-- The message is yours to word; {stock} becomes what you have ("120 Crystal Water (55+) and 60
-- Cinnamon Roll (55+)"), {water} and {food} each kind on its own, with the items as links people
-- can shift-click (plain names when the links would make it too long for the chat). It goes to the
-- battleground or instance group when you're in one, else the raid, else the party, and on your
-- own, when the button isn't kept to groups, to the people around you (Say). A click is the only
-- thing that sends it, and not more than once every few seconds. Whether it reached the chat is
-- checked against the chat itself and written to the log.

local ADDON, ns = ...
local report = ns.report
local N = {}
ns.Announce = N

local SIZE = 36
local COOLDOWN = 10
local MAX_LENGTH = 255
local button
N.last = -COOLDOWN

N.DEFAULT_MESSAGE = "Mage food and water here! Trade me for yours. I have {stock}."
N.CHANNEL_LABEL = { INSTANCE_CHAT = "your battleground or instance group", RAID = "your raid", PARTY = "your party",
	SAY = "the people around you (Say)" }

-- Where a group message goes right now, or nil when you're on your own.
function N.Channel()
	if IsInGroup and LE_PARTY_CATEGORY_INSTANCE then
		local ok, inInstanceGroup = pcall(IsInGroup, LE_PARTY_CATEGORY_INSTANCE)
		if ok and ns.Clean(inInstanceGroup) then return "INSTANCE_CHAT" end
	end
	if IsInRaid and IsInRaid() then return "RAID" end
	local n = GetNumGroupMembers and ns.Clean(GetNumGroupMembers()) or 0
	if (IsInGroup and IsInGroup()) or (tonumber(n) or 0) > 0 then return "PARTY" end
	-- On your own, with the button not kept to groups: whoever is around you.
	if ns.db and ns.db.announce and not ns.db.announce.groupOnly then return "SAY" end
	return nil
end

-- The item as a link people can shift-click, or nil when the client doesn't have it yet.
local function Link(entry)
	local fn = (C_Item and C_Item.GetItemInfo) or GetItemInfo
	if not fn then return nil end
	local ok, _, link = pcall(fn, entry.item)
	link = ok and ns.Clean(link)
	if type(link) == "string" and link ~= "" then return link end
	return nil
end

-- What you have of one kind, best rank first, with the level each rank needs.
local function KindText(kind, links)
	local parts = {}
	local list = ns.KINDS[kind]
	for r = #list, 1, -1 do
		local entry = list[r]
		local n = ns.Count(entry.item)
		if n > 0 then
			local name = (links and Link(entry)) or ns.ShortName(entry)
			parts[#parts + 1] = n .. " " .. name .. (entry.level > 1 and (" (" .. entry.level .. "+)") or "")
		end
	end
	if #parts == 0 then return nil end
	return table.concat(parts, ", ")
end

function N.Stock(links)
	local water, food = KindText("water", links), KindText("food", links)
	local stock
	if water and food then
		stock = water .. " and " .. food
	else
		stock = water or food
	end
	return stock, water, food
end

local function Fill(template, links)
	local stock, water, food = N.Stock(links)
	if not stock then return nil end
	local text = template
	text = text:gsub("{stock}", function() return stock end)
	text = text:gsub("{water}", function() return water or "no water" end)
	text = text:gsub("{food}", function() return food or "no food" end)
	return (text:gsub("[\r\n]+", " "))
end

-- The message as it would go out now, or nil when there is nothing to offer.
function N.Message()
	local template = ns.db.announce.message
	if type(template) ~= "string" or template:gsub("%s", "") == "" then template = N.DEFAULT_MESSAGE end
	local text = Fill(template, true)
	if not text then return nil end
	-- A cut link would break the message: too long with links, it goes with plain names.
	if #text > MAX_LENGTH then text = Fill(template, false) end
	if #text > MAX_LENGTH then text = text:sub(1, MAX_LENGTH - 3) .. "..." end
	return text
end

-- The words of a message with its links taken out, for matching what the chat shows.
local function Plain(text)
	return (tostring(text):gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", ""):gsub("|H.-|h(.-)|h", "%1"))
end

function N.Send()
	local channel = N.Channel()
	if not channel then
		ns.Print("You're not in a party, raid or battleground, so there's no one to announce to.")
		return false
	end
	local text = N.Message()
	if not text then
		ns.Print("You have no conjured food or water to offer yet.")
		return false
	end
	local now = GetTime()
	if now - N.last < COOLDOWN then
		ns.Print("Announced a moment ago. Try again in " .. math.ceil(COOLDOWN - (now - N.last)) .. " seconds.")
		return false
	end
	local send = (C_ChatInfo and C_ChatInfo.SendChatMessage) or SendChatMessage
	ns.Stage("announcing in " .. channel)
	local ok, err = pcall(send, text, channel)
	ns.Stage("idle")
	N.last = now
	N.lastText = ok and text or nil
	report["last announce"] = channel .. ": " .. (ok and "sent" or ("failed: " .. tostring(err)))
	ns.Log("announce to " .. channel .. ": " .. (ok and "sent" or ("failed: " .. tostring(err))) .. " | " .. text)
	if not ok then ns.Print("The game didn't let Conjurer send that. It's in the log.") end
	if button and button.cooldown then pcall(button.cooldown.SetCooldown, button.cooldown, now, COOLDOWN) end
	return ok
end

local function Tooltip(self)
	GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
	GameTooltip:SetText("Announce food and water", 1, 1, 1)
	local channel = N.Channel()
	local text = N.Message()
	if text then
		GameTooltip:AddLine(channel and ("To " .. N.CHANNEL_LABEL[channel] .. ":") or "Not in a group now. It would say:", 1, 0.82, 0, true)
		GameTooltip:AddLine(text, 0.9, 0.9, 0.9, true)
	else
		GameTooltip:AddLine("You have no conjured food or water to offer yet.", 1, 0.5, 0.5, true)
	end
	GameTooltip:AddLine(" ")
	GameTooltip:AddLine("Click: announce", 0.7, 0.7, 0.7)
	GameTooltip:AddLine("Right-click: Conjurer settings", 0.7, 0.7, 0.7)
	GameTooltip:AddLine("Drag: move the bar", 0.7, 0.7, 0.7)
	GameTooltip:Show()
end

-- Whether the button belongs on the quick access bar now: turned on, and in a group unless it
-- isn't kept to groups.
function N.Wanted()
	local db = ns.db and ns.db.announce
	return ns.isMage and db and db.shown and (not db.groupOnly or N.Channel() ~= nil) and true or false
end

-- The button itself, made by the quick access bar as one of its own (which lays it out and lets it
-- drag the bar).
function N.Make(parent, size)
	if button then return button end
	ns.Stage("building the announce button")
	button = CreateFrame("Button", "ConjurerAnnounce", parent)
	button:SetSize(size, size)
	ns.UI.DressIcon(button, size)
	-- A chat bubble in the corner says what it does.
	button.badge = button:CreateTexture(nil, "OVERLAY", nil, 3)
	button.badge:SetSize(18, 18)
	button.badge:SetPoint("TOPRIGHT", 5, 5)
	if ns.HasAtlas("communities-icon-chat") then
		button.badge:SetAtlas("communities-icon-chat")
		report["announce badge"] = "communities-icon-chat"
	else
		button.badge:Hide()
		report["announce badge"] = "none (atlas missing)"
	end
	local ok, cooldown = pcall(CreateFrame, "Cooldown", nil, button, "CooldownFrameTemplate")
	if ok and cooldown then
		cooldown:SetAllPoints()
		if cooldown.SetDrawEdge then cooldown:SetDrawEdge(false) end
		button.cooldown = cooldown
	end
	button:RegisterForClicks("LeftButtonUp", "RightButtonUp")
	button:SetScript("OnClick", ns.Guard("announce button", function(_, which)
		if which == "RightButton" then ns.UI.Show() else N.Send() end
	end))
	button:SetScript("OnEnter", Tooltip)
	button:SetScript("OnLeave", function() GameTooltip:Hide() end)
	button:Hide()
	ns.Stage("idle")
	return button
end

-- Its face: your best water (or food).
function N.Paint()
	if not button then return end
	local top = ns.TopKnown("water") or ns.TopKnown("food")
	button.icon:SetTexture(top and ns.ItemIcon(top) or "Interface\\Icons\\INV_Drink_18")
end

-- Says where things stand and has the quick access bar lay itself out again.
function N.Update()
	if not ns.db then return end
	local db = ns.db.announce
	if N.Wanted() then
		report["announce button"] = "on the quick access bar"
	else
		report["announce button"] = db.shown and "on, hidden until you're in a group" or "off"
	end
	if ns.Alert and ns.Alert.Update then ns.Alert.Update(true) end
end

function N.Summary()
	local db = ns.db.announce
	if not db.shown then return "off" end
	return db.groupOnly and "on, while you're in a group" or "on"
end

function N.Init()
	N.Update()
end

-- The chat itself says whether the message went out.
local CHAT_EVENTS = { "CHAT_MSG_PARTY", "CHAT_MSG_PARTY_LEADER", "CHAT_MSG_RAID", "CHAT_MSG_RAID_LEADER",
	"CHAT_MSG_INSTANCE_CHAT", "CHAT_MSG_INSTANCE_CHAT_LEADER", "CHAT_MSG_SAY" }
for _, event in ipairs(CHAT_EVENTS) do
	ns.On(event, function(text)
		text = ns.Clean(text)
		if N.lastText and text and Plain(text) == Plain(N.lastText) then
			ns.Log("announce seen in chat (" .. event .. ")")
			report["last announce"] = (report["last announce"] or "") .. ", seen in chat"
			N.lastText = nil
		end
	end)
end

ns.On("GROUP_ROSTER_UPDATE", function() N.Update() end)
ns.On("GROUP_LEFT", function() N.Update() end)
ns.On("PLAYER_ENTERING_WORLD", function() N.Update() end)
ns.On("SPELLS_CHANGED", function() N.Update() end)

ns.debugSources[#ns.debugSources + 1] = function()
	local db = ns.db and ns.db.announce
	if not db then return {} end
	return {
		"announce button: " .. tostring(report["announce button"] or "not built") .. "; channel now "
			.. tostring(N.Channel()) .. "; last " .. tostring(report["last announce"] or "none"),
	}
end
