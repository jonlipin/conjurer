// Offline harness for Conjurer: stubs the WoW API in fengari and walks the main paths.
//
//   node tests/conjurertest.js [addon dir] [--bare] [--verbose]
//
//   --bare    every UI template and atlas is missing, the way an unexpected client build would look
//
// The stub models the parts of the client Conjurer leans on: action bar slots and the cursor
// (placing a spell on the borrowed button), override bindings, the two hold to cast settings,
// bags with stacks, splits and locks, the trade window, a party, and timers. A "hold" is modelled
// the way the client does it: the bar button's binding presses, the game casts whatever the
// button holds, again and again, until the key is let go or the button is empty.
const fs = require('fs');
const path = require('path');
const { lua, lauxlib, lualib, to_luastring } = require('fengari');

let DIR = process.argv.slice(2).find(a => !a.startsWith('--')) || path.resolve(__dirname, '..');
DIR = DIR.replace(/\\/g, '/');
if (!DIR.endsWith('/')) DIR += '/';
const files = ['Core.lua', 'Conjure.lua', 'Trade.lua', 'Macro.lua', 'UI.lua', 'Minimap.lua'];

const stub = String.raw`
local unpack = unpack or table.unpack
local VERBS = { "Set", "Get", "Is", "Create", "Register", "Enable", "Clear", "Hook", "Start", "Stop", "Has", "Add",
  "Unregister", "Disable", "Raise", "Lower", "Lock", "Unlock", "Show", "Hide", "Toggle", "Play", "Cancel", "Update",
  "Desaturate", "Can", "Fire" }
local function isMethod(k)
  if type(k) ~= "string" then return false end
  for _, v in ipairs(VERBS) do if k:sub(1, #v) == v then return true end end
  return false
end
local NOOP = function() end

FRAMES, TEXTURES = {}, {}
local M = {}
local obj

M.GetChildren = function(s) return unpack(s.kids or {}) end
M.Show = function(s) local was = s.shown s.shown = true if not was and s.scripts.OnShow then s.scripts.OnShow(s) end end
M.Hide = function(s) local was = s.shown s.shown = false if was and s.scripts.OnHide then s.scripts.OnHide(s) end end
M.SetShown = function(s, v) if v then s:Show() else s:Hide() end end
M.IsShown = function(s) return s.shown end
M.IsVisible = function(s) local f = s while f do if not f.shown then return false end f = f.parent end return true end
M.GetObjectType = function(s) return s.kind end
M.GetName = function(s) return s.name end
M.GetParent = function(s) return s.parent end
M.SetParent = function(s, p) s.parent = p end
M.SetScript = function(s, e, f) s.scripts[e] = f end
M.GetScript = function(s, e) return s.scripts[e] end
M.HookScript = function(s, e, f) local old = s.scripts[e] s.scripts[e] = function(...) if old then old(...) end f(...) end end
M.SetSize = function(s, w, h) s.w, s.h = w, h end
M.SetWidth = function(s, w) s.w = w end
M.SetHeight = function(s, h) s.h = h end
M.GetWidth = function(s) return s.w end
M.GetHeight = function(s) return s.h end
M.GetSize = function(s) return s.w, s.h end
M.SetPoint = function(s, a1, a2, a3, a4, a5)
  local rel, relPoint, x, y
  if type(a2) == "number" then rel, relPoint, x, y = s.parent, a1, a2, a3
  elseif a2 == nil then rel, relPoint, x, y = s.parent, a1, 0, 0
  else rel, relPoint, x, y = a2, a3 or a1, a4 or 0, a5 or 0 end
  s.points[#s.points + 1] = { a1, rel, relPoint, x, y }
end
M.GetPoint = function(s, i) local p = s.points[i or 1] if p then return p[1], p[2], p[3], p[4], p[5] end end
M.ClearAllPoints = function(s) s.points = {} end
M.SetAllPoints = function(s, o) s.allPoints = o or s.parent end
M.SetAttribute = function(s, k, v) s.attributes[k] = v end
M.GetAttribute = function(s, k) return s.attributes[k] end
M.RegisterEvent = function(s, e) if BAD_EVENTS and BAD_EVENTS[e] then error("unknown event " .. e) end s.events[e] = true end
M.RegisterUnitEvent = function(s, e, unit) s.events[e] = true s.unitFor = s.unitFor or {} s.unitFor[e] = unit end
M.UnregisterEvent = function(s, e) s.events[e] = nil end
M.SetText = function(s, t) s.text = t end
M.GetText = function(s) return s.text end
M.SetTextColor = function(s, r, g, b) s.color = { r, g, b } end
M.SetChecked = function(s, v) s.checked = v end
M.GetChecked = function(s) return s.checked end
M.SetEnabled = function(s, v) s.enabled = v end
M.IsEnabled = function(s) return s.enabled end
M.LockHighlight = function(s) s.highlighted = true end
M.UnlockHighlight = function(s) s.highlighted = false end
M.EnableKeyboard = function(s, v) s.keyboard = v end
M.SetMinMaxValues = function(s, a, b) s.minV, s.maxV = a, b end
M.GetMinMaxValues = function(s) return s.minV or 0, s.maxV or 0 end
M.SetValueStep = function(s, v) s.step = v end
M.GetValueStep = function(s) return s.step or 1 end
M.SetValue = function(s, v)
  if s.minV then v = math.max(s.minV, math.min(s.maxV, v)) end
  s.value = v
  if s.scripts.OnValueChanged then s.scripts.OnValueChanged(s, v) end
end
M.GetValue = function(s) return s.value or 0 end
M.SetScrollChild = function(s, c) s.scrollChild = c end
M.SetVerticalScroll = function(s, v) s.scrollY = v end
M.GetVerticalScroll = function(s) return s.scrollY or 0 end
M.SetTexture = function(s, t) s.texture = t s.atlas = nil end
M.SetColorTexture = function(s, r, g, b, a) s.colorTexture = { r, g, b, a } end
M.SetAtlas = function(s, a, useSize)
  if BAD_ATLAS then s.atlas = nil return end
  s.atlas = a
  if useSize and ATLAS_SIZE[a] then s.w, s.h = ATLAS_SIZE[a][1], ATLAS_SIZE[a][2] end
end
M.SetDesaturated = function(s, v) s.desaturated = v end
M.SetAlpha = function(s, a) s.alpha = a end
M.GetAlpha = function(s) return s.alpha or 1 end
M.SetFontString = function(s, f) s.fontString = f end
M.CreateTexture = function(s, name, layer)
  local t = obj("texture") t.parent = s t.layer = layer TEXTURES[#TEXTURES + 1] = t return t
end
M.CreateMaskTexture = function(s) local t = obj("mask") t.parent = s return t end
M.AddMaskTexture = function(s, m) s.mask = m end
M.CreateFontString = function(s, name, layer, font) local t = obj("fontstring") t.parent = s t.font = font return t end
M.CreateAnimationGroup = function(s) local g = obj("animgroup") g.parent = s g.anims = {} return g end
M.CreateAnimation = function(s, kind)
  if BAD_FLIPBOOK and kind == "FlipBook" then error("no FlipBook animations") end
  local a = obj("anim") a.parent = s a.animKind = kind s.anims[#s.anims + 1] = a return a
end
M.Play = function(s) s.playing = true end
M.Stop = function(s) s.playing = false end
M.IsPlaying = function(s) return s.playing end
M.SetLooping = function(s, v) s.looping = v end
M.Cancel = function(s) s.cancelled = true end

obj = function(kind, template, name)
  local o = { kind = kind, template = template, name = name, shown = true, scripts = {}, points = {}, attributes = {},
    events = {}, kids = {}, w = 0, h = 0, enabled = true }
  return setmetatable(o, { __index = function(t, k)
    local m = M[k]
    if m then return m end
    if isMethod(k) then return NOOP end
    return nil
  end })
end

ATLAS_SIZE = { Options_ListExpand_Left = { 23, 26 }, Options_ListExpand_Right = { 30, 26 }, Options_ListExpand_Right_Expanded = { 30, 26 } }
KNOWN_ATLASES = {}
for _, a in ipairs({ "Options_ListExpand_Left", "_Options_ListExpand_Middle", "Options_ListExpand_Right",
  "Options_ListExpand_Right_Expanded", "UI-HUD-ActionBar-IconFrame-Mask", "UI-HUD-ActionBar-IconFrame",
  "UI-HUD-ActionBar-IconFrame-Down", "UI-HUD-ActionBar-IconFrame-Mouseover", "UI-HUD-ActionBar-Proc-Loop-Flipbook",
  "classicon-mage", "classicon-priest", "classicon-warrior", "classicon-hunter", "classicon-warlock" }) do
  KNOWN_ATLASES[a] = true
end
C_Texture = { GetAtlasInfo = function(a) if BAD_ATLAS then return nil end return KNOWN_ATLASES[a] and { width = 10 } or nil end }

BAD_TEMPLATES = BAD_TEMPLATES or {}
CALLBACKS = {}

function CreateFrame(kind, name, parent, template)
  if template and BAD_TEMPLATES[template] then error("Couldn't find inherited node " .. template) end
  local f = obj(kind, template, name)
  f.parent = parent
  if parent and parent.kids then parent.kids[#parent.kids + 1] = f end
  if template == "ButtonFrameTemplate" or template == "PortraitFrameTemplate" then
    f.NineSlice = obj("Frame")
    f.TitleContainer = { TitleText = obj("fontstring") }
    f.PortraitContainer = { portrait = obj("texture") }
    f.CloseButton = obj("Button")
    if template == "ButtonFrameTemplate" then f.Inset = obj("Frame") f.Inset.parent = f end
    f.SetPortraitToAsset = function(s, icon) s.PortraitContainer.portrait.texture = icon end
  end
  if template == "UIPanelButtonTemplate" then f.fontString = obj("fontstring") end
  if template == "ConjurerScrollFrameTemplate" or template == "UIPanelScrollFrameTemplate" then f.ScrollBar = obj("Slider") end
  if template == "MinimalSliderWithSteppersTemplate" then
    f.Slider = CreateFrame("Slider", nil, f)
    f.cbs = {}
    f.Init = function(s, value, minV, maxV, steps, formatters)
      s.Slider:SetMinMaxValues(minV, maxV)
      s.Slider:SetValueStep((maxV - minV) / steps)
      s.Slider:SetValue(value)
      s.formatters = formatters
      s.Slider:SetScript("OnValueChanged", function(_, v)
        s:FormatValue(v)
        for _, cb in ipairs(s.cbs) do cb[1](cb[2], v) end
      end)
    end
    f.RegisterCallback = function(s, event, fn, owner) s.cbs[#s.cbs + 1] = { fn, owner } end
    f.FormatValue = function(s, v) s.shownValue = v end
    f.SetEnabled = function(s, on) s.sliderEnabled = on end
    f.SetValue = function(s, v) s.Slider:SetValue(v) end
  end
  FRAMES[#FRAMES + 1] = f
  if name then _G[name] = f end
  return f
end

MinimalSliderWithSteppersMixin = { Event = { OnValueChanged = "OnValueChanged" }, Label = { Left = 1, Right = 2 } }

UIParent = obj("Frame") UIParent.w, UIParent.h = 1920, 1080
Minimap = obj("Frame") Minimap.w, Minimap.h = 140, 140
GameTooltip = obj("GameTooltip")
CHAT = {}
DEFAULT_CHAT_FRAME = { AddMessage = function(_, m) CHAT[#CHAT + 1] = m if VERBOSE then print(m) end end }
ERRORS = {}
UIErrorsFrame = { AddMessage = function(_, m) ERRORS[#ERRORS + 1] = m end }
SlashCmdList = {} UISpecialFrames = {} tinsert = table.insert
function wipe(t) for k in pairs(t) do t[k] = nil end return t end
SOUNDKIT = { IG_QUEST_LIST_COMPLETE = 878, TUTORIAL_POPUP = 7355, IG_SPELLBOOK_OPEN = 829, IG_SPELLBOOK_CLOSE = 830,
  IG_MAINMENU_OPTION_CHECKBOX_ON = 856, IG_MAINMENU_OPTION_CHECKBOX_OFF = 857 }
PLAYED = {}
function PlaySound(id) PLAYED[#PLAYED + 1] = id end
function GetBuildInfo() return "1.60.1", "70009" end
function debugstack() return "[string \"@Conjurer\\Conjure.lua\"]:1: in function <x>\n" end
function issecretvalue(v) return SECRETS and SECRETS[v] or false end
ERR_TRADE_COMPLETE = "Trade complete."
NUM_BAG_SLOTS = 4
RAID_CLASS_COLORS = { MAGE = { r = 0.25, g = 0.78, b = 0.92 }, PRIEST = { r = 1, g = 1, b = 1 }, WARRIOR = { r = 0.78, g = 0.61, b = 0.43 },
  HUNTER = { r = 0.67, g = 0.83, b = 0.45 }, WARLOCK = { r = 0.53, g = 0.53, b = 0.93 } }
CLASS_ICON_TCOORDS = { MAGE = { 0.25, 0.5, 0, 0.25 }, PRIEST = { 0.5, 0.75, 0.25, 0.5 }, WARRIOR = { 0, 0.25, 0, 0.25 },
  HUNTER = { 0, 0.25, 0.25, 0.5 }, WARLOCK = { 0.75, 1, 0.25, 0.5 }, ROGUE = { 0.5, 0.75, 0, 0.25 }, DRUID = { 0.75, 1, 0, 0.25 },
  SHAMAN = { 0.25, 0.5, 0.25, 0.5 }, PALADIN = { 0, 0.25, 0.5, 0.75 } }
local CLASSES = { "WARRIOR", "PALADIN", "HUNTER", "ROGUE", "PRIEST", "SHAMAN", "MAGE", "WARLOCK", "DRUID" }
function GetNumClasses() return #CLASSES end
function GetClassInfo(i) return CLASSES[i]:sub(1, 1) .. CLASSES[i]:sub(2):lower(), CLASSES[i], i end

-- Timers
NOW = 1000
TIMERS = {}
function GetTime() return NOW end
C_Timer = {
  After = function(sec, fn) TIMERS[#TIMERS + 1] = { due = NOW + sec, fn = fn } end,
  NewTicker = function(sec, fn) local t = { Cancel = function(self) self.cancelled = true end } TICKERS = (TICKERS or 0) + 1 return t end,
}
function RunTimers(seconds)
  local target = NOW + (seconds or 0)
  for guard = 1, 10000 do
    local best, bi
    for i, t in ipairs(TIMERS) do if t.due <= target and (not best or t.due < best.due) then best, bi = t, i end end
    if not best then break end
    table.remove(TIMERS, bi)
    if best.due > NOW then NOW = best.due end
    best.fn()
  end
  NOW = target
end

function fire(event, ...)
  for _, f in ipairs(FRAMES) do
    if f.events[event] and f.scripts.OnEvent then f.scripts.OnEvent(f, event, ...) end
  end
end

-- Hooks on the game's globals
function hooksecurefunc(name, fn)
  local orig = _G[name]
  _G[name] = function(...) local r = { orig(...) } fn(...) return unpack(r) end
end

-- The player and the spellbook
PLAYER_CLASS = PLAYER_CLASS or "MAGE"
PLAYER_LEVEL = PLAYER_LEVEL or 60
function UnitClass(unit)
  if unit == "player" then return PLAYER_CLASS:sub(1, 1) .. PLAYER_CLASS:sub(2):lower(), PLAYER_CLASS end
  local m = MemberFor(unit)
  if m then return m.class, m.class end
end
KNOWN = {}
C_SpellBook = { IsSpellKnown = function(id) return KNOWN[id] == true end }
C_Spell = {
  GetSpellTexture = function(id) return "spellicon:" .. id end,
  PickupSpell = function(id) if KNOWN[id] then CURSOR = { kind = "spell", id = id } end end,
}
C_Item = {
  GetItemNameByID = function(id) return ITEM_NAMES[id] end,
  GetItemIconByID = function(id) return "itemicon:" .. id end,
  RequestLoadItemDataByID = function() end,
  GetItemCount = function(id)
    local n = 0
    for bag = 0, 4 do for slot, s in pairs(BAGS[bag] or {}) do if s.itemID == id then n = n + s.stackCount end end end
    return n
  end,
}
ITEM_NAMES = {}

-- Action bars and the cursor
ACTIONS = {}
CURSOR = nil
function GetCursorInfo() if CURSOR then return CURSOR.kind, CURSOR.id end end
function ClearCursor()
  if CURSOR and CURSOR.kind == "item" and CURSOR.from then
    local s = BAGS[CURSOR.from[1]][CURSOR.from[2]]
    if s then s.isLocked = false end
  end
  CURSOR = nil
end
function GetActionInfo(slot) local a = ACTIONS[slot] if a then return a.kind, a.id end end
C_ActionBar = {
  HasAction = function(slot) return ACTIONS[slot] ~= nil end,
  PutActionInSlot = function(slot)
    if COMBAT then error("blocked in combat") end
    if not CURSOR or CURSOR.kind ~= "spell" then return end
    local old = ACTIONS[slot]
    ACTIONS[slot] = { kind = "spell", id = CURSOR.id }
    CURSOR = old and { kind = old.kind, id = old.id } or nil
    PLACED = (PLACED or 0) + 1
  end,
}
function PickupAction(slot)
  if COMBAT then error("blocked in combat") end
  local a = ACTIONS[slot]
  if a then CURSOR = { kind = a.kind, id = a.id } ACTIONS[slot] = nil end
end

function MakeBar(name, page, shown)
  local bar = obj("Frame", nil, name)
  bar.shown = shown
  bar.actionButtons = {}
  local prefix = ({ MultiBar7 = "MULTIACTIONBAR7", MultiBar6 = "MULTIACTIONBAR6", MultiBar5 = "MULTIACTIONBAR5",
    MultiBarLeft = "MULTIACTIONBAR4", MultiBarRight = "MULTIACTIONBAR3", MultiBarBottomRight = "MULTIACTIONBAR2",
    MultiBarBottomLeft = "MULTIACTIONBAR1" })[name]
  for i = 1, 12 do
    local b = obj("CheckButton", nil, name .. "Button" .. i)
    b.action = (page - 1) * 12 + i
    b.commandName = prefix .. "BUTTON" .. i
    bar.actionButtons[i] = b
  end
  _G[name] = bar
  return bar
end
MULTIBAR_5_ACTIONBAR_PAGE, MULTIBAR_6_ACTIONBAR_PAGE, MULTIBAR_7_ACTIONBAR_PAGE = 13, 14, 15
RIGHT_ACTIONBAR_PAGE, LEFT_ACTIONBAR_PAGE, BOTTOMRIGHT_ACTIONBAR_PAGE, BOTTOMLEFT_ACTIONBAR_PAGE = 3, 4, 5, 6
MakeBar("MultiBar7", 15, false)
MakeBar("MultiBar6", 14, false)
MakeBar("MultiBar5", 13, false)
MakeBar("MultiBarLeft", 4, true)
MakeBar("MultiBarRight", 3, true)
MakeBar("MultiBarBottomRight", 5, true)
MakeBar("MultiBarBottomLeft", 6, true)

-- The binding functions the game's bar bindings run.
PRESSES = {}
function MultiActionButtonDown(bar, id) PRESSES[#PRESSES + 1] = "down " .. bar .. " " .. id end
function MultiActionButtonUp(bar, id) PRESSES[#PRESSES + 1] = "up " .. bar .. " " .. id end

-- Bindings
BINDINGS = {}
function SetOverrideBinding(owner, prio, key, command)
  if COMBAT then error("blocked in combat") end
  BINDINGS[key] = { command = command, owner = owner }
end
function ClearOverrideBindings(owner)
  if COMBAT then error("blocked in combat") end
  for k, b in pairs(BINDINGS) do if b.owner == owner then BINDINGS[k] = nil end end
end
function GetBindingAction(key) return BINDINGS[key] and BINDINGS[key].command or "" end
function GetBindingText(key) return key end
STATE_DRIVERS = {}
function RegisterStateDriver(frame, state, cond) STATE_DRIVERS[#STATE_DRIVERS + 1] = { frame = frame, state = state, cond = cond } end
-- What the secure snippet does when combat starts: the owner's bindings go.
function EnterCombatLockdown()
  COMBAT = true
  for _, d in ipairs(STATE_DRIVERS) do
    local snippet = d.frame.attributes["_onstate-" .. d.state]
    if snippet and snippet:find("ClearBindings", 1, true) and d.cond:find("[combat]", 1, true) then
      for k, b in pairs(BINDINGS) do if b.owner == d.frame then BINDINGS[k] = nil end end
    end
  end
end
function InCombatLockdown() return COMBAT == true end

-- Settings
CVARS = { ActionButtonUseKeyHeldSpell = "0", ActionButtonUseKeyDown = "1" }
LOCKED_CVARS = {}
C_CVar = {
  GetCVar = function(n) return CVARS[n] end,
  SetCVar = function(n, v) if LOCKED_CVARS[n] then error("secure cvar") end CVARS[n] = tostring(v) end,
}

-- Bags: BAGS[bag][slot] = { itemID, stackCount, isLocked }
BAGS = { [0] = {}, {}, {}, {}, {} }
BAG_SIZE = { [0] = 16, 16, 16, 16, 16 }
C_Container = {
  GetContainerNumSlots = function(bag) return BAG_SIZE[bag] or 0 end,
  GetContainerItemInfo = function(bag, slot)
    local s = BAGS[bag] and BAGS[bag][slot]
    if not s then return nil end
    return { itemID = s.itemID, stackCount = s.stackCount, isLocked = s.isLocked }
  end,
  GetContainerNumFreeSlots = function(bag)
    local used = 0
    for _ in pairs(BAGS[bag] or {}) do used = used + 1 end
    return (BAG_SIZE[bag] or 0) - used, 0
  end,
  PickupContainerItem = function(bag, slot)
    if COMBAT then error("blocked") end
    local s = BAGS[bag][slot]
    if not CURSOR then
      if s and not s.isLocked then
        CURSOR = { kind = "item", id = s.itemID, count = s.stackCount, from = { bag, slot } }
        s.isLocked = true
      end
    elseif CURSOR.kind == "item" and not s then
      local from = BAGS[CURSOR.from[1]][CURSOR.from[2]]
      if CURSOR.split then
        from.stackCount = from.stackCount - CURSOR.count
        from.isLocked = false
        BAGS[bag][slot] = { itemID = CURSOR.id, stackCount = CURSOR.count, isLocked = true }
        C_Timer.After(0.3, function() if BAGS[bag][slot] then BAGS[bag][slot].isLocked = false end end)
      else
        BAGS[CURSOR.from[1]][CURSOR.from[2]] = nil
        BAGS[bag][slot] = { itemID = CURSOR.id, stackCount = CURSOR.count }
      end
      CURSOR = nil
    end
  end,
  SplitContainerItem = function(bag, slot, n)
    local s = BAGS[bag][slot]
    if CURSOR or not s or s.isLocked or n >= s.stackCount then return end
    CURSOR = { kind = "item", id = s.itemID, count = n, from = { bag, slot }, split = true }
    s.isLocked = true
  end,
}
function AddItems(item, n)
  for bag = 0, 4 do
    for slot = 1, BAG_SIZE[bag] do
      local s = BAGS[bag][slot]
      if s and s.itemID == item and s.stackCount < 20 and n > 0 then
        local add = math.min(20 - s.stackCount, n) s.stackCount = s.stackCount + add n = n - add
      end
    end
  end
  for bag = 0, 4 do
    for slot = 1, BAG_SIZE[bag] do
      if n <= 0 then return end
      if not BAGS[bag][slot] then
        local add = math.min(20, n) BAGS[bag][slot] = { itemID = item, stackCount = add } n = n - add
      end
    end
  end
end
function ClearBags() BAGS = { [0] = {}, {}, {}, {}, {} } end

-- Trade
TRADE = {}
REFUSE_SPLIT_TO_TRADE = false
function ClickTradeButton(i)
  if not CURSOR or CURSOR.kind ~= "item" or TRADE[i] then return end
  if CURSOR.split and REFUSE_SPLIT_TO_TRADE then return end
  TRADE[i] = { itemID = CURSOR.id, count = CURSOR.count, from = CURSOR.from, split = CURSOR.split }
  CURSOR = nil
end
function GetTradePlayerItemInfo(i)
  local t = TRADE[i]
  if not t then return nil end
  return "item" .. t.itemID, "tex", t.count, 1, nil, false, false, t.itemID
end
INITIATED = {}
function InitiateTrade(unit) INITIATED[#INITIATED + 1] = unit end
function TradeComplete(message)
  for i, t in pairs(TRADE) do
    local s = BAGS[t.from[1]][t.from[2]]
    if s then
      s.isLocked = false
      s.stackCount = s.stackCount - t.count
      if s.stackCount <= 0 then BAGS[t.from[1]][t.from[2]] = nil end
    end
  end
  TRADE = {}
  fire("UI_INFO_MESSAGE", 0, message or ERR_TRADE_COMPLETE)
  fire("TRADE_CLOSED")
  fire("BAG_UPDATE_DELAYED")
end
function TradeCancel()
  for i, t in pairs(TRADE) do local s = BAGS[t.from[1]][t.from[2]] if s then s.isLocked = false end end
  TRADE = {}
  fire("TRADE_CLOSED")
end

-- The group
GROUP = {}
RAID = false
function MemberFor(unit) for _, m in ipairs(GROUP) do if m.unit == unit then return m end end end
function GetNumGroupMembers() if #GROUP == 0 then return 0 end return #GROUP + 1 end
function IsInRaid() return RAID end
function UnitExists(unit) return unit == "player" or MemberFor(unit) ~= nil end
function UnitIsUnit(a, b) return a == b end
function UnitGUID(unit)
  if unit == "player" then return "Player-70-00000001" end
  if unit == "NPC" then return TRADE_PARTNER end
  local m = MemberFor(unit) return m and m.guid
end
function UnitName(unit) if unit == "player" then return "Vatik" end local m = MemberFor(unit) return m and m.name end
function UnitLevel(unit) if unit == "player" then return PLAYER_LEVEL end local m = MemberFor(unit) return m and m.level end
function UnitIsConnected(unit) local m = MemberFor(unit) if m then return m.connected ~= false end return true end
function CheckInteractDistance(unit) local m = MemberFor(unit) return m and m.near ~= false end
function GetRaidRosterInfo(i) local m = GROUP[i] return m and m.name, 0, m and m.sub or 1 end

-- Macros: 120 general slots, then 30 for the character, as on this client.
Constants = { MacroConsts = { MAX_ACCOUNT_MACROS = 120, MAX_CHARACTER_MACROS = 30 } }
MACROS = {}
PICKED_MACRO = nil
local function MacroCount(perChar)
  local n = 0
  for index in pairs(MACROS) do if (index > 120) == perChar then n = n + 1 end end
  return n
end
function GetNumMacros() return MacroCount(false), MacroCount(true) end
function GetMacroIndexByName(name) for index, m in pairs(MACROS) do if m.name == name then return index end end return 0 end
function GetMacroBody(index) return MACROS[index] and MACROS[index].body end
function CreateMacro(name, icon, body, perChar)
  if COMBAT then error("blocked in combat") end
  local base = perChar and 120 or 0
  local limit = perChar and 30 or 120
  for i = base + 1, base + limit do
    if not MACROS[i] then MACROS[i] = { name = name, icon = icon, body = body } return i end
  end
  error("macro list full")
end
function EditMacro(index, name, icon, body)
  if COMBAT then error("blocked in combat") end
  local m = MACROS[index]
  if name then m.name = name end
  if icon then m.icon = icon end
  if body then m.body = body end
  m.edits = (m.edits or 0) + 1
  return index
end
function PickupMacro(index) PICKED_MACRO = index end

date = os.date
ERROR_HANDLER = function(msg) HANDLED = msg end
function geterrorhandler() return ERROR_HANDLER end
function seterrorhandler(fn) ERROR_HANDLER = fn end

-- The saved variables file, written the way the client writes it.
function DumpSV(name, value)
  local out = {}
  local function str(s) return '"' .. s:gsub('\\', '\\\\'):gsub('"', '\\"'):gsub("\n", "\\n") .. '"' end
  local function dump(v, indent)
    if type(v) == "table" then
      out[#out + 1] = "{\n"
      local n = #v
      for i = 1, n do out[#out + 1] = indent .. "\t" dump(v[i], indent .. "\t") out[#out + 1] = ", -- [" .. i .. "]\n" end
      for k, x in pairs(v) do
        if not (type(k) == "number" and k >= 1 and k <= n and k % 1 == 0) then
          out[#out + 1] = indent .. "\t[" .. (type(k) == "string" and str(k) or tostring(k)) .. "] = "
          dump(x, indent .. "\t")
          out[#out + 1] = ",\n"
        end
      end
      out[#out + 1] = indent .. "}"
    elseif type(v) == "string" then out[#out + 1] = str(v)
    else out[#out + 1] = tostring(v) end
  end
  out[#out + 1] = "\n" .. name .. " = "
  dump(value, "")
  out[#out + 1] = "\n"
  return table.concat(out)
end
`;

const common = String.raw`
PASS, FAIL = 0, 0
function check(label, cond, extra)
  if cond then PASS = PASS + 1 else FAIL = FAIL + 1 print("FAIL: " .. (SCENARIO and (SCENARIO .. ": ") or "") .. label .. (extra ~= nil and ("  [" .. tostring(extra) .. "]") or "")) end
end
function LoadConjurer()
  local ns = {}
  for _, file in ipairs(FILES) do
    local chunk, err = load(SOURCES[file], "@" .. file)
    if not chunk then error("SYNTAX " .. tostring(err)) end
    chunk("Conjurer", ns)
  end
  NS = ns
  return ns
end
function Login()
  local ns = LoadConjurer()
  fire("ADDON_LOADED", "Conjurer")
  fire("PLAYER_LOGIN")
  RunTimers(0)
  return ns
end
function ChatWith(text)
  local n = 0
  for _, line in ipairs(CHAT) do if line:find(text, 1, true) then n = n + 1 end end
  return n
end
function ErrorWith(text)
  for _, line in ipairs(ERRORS) do if line:find(text, 1, true) then return true end end
  return false
end
function KnowAll() for _, list in pairs({ NS and NS.WATER or {}, NS and NS.FOOD or {} }) do for _, e in ipairs(list) do KNOWN[e.spell] = true end end end
function Played(id) for _, p in ipairs(PLAYED) do if p == id then return true end end return false end
-- Whether a slider takes input, whichever template it came from.
function SliderOn(holder)
  if holder.sliderEnabled ~= nil then return holder.sliderEnabled end
  return holder.Slider.enabled
end
function Click(button, which) button.scripts.OnClick(button, which or "LeftButton") RunTimers(0) end

-- A hold: the bar button is pressed and the game casts whatever it holds, once per cast, until
-- the button is empty, the key is let go after max casts, or the binding is gone.
YIELD = 4
function Hold(key, max)
  local bind = BINDINGS[key]
  if not bind then return 0 end
  local bar, id = bind.command:match("^MULTIACTIONBAR(%d)BUTTON(%d+)$")
  local barName = ({ ["7"] = "MultiBar7", ["6"] = "MultiBar6", ["5"] = "MultiBar5", ["4"] = "MultiBarLeft",
    ["3"] = "MultiBarRight", ["2"] = "MultiBarBottomRight", ["1"] = "MultiBarBottomLeft" })[bar]
  id = tonumber(id)
  local slot = _G[barName].actionButtons[id].action
  MultiActionButtonDown(barName, id)
  local casts = 0
  for i = 1, max or 100 do
    local a = ACTIONS[slot]
    if not a or a.kind ~= "spell" or not BINDINGS[key] then break end
    local entry = NS.BY_SPELL[a.id]
    AddItems(entry.item, YIELD)
    fire("UNIT_SPELLCAST_SUCCEEDED", "player", "Cast-" .. i, a.id)
    fire("BAG_UPDATE_DELAYED")
    RunTimers(0)
    casts = casts + 1
  end
  MultiActionButtonUp(barName, id)
  return casts
end
`;

// ------------------------------------------------------------------
// The main suite
// ------------------------------------------------------------------
const driver = String.raw`
SCENARIO = "main"
local ns = Login()
KnowAll()
fire("SPELLS_CHANGED")
RunTimers(0)
local C, T, UI = ns.Conjure, ns.Trade, ns.UI

check("saved variables are made", type(ConjurerDB) == "table" and ns.db == ConjurerDB)
check("the first login plans your own stock at your best ranks", ConjurerDB.targets.water[7] == 40 and ConjurerDB.targets.food[7] == 20,
  tostring(ConjurerDB.targets.water[7]) .. "/" .. tostring(ConjurerDB.targets.food[7]))
check("and only once", ConjurerDB.seeded == true)
check("it knows this is a mage", ns.isMage == true)
check("the minimap button is up", ConjurerMinimapButton and ConjurerMinimapButton.shown)
check("the combat guard is a secure state driver", #STATE_DRIVERS == 1 and STATE_DRIVERS[1].cond == "[combat] on; off" and STATE_DRIVERS[1].frame.attributes["_onstate-conjurercombat"]:find("ClearBindings", 1, true) ~= nil)
check("presses on the bars are watched", ns.report["press watch"] == "hooked")
check("nothing was refused at load", #ns.refused == 0)

-- The data: every rank maps a spell to its item, ranks 1 to 7.
local ok = true
for _, list in ipairs({ ns.WATER, ns.FOOD }) do
  for i, e in ipairs(list) do if e.rank ~= i or not ns.BY_SPELL[e.spell] or ns.BY_ITEM[e.item] ~= e then ok = false end end
end
check("both rank lists run 1 to 7 and index both ways", ok and #ns.WATER == 7 and #ns.FOOD == 7)
check("the checked ids: rank 7 water is 10140 making 8079", ns.WATER[7].spell == 10140 and ns.WATER[7].item == 8079 and ns.WATER[7].level == 55)
check("rank 7 food is 28612 making the Cinnamon Roll 22895", ns.FOOD[7].spell == 28612 and ns.FOOD[7].item == 22895)

-- ---- The window ----------------------------------------------------
SlashCmdList.CONJURER("")
RunTimers(0)
local P = UI.parts
check("the slash command opens the window", ConjurerFrame and ConjurerFrame.shown)
check("it wears ButtonFrameTemplate", ConjurerFrame.template == "ButtonFrameTemplate", ConjurerFrame.template)
check("titled Conjurer", ConjurerFrame.TitleContainer.TitleText.text == "Conjurer")
check("the round portrait shows Conjure Water", ConjurerFrame.PortraitContainer.portrait.texture == "spellicon:10140")
check("Escape closes it", UISpecialFrames[1] == "ConjurerFrame")
check("the inset is lowered for the Ready bar", ConjurerFrame.Inset.points[1][5] == -88)
check("it opened with the spellbook's sound", Played(829))
check("six sections", #P.content.kids >= 12 and P.sections.macro ~= nil)
check("the headers use Blizzard's list header art", P.sections.water.header.Right and P.sections.water.header.Right.atlas == "Options_ListExpand_Right_Expanded")
check("Options starts closed", P.sections.options.body.shown == false and P.sections.options.header.Right.atlas == "Options_ListExpand_Right")
check("the others start open", P.sections.water.body.shown and P.sections.food.body.shown and P.sections.shares.body.shown and P.sections.group.body.shown)
check("the scroll frame is the MinimalScrollBar one", ns.report["scroll frame"] == "ScrollFrameTemplate with MinimalScrollBar")
check("sliders are Blizzard's stepper sliders", ns.report["slider template"] == "MinimalSliderWithSteppersTemplate")
check("the Ready glow is the spell alert flipbook", ns.report["ready glow"] == "spell alert flipbook")

local waterRows = P.rankRows.water
check("seven water rows, best rank first", #waterRows == 7 and waterRows[1].entry.rank == 7 and waterRows[7].entry.rank == 1)
check("names drop the word Conjured", waterRows[1].name.text == "Crystal Water", waterRows[1].name.text)
check("each row says the level needed", waterRows[1].level.text == "Level 55" and waterRows[7].level.text == "Level 1")
check("and how many you have", waterRows[1].have.text == "Have 0")
check("the slider shows the target", waterRows[1].slider.Slider.value == 40)
check("the Ready bar says what's next", P.readyTitle.text == "Ready" and P.readyDetail.text:find("Next: Crystal Water, 0 of 40", 1, true) ~= nil, P.readyDetail.text)
check("the key button shows the key", P.keyButton.text == "Key: F")

-- Moving a slider sets the target; syncing it back does not.
waterRows[1].slider.Slider:SetValue(60)
RunTimers(0)
check("a slider moved by hand sets the target", ns.db.targets.water[7] == 60)
waterRows[1].slider.Slider:SetValue(40)
RunTimers(0)
check("and back", ns.db.targets.water[7] == 40)
ns.db.targets.water[6] = 250
UI.Refresh()
check("a target past the slider's end widens the slider instead of clipping", waterRows[2].slider.Slider.maxV == 300 and waterRows[2].slider.Slider.value == 250)
ns.db.targets.water[6] = 420
UI.Refresh()
check("far past it, the slider grows to the next hundred", waterRows[2].slider.Slider.maxV == 500 and ns.db.targets.water[6] == 420)
ns.db.targets.water[6] = 0
UI.Refresh()
check("a cleared target stays cleared", ns.db.targets.water[6] == 0)

-- Collapsing
local heightOpen = P.content.h
Click(P.sections.water.header)
check("clicking a header closes the section", P.sections.water.body.shown == false and ns.db.collapsed.water == true)
check("its arrow turns", P.sections.water.header.Right.atlas == "Options_ListExpand_Right")
check("and it shows a one-line summary", P.sections.water.header.Summary.text == "1 rank, 0 of 40", P.sections.water.header.Summary.text)
check("the window's list gets shorter", P.content.h < heightOpen)
check("its header button hides while closed", P.sections.water.action.shown == false)
Click(P.sections.water.header)
check("clicking again opens it", P.sections.water.body.shown and P.sections.water.header.Summary.text == "" and P.content.h == heightOpen)
UI.CollapseAll(true)
check("everything can fold away", P.sections.food.body.shown == false and P.sections.group.body.shown == false)
UI.CollapseAll(false)
check("and open again", P.sections.options.body.shown and P.sections.shares.body.shown)
ns.db.collapsed.options = true
UI.Refresh()

-- ---- Ready and the hold ----------------------------------------------
Click(P.readyButton)
check("Ready lights up", C.armed == true)
check("the key is bound to the hidden Action Bar 8's last button", BINDINGS.F and BINDINGS.F.command == "MULTIACTIONBAR7BUTTON12")
check("that button holds Conjure Water rank 7", ACTIONS[180] and ACTIONS[180].id == 10140)
check("the cursor is left empty", CURSOR == nil)
check("hold to cast was turned on", CVARS.ActionButtonUseKeyHeldSpell == "1")
check("and what it was is remembered", ns.db.savedCVars and ns.db.savedCVars.ActionButtonUseKeyHeldSpell == "0" and ns.db.savedCVars.ActionButtonUseKeyDown == nil)
check("the glow is on and playing", P.readyGlow.shown and P.readyAnim.playing)
check("the title says what to hold", P.readyTitle.text == "Ready: hold F", P.readyTitle.text)
check("the minimap button lights too", ConjurerMinimapButton.lit.shown)
check("the slot is remembered for next time", ns.db.slot.bar == "MultiBar7" and ns.db.slot.index == 12)

local casts = Hold("F", 100)
check("one long hold conjures the water and then the food", casts == 15, casts)
check("exactly the water target", C_Item.GetItemCount(8079) == 40, C_Item.GetItemCount(8079))
check("exactly the food target", C_Item.GetItemCount(22895) == 20, C_Item.GetItemCount(22895))
check("the row change chimed", Played(878))
check("and said so on screen", ErrorWith("Crystal Water done. Next: Cinnamon Roll."))
check("finishing chimed", Played(7355) and ErrorWith("All conjured"))
check("Ready switched itself off", C.armed == false and ChatWith("Everything is conjured") == 1)
check("the binding is gone", BINDINGS.F == nil)
check("the borrowed button is empty again", ACTIONS[180] == nil)
check("hold to cast is back as it was", CVARS.ActionButtonUseKeyHeldSpell == "0" and ns.db.savedCVars == nil)
check("the glow is off", P.readyGlow.shown == false and not P.readyAnim.playing)
check("the report calls hold to cast working", C.hold.best >= 2 and C.hold.presses == 1 and C.hold.releases == 1)
local reportText = table.concat(ns.DebugReport(), "\n")
check("the debug report says so", reportText:find("hold to cast: works (15 casts in one hold)", 1, true) ~= nil)

-- Nothing left: Ready refuses and says why.
Click(P.readyButton)
check("with every target met Ready stays off", C.armed == false and ChatWith("Nothing to conjure") == 1)
check("the bar says so", P.readyTitle.text == "Nothing to conjure")

-- Short hold, let go early, hold again.
ns.db.targets.water[7] = 60
Click(P.readyButton)
casts = Hold("F", 2)
check("letting go stops the casting", casts == 2 and C.armed and C_Item.GetItemCount(8079) == 48)
casts = Hold("F", 100)
check("the next hold carries on to the target", C_Item.GetItemCount(8079) == 60 and not C.armed, C_Item.GetItemCount(8079))

-- Combat: Ready goes off before the lockdown.
ns.db.targets.water[7] = 80
Click(P.readyButton)
fire("PLAYER_REGEN_DISABLED")
RunTimers(0)
check("entering combat switches Ready off", C.armed == false and ChatWith("you entered combat") == 1)
check("and clears the binding and the button", BINDINGS.F == nil and ACTIONS[180] == nil and CVARS.ActionButtonUseKeyHeldSpell == "0")
-- The lockdown already on: the secure driver clears the key, the rest waits.
Click(P.readyButton)
EnterCombatLockdown()
check("even in a lockdown the state driver takes the key away", BINDINGS.F == nil)
fire("PLAYER_REGEN_DISABLED")
check("the button waits for the fight to end", C.armed == false and ACTIONS[180] ~= nil and C.pendingCleanup)
COMBAT = false
fire("PLAYER_REGEN_ENABLED")
check("and is emptied after it", ACTIONS[180] == nil and CVARS.ActionButtonUseKeyHeldSpell == "0" and not C.pendingCleanup)
COMBAT = true
Click(P.readyButton)
check("Ready can't be lit in combat", C.armed == false and ChatWith("You can't get Ready in combat") == 1)
COMBAT = false

-- The last button taken by the player: the one next to it.
ACTIONS[180] = { kind = "item", id = 6948 }
Click(P.readyButton)
check("a button of yours is never taken", ACTIONS[180].kind == "item" and BINDINGS.F.command == "MULTIACTIONBAR7BUTTON11" and ACTIONS[179].id == 10140)
Click(P.readyButton)
check("switching off empties only the borrowed one", ACTIONS[179] == nil and ACTIONS[180].kind == "item")
ACTIONS[180] = nil

-- Every hidden bar full: a shown bar is used, and it says so.
for slot = 145, 180 do ACTIONS[slot] = { kind = "macro", id = slot } end
ns.db.slot = nil
Click(P.readyButton)
check("with the hidden bars full a shown bar's button is borrowed", C.armed and C.where.bar == "MultiBarLeft" and ChatWith("every hidden bar was full") == 1)
Click(P.readyButton)
for slot = 1, 180 do ACTIONS[slot] = { kind = "macro", id = slot } end
ns.db.slot = nil
Click(P.readyButton)
check("with every button in use Ready stays off", C.armed == false and ChatWith("Every action bar button is in use") == 1)
ACTIONS = {}

-- Action Bar 8 turned on by the player: a bar they don't show still comes first.
MultiBar7.shown = true
ns.db.slot = nil
Click(P.readyButton)
check("a bar you show is passed over for one you don't", C.armed and C.where.bar == "MultiBar6" and ACTIONS[168] and ACTIONS[168].id == 10140,
  C.where and C.where.bar)
Click(P.readyButton)
MultiBar7.shown = false
ns.db.slot = { bar = "MultiBar7", index = 12 }
MultiBar7.shown = true
Click(P.readyButton)
check("even the button used last time, once its bar is shown", C.where.bar == "MultiBar6")
Click(P.readyButton)
MultiBar7.shown = false

-- The saved button comes first.
ns.db.slot = { bar = "MultiBar6", index = 3 }
Click(P.readyButton)
check("the button used last time is used again", BINDINGS.F.command == "MULTIACTIONBAR6BUTTON3" and ACTIONS[159].id == 10140)
Click(P.readyButton)

-- The cursor busy when a row finishes: the swap waits for it.
ns.db.targets.water[7] = C_Item.GetItemCount(8079) + 4
ns.db.targets.water[6] = 4
Click(P.readyButton)
CURSOR = { kind = "item", id = 4306 }
AddItems(8079, 4)
fire("BAG_UPDATE_DELAYED")
RunTimers(0)
check("the next spell waits while you hold something", ACTIONS[159].id == 10140 and C.armed)
CURSOR = nil
RunTimers(0.5)
check("and goes on when the cursor is free", ACTIONS[159].id == 10139)
Click(P.readyButton)
ns.db.targets.water[6] = 0

-- The settings locked by the client: Ready still works, one cast per press.
LOCKED_CVARS.ActionButtonUseKeyHeldSpell = true
ns.db.targets.water[7] = C_Item.GetItemCount(8079) + 8
Click(P.readyButton)
check("a locked setting doesn't stop Ready", C.armed and CVARS.ActionButtonUseKeyHeldSpell == "0")
check("it says to press once per cast", ChatWith("each press conjures once") == 1 and P.readyDetail.text:find("Press once per cast", 1, true) ~= nil)
check("and the report says the client refused", ns.report["setting ActionButtonUseKeyHeldSpell"] == "the client refused to change it")
Click(P.readyButton)
LOCKED_CVARS.ActionButtonUseKeyHeldSpell = nil
ns.db.manageCVars = false
Click(P.readyButton)
check("with the option off the settings are left alone", CVARS.ActionButtonUseKeyHeldSpell == "0" and ns.db.savedCVars == nil)
Click(P.readyButton)
ns.db.manageCVars = true

-- ---- The key ----------------------------------------------------------
Click(P.keyButton)
check("the key button listens", P.capture.shown and P.capture.keyboard and P.keyButton.text == "Press a key")
P.capture.scripts.OnKeyDown(P.capture, "LSHIFT")
check("a lone modifier is not a key", P.capture.shown)
SHIFT = true
IsShiftKeyDown = function() return SHIFT end
P.capture.scripts.OnKeyDown(P.capture, "G")
SHIFT = false
check("shift and G make SHIFT-G", ns.db.key == "SHIFT-G" and not P.capture.shown and P.keyButton.text == "Key: SHIFT-G")
Click(P.readyButton)
check("Ready binds the new key", BINDINGS["SHIFT-G"] ~= nil and BINDINGS.F == nil)
Click(P.keyButton)
P.keyButton.scripts.OnClick(P.keyButton, "Button4")
check("a side mouse button can be the key", ns.db.key == "BUTTON4" and BINDINGS.BUTTON4 ~= nil and BINDINGS["SHIFT-G"] == nil)
Click(P.readyButton)
Click(P.keyButton)
P.capture.scripts.OnKeyDown(P.capture, "ESCAPE")
check("Escape keeps the old key", ns.db.key == "BUTTON4" and not P.capture.shown)
ns.db.key = "F"

-- ---- The group and trading ----------------------------------------------
ClearBags()
AddItems(8079, 60)
AddItems(22895, 40)
GROUP = {
  { unit = "party1", guid = "Player-70-E1", name = "Elyse", level = 58, class = "PRIEST" },
  { unit = "party2", guid = "Player-70-T2", name = "Tovrik", level = 48, class = "HUNTER" },
  { unit = "party3", guid = "Player-70-B3", name = "Brannoc", level = 60, class = "WARRIOR" },
  { unit = "party4", guid = "Player-70-M4", name = "Maelis", level = 60, class = "WARLOCK", near = false },
}
fire("GROUP_ROSTER_UPDATE")
RunTimers(0)
local members = T.Members()
check("the party is read", #members == 4 and members[1].name == "Elyse")
local s1 = { T.Status(members[1]) }
check("the priest's share is ready", s1[1] == "Ready" and s1[3] == "Trade")
check("her share is her class's, at rank 7", T.ShareText(members[1]) == "40 Crystal Water, 20 Cinnamon Roll", T.ShareText(members[1]))
check("the level 48 hunter gets rank 6", T.ShareText(members[2]) == "20 Sparkling Water, 20 Sweet Roll", T.ShareText(members[2]))
check("and is short of it", ({ T.Status(members[2]) })[1] == "Short 20 Sparkling Water")
check("the warlock out of range says so", ({ T.Status(members[4]) })[1] == "Out of range")
check("the group rows show it", P.memberRows[2].status.text == "Short 20 Sparkling Water" and P.memberRows[1].button.text == "Trade")
check("the empty-group line hides", P.groupEmpty.shown == false)

T.FillTargets(true)
check("filling from the group adds you and each share at its rank", ns.db.targets.water[7] == 120 and ns.db.targets.water[6] == 20
  and ns.db.targets.food[7] == 80 and ns.db.targets.food[6] == 20,
  ns.db.targets.water[7] .. " " .. tostring(ns.db.targets.water[6]) .. " " .. ns.db.targets.food[7] .. " " .. tostring(ns.db.targets.food[6]))
check("and says what it set", ChatWith("Targets set from your group: 120 Crystal Water, 20 Sparkling Water, 80 Cinnamon Roll, 20 Sweet Roll.") == 1)
check("ranks you left untouched are cleared", ns.db.targets.water[5] == 0)
ns.db.bestRank = false
check("with best rank off everyone gets your best", T.ShareText(members[2]) == "20 Crystal Water, 20 Cinnamon Roll")
ns.db.bestRank = true

-- The priest opens a trade: her share goes in by itself.
TRADE_PARTNER = "Player-70-E1"
fire("TRADE_SHOW")
RunTimers(5)
check("the trade window gets two water stacks and one food", TRADE[1] and TRADE[2] and TRADE[3] and not TRADE[4]
  and TRADE[1].itemID == 8079 and TRADE[1].count == 20 and TRADE[2].itemID == 8079 and TRADE[3].itemID == 22895 and TRADE[3].count == 20)
check("the cursor is left empty", CURSOR == nil)
check("her row now fills rather than trades", P.memberRows[1].button.text == "Fill")
fire("TRADE_ACCEPT_UPDATE", 1, 0)
TradeComplete()
RunTimers(2)
check("when it completes her share is counted", ns.db.handed["Player-70-E1"] and ns.db.handed["Player-70-E1"].water == 40 and ns.db.handed["Player-70-E1"].food == 20)
check("and said", ChatWith("Handed Elyse 20 Cinnamon Roll and 40 Crystal Water.") == 1)
check("she shows as handed out", ({ T.Status(members[1]) })[1] == "Handed out" and P.memberRows[1].button.text == "Again")
check("the bags lost exactly that", C_Item.GetItemCount(8079) == 20 and C_Item.GetItemCount(22895) == 20)

-- A cancelled trade gives nothing.
TRADE_PARTNER = "Player-70-B3"
fire("TRADE_SHOW")
RunTimers(5)
check("the warrior's food goes in", TRADE[1] and TRADE[1].itemID == 22895 and TRADE[1].count == 20)
TradeCancel()
RunTimers(2)
check("cancelled, nothing is counted", ns.db.handed["Player-70-B3"] == nil and C_Item.GetItemCount(22895) == 20)

-- A share that is not whole stacks is split in the bags first.
ns.Share("WARRIOR").food = 15
fire("TRADE_SHOW")
RunTimers(5)
check("15 of a stack of 20 reach the window", TRADE[1] and TRADE[1].itemID == 22895 and TRADE[1].count == 15 and not TRADE[2])
fire("TRADE_ACCEPT_UPDATE", 1, 0)
TradeComplete()
RunTimers(2)
check("and 5 stay behind", C_Item.GetItemCount(22895) == 5 and ns.db.handed["Player-70-B3"].food == 15)

-- No empty bag slot: the split goes straight to the window.
ns.Share("WARRIOR").food = 30
ClearBags()
for bag = 0, 4 do for slot = 1, 16 do BAGS[bag][slot] = { itemID = 4306, stackCount = 1 } end end
BAGS[0][1] = { itemID = 22895, stackCount = 20 }
fire("TRADE_SHOW")
RunTimers(5)
check("with full bags the split goes straight in", TRADE[1] and TRADE[1].count == 15, TRADE[1] and TRADE[1].count)
TradeCancel()

-- The client refusing that: nothing is left on the cursor.
REFUSE_SPLIT_TO_TRADE = true
fire("TRADE_SHOW")
RunTimers(5)
check("a refused split leaves nothing on the cursor", CURSOR == nil and TRADE[1] == nil and T.lastFill:find("refused 1", 1, true) ~= nil, T.lastFill)
REFUSE_SPLIT_TO_TRADE = false
TradeCancel()

-- No "trade complete" text recognised: the bags decide.
ClearBags()
AddItems(22895, 40)
ns.db.handed["Player-70-B3"] = nil
ns.Share("WARRIOR").food = 20
fire("TRADE_SHOW")
RunTimers(5)
fire("TRADE_ACCEPT_UPDATE", 1, 0)
TradeComplete("Handel abgeschlossen.")
RunTimers(2)
check("without the message the bags still show the trade happened", ns.db.handed["Player-70-B3"] and ns.db.handed["Player-70-B3"].food == 20)

-- Auto fill off: nothing moves until asked.
ns.db.autoFill = false
TRADE_PARTNER = "Player-70-T2"
AddItems(8078, 20)
AddItems(8076, 20)
fire("TRADE_SHOW")
RunTimers(5)
check("with auto fill off an opened trade is left alone", TRADE[1] == nil)
TradeCancel()
-- The row's button asks for the trade and fills it.
Click(P.memberRows[2].button)
check("the Trade button asks for a trade", INITIATED[#INITIATED] == "party2")
fire("TRADE_SHOW")
RunTimers(5)
check("and fills it when it opens", TRADE[1] and TRADE[1].itemID == 8078 and TRADE[2] and TRADE[2].itemID == 8076)
TradeCancel()
ns.db.autoFill = true

-- Someone outside the group.
TRADE_PARTNER = "Player-70-STRANGER"
fire("TRADE_SHOW")
RunTimers(5)
check("a stranger's trade is not filled", TRADE[1] == nil)
fire("TRADE_ACCEPT_UPDATE", 1, 0)
TradeComplete()
RunTimers(2)
check("or counted", ns.db.handed["Player-70-STRANGER"] == nil)

-- Again gives a whole share once more.
TRADE_PARTNER = "Player-70-E1"
ClearBags()
AddItems(8079, 40)
AddItems(22895, 20)
UI.Refresh()
Click(P.memberRows[1].button)
fire("TRADE_SHOW")
RunTimers(5)
check("Again fills her whole share again", TRADE[1] and TRADE[2] and TRADE[3] and TRADE[3].itemID == 22895)
TradeCancel()

-- Reset and leaving the group.
Click(P.sections.group.action)
check("Reset handed out forgets", next(ns.db.handed) == nil)
ns.db.handed.x = { water = 1 }
fire("GROUP_LEFT")
check("leaving the group forgets", next(ns.db.handed) == nil)
GROUP = {}
UI.Refresh()
check("alone, the group section says so", P.groupEmpty.shown and P.memberRows[1].shown == false)

-- A raid, and "Include the whole raid" off.
RAID = true
GROUP = {
  { unit = "raid1", guid = "R1", name = "A", level = 60, class = "PRIEST", sub = 1 },
  { unit = "raid2", guid = "R2", name = "B", level = 60, class = "PRIEST", sub = 2 },
}
check("in a raid everyone counts", #T.Members() == 2)
ns.db.includeRaid = false
UnitIsUnit = function(a, b) return (a == "raid1" and b == "player") or a == b end
check("off, only your own group of five", #T.Members() == 0)
ns.db.includeRaid = true
RAID = false
GROUP = {}
UnitIsUnit = function(a, b) return a == b end

-- ---- Odds and ends ------------------------------------------------------
ns.db.targets.water[7] = C_Item.GetItemCount(8079) + 20
ConjurerMinimapButton.scripts.OnClick(ConjurerMinimapButton, "RightButton")
check("right-clicking the minimap button lights Ready", C.armed)
ConjurerMinimapButton.scripts.OnClick(ConjurerMinimapButton, "RightButton")
check("and puts it out", not C.armed)
ConjurerMinimapButton.scripts.OnClick(ConjurerMinimapButton, "LeftButton")
check("left click closes the window", ConjurerFrame.shown == false)
SlashCmdList.CONJURER("ready")
check("/conjure ready works too", C.armed)
SlashCmdList.CONJURER("ready")
SlashCmdList.CONJURER("debug")
check("/conjure debug prints the report", ChatWith("Conjurer 1.0.0 debug report") == 1 and ChatWith("refused actions: none") == 1)
check("the report names the borrowed button", ChatWith("button to borrow: Action Bar") == 1)
check("nothing was refused in the whole run", #ns.refused == 0)
fire("ADDON_ACTION_FORBIDDEN", "Conjurer", "UNKNOWN()")
check("a refused action is logged with its stage", #ns.refused == 1 and ns.refused[1].stage ~= nil)
fire("ADDON_ACTION_FORBIDDEN", "SomeOtherAddon", "UNKNOWN()")
check("another addon's is not", #ns.refused == 1)

-- ---- The eat and drink macro ----------------------------------------------
local Mac = ns.Macro
ClearBags()
AddItems(22895, 20)
AddItems(8079, 20)
UI.Show()
RunTimers(0)
check("no macro is made until asked", Mac.Index() == 0 and next(MACROS) == nil)
check("the section says what one press would do", P.macroText.text == "One press eats Cinnamon Roll and drinks Crystal Water.", P.macroText.text)
check("and that it isn't made", P.macroStatus.text:find("Not made yet", 1, true) ~= nil and P.macroMake.text == "Make macro")
check("its icon is the food", P.macroButton.icon.texture == "itemicon:22895")
Click(P.macroMake)
local mi = Mac.Index()
check("Make macro writes it", mi > 0 and MACROS[mi].name == "Conjurer Eat")
check("with the character's macros", mi > 120)
check("eating and drinking the best ranks by item id", MACROS[mi].body == "#showtooltip\n/use item:22895\n/use item:8079", MACROS[mi].body)
check("the question mark icon, so the item shows", MACROS[mi].icon == 134400)
check("from now on it is kept up to date", ns.db.macro.auto == true and ns.db.macro.made == true)
check("the button now says Update", P.macroMake.text == "Update macro" and P.macroStatus.text:find("a character macro", 1, true) ~= nil)
ClearBags()
AddItems(22895, 20)
AddItems(8078, 20)
fire("BAG_UPDATE_DELAYED")
RunTimers(0)
check("out of Crystal Water it drinks Sparkling Water", MACROS[mi].body == "#showtooltip\n/use item:22895\n/use item:8078")
local edits = MACROS[mi].edits
fire("BAG_UPDATE_DELAYED")
check("an unchanged body is not written again", MACROS[mi].edits == edits)
COMBAT = true
AddItems(8079, 20)
fire("BAG_UPDATE_DELAYED")
check("in combat the macro is left alone", MACROS[mi].body:find("8078", 1, true) ~= nil and Mac.pending)
COMBAT = false
fire("PLAYER_REGEN_ENABLED")
check("and updated when the fight ends", MACROS[mi].body:find("8079", 1, true) ~= nil and not Mac.pending)
PLAYER_LEVEL = 50
fire("BAG_UPDATE_DELAYED")
check("too low for Crystal Water, a level 50 drinks Sparkling Water", MACROS[mi].body:find("8078", 1, true) ~= nil)
PLAYER_LEVEL = 60
fire("BAG_UPDATE_DELAYED")
PICKED_MACRO = nil
P.macroButton.scripts.OnDragStart(P.macroButton)
check("dragging the icon picks the macro up", PICKED_MACRO == mi)
MACROS[mi] = nil
fire("BAG_UPDATE_DELAYED")
check("deleted by you, it stays deleted", Mac.Index() == 0 and ns.db.macro.auto == false and ChatWith("was deleted, so Conjurer stopped keeping it") == 1)
for i = 121, 150 do MACROS[i] = { name = "m" .. i, body = "" } end
P.macroButton.scripts.OnDragStart(P.macroButton)
mi = Mac.Index()
check("with the character list full it goes with the general macros", mi > 0 and mi <= 120 and PICKED_MACRO == mi)
for i = 1, 120 do if not MACROS[i] then MACROS[i] = { name = "g" .. i, body = "" } end end
MACROS[mi] = { name = "someone else's", body = "" }
Mac.Write(true)
check("with both lists full it says so", Mac.Index() == 0 and ChatWith("Your macro lists are full") == 1)
MACROS = {}

-- ---- The log -----------------------------------------------------------
local L = ConjurerLog
local all = table.concat(L.entries, "\n")
check("the log is an account-wide saved variable", type(L) == "table" and type(L.entries) == "table" and L.session == 1)
check("lines carry the session and the time", L.entries[1]:match("^#1 %d%d:%d%d:%d%d ") ~= nil, L.entries[1])
check("it starts with the session", all:find("session start: Conjurer 1.0.0, client 1.60.1.70009, Vatik MAGE 60", 1, true) ~= nil)
check("it has the window's templates", all:find("window built: window template ButtonFrameTemplate", 1, true) ~= nil)
check("it has Ready being lit", all:find("Ready is lit; hold to cast on", 1, true) ~= nil)
check("it has the binding", all:find("bind F -> MULTIACTIONBAR7BUTTON12", 1, true) ~= nil)
check("it has every cast", all:find("cast Conjured Crystal Water (key held)", 1, true) ~= nil)
check("it has the row changing mid-hold", all:find("row done: Conjured Crystal Water 40/40; next Conjured Cinnamon Roll (key still held)", 1, true) ~= nil)
check("it has the hold's length", all:find("key up after 15 conjures in this hold", 1, true) ~= nil)
check("it has Ready going off and why", all:find("Ready off: Everything is conjured. Ready is off.", 1, true) ~= nil)
check("it has the settings changing and going back", all:find("setting ActionButtonUseKeyHeldSpell: turned on by Conjurer (was 0)", 1, true) ~= nil
  and all:find("setting ActionButtonUseKeyHeldSpell put back to 0", 1, true) ~= nil)
check("it has the trades", all:find("trade opened with Elyse (PRIEST 58); filling", 1, true) ~= nil
  and all:find("handed Elyse: 20 Cinnamon Roll, 40 Crystal Water", 1, true) ~= nil)
check("it has each step of a fill", all:find("into trade slot 1", 1, true) ~= nil)
check("it has the refusals", all:find("Ready refused: Nothing to conjure", 1, true) ~= nil)
check("it has the macro", all:find("macro made (character): #showtooltip | /use item:22895 | /use item:8079", 1, true) ~= nil)
check("a debug report is kept in it", type(L.report) == "table" and #L.report > 5 and type(L.reportAt) == "string")
SlashCmdList.CONJURER("note the hold stopped here")
check("/conjure note marks the log", ConjurerLog.entries[#ConjurerLog.entries]:find("/conjure note the hold stopped here", 1, true) ~= nil
  and ChatWith("/reload writes the log to disk") == 1)
local realRequest = ns.Trade.Request
ns.Trade.Request = function() error("boom") end
GROUP = { { unit = "party1", guid = "Player-70-E1", name = "Elyse", level = 58, class = "PRIEST" } }
UI.Refresh()
Click(P.memberRows[1].button)
check("an error in a button is caught and logged", ConjurerLog.entries[#ConjurerLog.entries]:find("ERROR in group Trade button", 1, true) ~= nil
  and ChatWith("Something went wrong (group Trade button)") == 1)
ns.Trade.Request = realRequest
GROUP = {}
ERROR_HANDLER('Interface/AddOns/Conjurer/UI.lua:10: attempt to index nil')
check("Lua errors from Conjurer's files reach the log", ConjurerLog.entries[#ConjurerLog.entries]:find("LUA ERROR: Interface/AddOns/Conjurer/UI.lua:10", 1, true) ~= nil
  and HANDLED ~= nil)
HANDLED = nil
ERROR_HANDLER("SomeOtherAddon.lua:3: oops")
check("other addons' errors are passed on and not logged", HANDLED == "SomeOtherAddon.lua:3: oops"
  and not ConjurerLog.entries[#ConjurerLog.entries]:find("oops", 1, true))
for i = 1, 900 do ns.Log("filler " .. i) end
check("the log keeps its last 800 lines", #ConjurerLog.entries == 800 and ConjurerLog.entries[800]:find("filler 900", 1, true) ~= nil)
SV_TEXT = DumpSV("ConjurerLog", ConjurerLog)

-- A reload while Ready was lit: the next login puts the settings back.
if C.armed then C.Disarm() end
ns.db.targets.water[7] = C_Item.GetItemCount(8079) + 20
Click(P.readyButton)
check("lit before the reload", C.armed and CVARS.ActionButtonUseKeyHeldSpell == "1")
SAVED = ConjurerDB
`;

// ------------------------------------------------------------------
// Scenarios, each in a fresh Lua state
// ------------------------------------------------------------------
const scenarios = [
  { label: 'reload while lit', code: String.raw`
    ConjurerDB = { savedCVars = { ActionButtonUseKeyHeldSpell = "0" }, seeded = true }
    ConjurerLog = { session = 3, entries = { "#3 12:00:00 session end (logout or reload)" } }
    CVARS.ActionButtonUseKeyHeldSpell = "1"
    local ns = LoadConjurer()
    fire("ADDON_LOADED", "Conjurer") fire("PLAYER_LOGIN") RunTimers(0)
    check("the setting left on by a reload is put back at login", CVARS.ActionButtonUseKeyHeldSpell == "0" and ns.db.savedCVars == nil)
    check("the planned targets are kept", ns.db.seeded == true)
    check("the log carries on in a new session", ConjurerLog.session == 4 and ConjurerLog.entries[1]:find("#3 ", 1, true) == 1
      and table.concat(ConjurerLog.entries, "\n"):find("#4 %d%d:%d%d:%d%d session start") ~= nil)
    check("the put-back is logged", table.concat(ConjurerLog.entries, "\n"):find("setting ActionButtonUseKeyHeldSpell put back to 0", 1, true) ~= nil)
    RunTimers(6)
    check("a report is taken a few seconds after login", ConjurerLog.reportAt and ConjurerLog.reportAt:find("(login)", 1, true) ~= nil)
  ` },
  { label: 'not a mage', code: String.raw`
    PLAYER_CLASS = "WARLOCK"
    local ns = Login()
    check("no minimap button on a warlock", ConjurerMinimapButton == nil)
    SlashCmdList.CONJURER("")
    check("the slash command says it's for mages", ChatWith("Conjurer is for mages") == 1 and ConjurerFrame == nil)
    ns.Conjure.Arm()
    check("Ready refuses", ns.Conjure.armed == false and ChatWith("Conjurer is for mages") == 2)
    check("no targets are planned", ns.db.seeded == nil)
  ` },
  { label: 'a young mage', code: String.raw`
    PLAYER_LEVEL = 24
    local ns = LoadConjurer()
    for _, e in ipairs({ ns.WATER[1], ns.WATER[2], ns.WATER[3], ns.FOOD[1], ns.FOOD[2], ns.FOOD[3] }) do KNOWN[e.spell] = true end
    fire("ADDON_LOADED", "Conjurer") fire("PLAYER_LOGIN") RunTimers(0)
    check("a young mage's stock is planned at the ranks it knows", ns.db.targets.water[3] == 40 and ns.db.targets.food[3] == 20
      and (ns.db.targets.water[7] or 0) == 0)
    ns.UI.Toggle() RunTimers(0)
    local row = ns.UI.parts.rankRows.water[1]
    check("ranks not learned are marked and greyed", row.name.text == "Crystal Water  (not learned)" and row.icon.desaturated == true
      and SliderOn(row.slider) == false)
    check("known ones are live", SliderOn(ns.UI.parts.rankRows.water[5].slider) == true)
    ns.db.targets.water[7] = 40
    check("a target on a rank not learned is skipped", ns.Conjure.CurrentRow() == ns.WATER[3])
    GROUP = { { unit = "party1", guid = "G1", name = "Low", level = 12, class = "PRIEST" } }
    check("a level 12 gets rank 2", ns.Trade.ShareText(ns.Trade.Members()[1]) == "40 Fresh Water, 20 Bread")
  ` },
  { label: 'a mage before any conjure spell', code: String.raw`
    PLAYER_LEVEL = 2
    local ns = Login()
    check("nothing is planned yet", ns.db.seeded == nil)
    KNOWN[5504] = true
    fire("SPELLS_CHANGED")
    check("learning Conjure Water plans it", ns.db.seeded == true and ns.db.targets.water[1] == 40)
  ` },
  { label: 'no FlipBook', code: String.raw`
    BAD_FLIPBOOK = true
    local ns = Login()
    ns.UI.Toggle() RunTimers(0)
    check("without flipbooks the glow pulses", ns.report["ready glow"] == "pulse")
  ` },
];

// ------------------------------------------------------------------
// Running it
// ------------------------------------------------------------------
const sources = {};
for (const f of files) sources[f] = fs.readFileSync(DIR + f, 'utf8');

function run(L, code, name) {
  if (lauxlib.luaL_loadbuffer(L, to_luastring(code), null, to_luastring(name)) !== 0 || lua.lua_pcall(L, 0, 0, 0) !== 0) {
    console.log('LUA ERROR in ' + name + ': ' + lua.lua_tojsstring(L, -1)); process.exit(1);
  }
}
function number(L, name) {
  lua.lua_getglobal(L, to_luastring(name));
  const n = lua.lua_tonumber(L, -1);
  lua.lua_pop(L, 1);
  return n || 0;
}

const bareTemplates = ['ButtonFrameTemplate', 'PortraitFrameTemplate', 'BackdropTemplate', 'UIPanelButtonTemplate',
  'UIPanelCloseButton', 'UICheckButtonTemplate', 'ChatConfigCheckButtonTemplate', 'MinimalSliderWithSteppersTemplate',
  'MinimalSliderTemplate', 'UISliderTemplate', 'OptionsSliderTemplate', 'ConjurerScrollFrameTemplate',
  'UIPanelScrollFrameTemplate', 'InsetFrameTemplate', 'SecureHandlerStateTemplate'];
const BARE = process.argv.includes('--bare');
const pre = (BARE ? 'BARE=true\nBAD_ATLAS=true\nBAD_TEMPLATES={' + bareTemplates.map(t => t + '=true').join(',') + '}\n' : '')
  + (process.argv.includes('--verbose') ? 'VERBOSE=true\n' : '');

function newState(label) {
  const L = lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  lua.lua_newtable(L);
  for (const f of files) { lua.lua_pushstring(L, to_luastring(sources[f])); lua.lua_setfield(L, -2, to_luastring(f)); }
  lua.lua_setglobal(L, to_luastring('SOURCES'));
  lua.lua_newtable(L); files.forEach((f, i) => { lua.lua_pushstring(L, to_luastring(f)); lua.lua_rawseti(L, -2, i + 1); });
  lua.lua_setglobal(L, to_luastring('FILES'));
  if (label) { lua.lua_pushstring(L, to_luastring(label)); lua.lua_setglobal(L, to_luastring('SCENARIO')); }
  run(L, pre + stub, 'stub');
  run(L, common, 'common');
  return L;
}

let pass = 0, fail = 0;
const parts = [];

// In bare mode the template-specific checks are swapped for ones about the stand-ins.
const bareDriver = driver
  .replace(/check\("it wears ButtonFrameTemplate"[^\n]*\n/, 'check("it falls back to a plain window", ConjurerFrame.template ~= "ButtonFrameTemplate" and ns.report["window template"] == "plain")\n')
  .replace(/check\("titled Conjurer"[^\n]*\n/, '')
  .replace(/check\("the round portrait shows Conjure Water"[^\n]*\n/, '')
  .replace(/check\("the inset is lowered for the Ready bar"[^\n]*\n/, '')
  .replace(/check\("the headers use Blizzard's list header art"[^\n]*\n/, 'check("the headers fall back to plain bars with a sign", P.sections.water.header.Sign and P.sections.water.header.Sign.text == "-")\n')
  .replace(/check\("Options starts closed"[^\n]*\n/, 'check("Options starts closed", P.sections.options.body.shown == false and P.sections.options.header.Sign.text == "+")\n')
  .replace(/check\("the scroll frame is the MinimalScrollBar one"[^\n]*\n/, 'check("the scroll frame falls back", ns.report["scroll frame"] == "plain, mouse wheel only")\n')
  .replace(/check\("sliders are Blizzard's stepper sliders"[^\n]*\n/, 'check("the sliders fall back to plain ones", ns.report["slider template"] == "plain")\n')
  .replace(/check\("the Ready glow is the spell alert flipbook"[^\n]*\n/, 'check("the Ready glow falls back to a pulse", ns.report["ready glow"] == "pulse")\n')
  .replace(/check\("its arrow turns"[^\n]*\n/, 'check("its sign turns", P.sections.water.header.Sign.text == "+")\n')
  .replace(/check\("it has the window's templates"[^\n]*\n/, 'check("it has the window\'s stand-ins", all:find("window built: window template plain; slider template plain", 1, true) ~= nil)\n')
  .replace(/check\("the combat guard is a secure state driver"[^\n]*\n/, 'check("without the secure template there is no state driver, and the report says so", #STATE_DRIVERS == 0 and ns.report["combat guard"]:find("none", 1, true) ~= nil)\n')
  .replace(/check\("even in a lockdown the state driver takes the key away"[^\n]*\n/, 'BINDINGS.F = nil\n')
  .replace(/check\("the slider shows the target"[^\n]*\n/, 'check("the slider shows the target", waterRows[1].slider.Slider.value == 40 and waterRows[1].slider.valueText.text == "40")\n')
  .replace(/check\("the key button shows the key", P\.keyButton\.text == "Key: F"\)/, 'check("the key button shows the key", P.keyButton.text == "Key: F")');

let svText = null;
{
  const L = newState(null);
  run(L, BARE ? bareDriver : driver, 'driver');
  const p = number(L, 'PASS'), f = number(L, 'FAIL');
  pass += p; fail += f; parts.push('main ' + p);
  lua.lua_getglobal(L, to_luastring('SV_TEXT'));
  svText = lua.lua_isstring(L, -1) ? lua.lua_tojsstring(L, -1) : null;
  lua.lua_pop(L, 1);
}

// The log reader, on the file the run above would have left on disk.
{
  let p = 0, f = 0;
  const check = (label, cond, extra) => { if (cond) p++; else { f++; console.log('FAIL: reader: ' + label + (extra !== undefined ? '  [' + extra + ']' : '')); } };
  const { parseSavedVariables } = require(DIR + 'tools/conjurer-log.js');
  const os = require('os');
  check('the run left a log to write', typeof svText === 'string' && svText.length > 1000);
  const tmp = path.join(os.tmpdir(), 'conjurer-sv-test-' + process.pid + '.lua');
  fs.writeFileSync(tmp, svText || '');
  const data = parseSavedVariables(svText || '');
  const log = data.ConjurerLog || {};
  check('the reader parses it', Array.isArray(log.entries) && log.entries.length === 800, log.entries && log.entries.length);
  check('with the session number', log.session === 1);
  check('and the report', Array.isArray(log.report) && /^Conjurer 1\.0\.0 debug report/.test(log.report[0]));
  const { execFileSync } = require('child_process');
  const out = execFileSync(process.execPath, [DIR + 'tools/conjurer-log.js', '--file', tmp, '--last', '5'], { encoding: 'utf8' });
  check('the command prints the file and the lines', out.includes('Conjurer log: ' + tmp) && out.includes('filler 900') && out.includes('--- debug report'));
  const json = JSON.parse(execFileSync(process.execPath, [DIR + 'tools/conjurer-log.js', '--file', tmp, '--json'], { encoding: 'utf8' }));
  check('and JSON when asked', json.log && json.log.session === 1);
  // Strings the client escapes come back whole.
  const tricky = parseSavedVariables('X = {\n\t"a \\"quoted\\" line\\nand a second", -- [1]\n\t["k"] = 12.5,\n\t[3] = false,\n}\nY = nil\n');
  check('escapes, numbers, booleans and nil read right', tricky.X[1] === 'a "quoted" line\nand a second' && tricky.X.k === 12.5
    && tricky.X[3] === false && tricky.Y === null);
  fs.unlinkSync(tmp);
  pass += p; fail += f; parts.push('reader ' + p);
}
{
  let p = 0, f = 0;
  for (const s of scenarios) {
    const L = newState(s.label);
    run(L, s.code, s.label);
    p += number(L, 'PASS'); f += number(L, 'FAIL');
  }
  pass += p; fail += f; parts.push('scenarios ' + p);
}

// ------------------------------------------------------------------
// The package files
// ------------------------------------------------------------------
{
  let p = 0, f = 0;
  const check = (label, cond, extra) => { if (cond) p++; else { f++; console.log('FAIL: files: ' + label + (extra !== undefined ? '  [' + extra + ']' : '')); } };
  const read = rel => { try { return fs.readFileSync(DIR + rel, 'utf8'); } catch (e) { return null; } };
  const toc = read('Conjurer.toc') || '';
  const field = (text, name) => { const m = new RegExp('^## ' + name + ': *(.*)$', 'm').exec(text || ''); return m ? m[1].trim() : null; };
  check('the TOC is for this client', field(toc, 'Interface') === '16001');
  check('titled Conjurer', field(toc, 'Title') === 'Conjurer');
  check('version 1.0.0', field(toc, 'Version') === '1.0.0');
  check('the version matches the code', /ns\.version = "1\.0\.0"/.test(sources['Core.lua']));
  check('per-character saved variables', field(toc, 'SavedVariablesPerCharacter') === 'ConjurerDB');
  const listed = toc.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#')).map(l => l.trim());
  check('the TOC lists the XML and every Lua file in order', listed.join(',') === ['Conjurer.xml'].concat(files).join(','), listed.join(','));
  check('every listed file exists', listed.every(l => read(l) !== null));
  const pkg = read('.pkgmeta') || '';
  check('the package is Conjurer', /^package-as: Conjurer\s*$/m.test(pkg));
  check('the tests stay out of the package', /^ignore:\s*\r?\n(\s+- .*\r?\n)*\s+- tests\s*$/m.test(pkg));
  check('the changelog is the release notes, as markdown', /manual-changelog:\s*\r?\n\s+filename: RELEASE-NOTES\.md\s*\r?\n\s+markup-type: markdown/m.test(pkg));
  const changelog = (read('CHANGELOG.md') || '').replace(/\r\n/g, '\n');
  const notes = (read('RELEASE-NOTES.md') || '').replace(/\r\n/g, '\n');
  const top = changelog.split(/\n(?=## )/).find(s => s.startsWith('## ')) || '';
  check('the changelog opens on 1.0.0', /^## 1\.0\.0 - /.test(top), top.slice(0, 30));
  check('the release notes are that section and nothing else', notes.replace(/\s+$/, '') === top.replace(/\s+$/, ''));
  check('there is a licence', /MIT License/.test(read('LICENSE') || ''));
  check('the README names the slash command', /\/conjure/.test(read('README.md') || ''));
  const texts = [];
  const walk = rel => {
    for (const name of fs.readdirSync(DIR + (rel || '.'))) {
      if (name === '.git' || name === 'node_modules') continue;
      const sub = rel ? rel + '/' + name : name;
      if (fs.statSync(DIR + sub).isDirectory()) walk(sub);
      else if (/\.(lua|md|toc|js|xml|txt)$|^\.pkgmeta$|^\.gitignore$|^LICENSE$/.test(name)) texts.push(sub);
    }
  };
  walk('');
  const dashes = new RegExp('[' + String.fromCharCode(0x2012) + '-' + String.fromCharCode(0x2015) + ']');
  const dashed = texts.filter(rel => dashes.test(read(rel) || ''));
  check('no em or en dashes in any file', dashed.length === 0, dashed.join(', '));
  // Built from pieces so this file does not match itself.
  const attribution = new RegExp(['Cla' + 'ude', 'Anthr' + 'opic', 'Co-Auth' + 'ored-By'].join('|'), 'i');
  const attributed = texts.filter(rel => attribution.test(read(rel) || ''));
  check('no tool attribution in any file', attributed.length === 0, attributed.join(', '));
  pass += p; fail += f; parts.push('files ' + p);
}

console.log('(' + parts.join(', ') + ')');
console.log(`RESULT pass=${pass} fail=${fail}`);
process.exitCode = fail > 0 ? 1 : 0;
