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
const files = ['Core.lua', 'Bags.lua', 'Conjure.lua', 'Trade.lua', 'Macro.lua', 'Click.lua', 'UI.lua', 'Alert.lua', 'Announce.lua', 'Minimap.lua'];

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
M.SetScale = function(s, v) s.scale = v end
M.GetScale = function(s) return s.scale or 1 end
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
M.SetTexCoord = function(s, ...) s.texCoord = { ... } end
M.SetFlipBookRows = function(s, v) s.rows = v end
M.SetFlipBookFrames = function(s, v) s.frames = v end
M.SetDuration = function(s, v) s.duration = v end
M.SetToFinalAlpha = function(s, v) s.toFinal = v end
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
M.Play = function(s) s.playing = true s.plays = (s.plays or 0) + 1 end
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
  "classicon-mage", "classicon-priest", "classicon-warrior", "classicon-hunter", "classicon-warlock",
  "charactercreate-customize-playbutton", "charactercreate-customize-stopbutton",
  "gm-icon-settings", "gm-icon-settings-pressed", "gm-icon-settings-hover", "communities-icon-chat",
  "Profession-ProgressBar-frame", "Profession-ProgressBar-BG", "Skillbar_Fill_Flipbook_Alchemy_c60", "Skillbar_Flare_Alchemy_c60",
  "common-dropdown-a-button-settings", "common-dropdown-a-button-settings-hover", "common-dropdown-a-button-settings-pressed",
  "common-dropdown-a-button-sharetochat", "common-dropdown-a-button-sharetochat-hover", "common-dropdown-a-button-sharetochat-pressed" }) do
  KNOWN_ATLASES[a] = true
end
-- Where some atlases sit in their files, as the client reports them.
ATLAS_INFO = {
  ["Profession-ProgressBar-frame"] = { width = 374, height = 23, file = 8164391,
    leftTexCoord = 119 / 512, rightTexCoord = 493 / 512, topTexCoord = 1 / 128, bottomTexCoord = 24 / 128 },
  ["Profession-ProgressBar-BG"] = { width = 374, height = 23, file = 8164391,
    leftTexCoord = 119 / 512, rightTexCoord = 493 / 512, topTexCoord = 26 / 128, bottomTexCoord = 49 / 128 },
  ["Skillbar_Fill_Flipbook_Alchemy_c60"] = { width = 1712, height = 1020 },
}
C_Texture = { GetAtlasInfo = function(a) if BAD_ATLAS then return nil end return KNOWN_ATLASES[a] and (ATLAS_INFO[a] or { width = 10 }) or nil end }

BAD_TEMPLATES = BAD_TEMPLATES or {}
CLICK_CASTS, CLICK_USES = {}, {}
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
  if template == "CooldownFrameTemplate" then f.SetCooldown = function(s, start, duration) s.cd = { start, duration } end end
  if template == "InsetFrameTemplate" then f.NineSlice = obj("Frame") f.Bg = obj("texture") end
  if template == "DefaultPanelFlatTemplate" or template == "DefaultPanelTemplate" then
    f.NineSlice = obj("Frame") f.Bg = obj("Frame") f.TitleContainer = { TitleText = obj("fontstring") }
  end
  if template == "PanelTabButtonTemplate" then
    f.Text = obj("fontstring") f.Left = obj("texture") f.Right = obj("texture")
    parent.Tabs = parent.Tabs or {}
    parent.Tabs[#parent.Tabs + 1] = f
  end
  if template == "ConjurerScrollFrameTemplate" or template == "UIPanelScrollFrameTemplate" then f.ScrollBar = obj("Slider") end
  -- The client's InsecureActionButtonTemplate: out of combat a click performs the button's action.
  if template == "InsecureActionButtonTemplate" then
    f.scripts.OnClick = function(self, button, down)
      if InCombatLockdown() then return end
      local n = (button == "RightButton") and "2" or "1"
      local function Attr(k) local v = self.attributes[k .. n] if v == nil then v = self.attributes[k] end return v end
      local kind = Attr("type")
      if kind == "spell" then CLICK_CASTS[#CLICK_CASTS + 1] = Attr("spell")
      elseif kind == "item" then CLICK_USES[#CLICK_USES + 1] = Attr("item") end
    end
  end
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
function PanelTemplates_SetTab(frame, id) frame.selectedTab = id end
function PanelTemplates_TabResize(tab, padding, size, minWidth)
  if size then tab.w = math.max(72, size) else tab.w = math.max(minWidth or 72, #(tab.text or "") * 6 + 20) end
end
M.SetFrameLevel = function(s, v) s.level = v end
M.GetFrameLevel = function(s) return s.level or 1 end
-- Where the player is: INSTANCE = { inside = true, kind = "pvp", max = 40 } in a battleground.
function IsInInstance() if INSTANCE and INSTANCE.inside then return true, INSTANCE.kind end return false, "none" end
function GetInstanceInfo() local i = INSTANCE or {} return "Somewhere", i.kind or "none", 0, "", i.max or 0 end

UIParent = obj("Frame") UIParent.w, UIParent.h = 1920, 1080
Minimap = obj("Frame") Minimap.w, Minimap.h = 140, 140
GameTooltip = obj("GameTooltip")
GameTooltip.AddLine = function(s, text) TIP_LINES[#TIP_LINES + 1] = text end
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
-- The outlined fonts the client defines.
GameFontHighlightOutline, GameFontHighlightSmallOutline = {}, {}
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
function time() return math.floor(NOW) end
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
-- Tooltips: post-calls by data type, and what the hovered tooltip says.
Enum = { TooltipDataType = { Item = 0, Spell = 1, Unit = 2 } }
TOOLTIP_CALLS, TIP_LINES = {}, {}
TooltipDataProcessor = { AddTooltipPostCall = function(kind, fn) TOOLTIP_CALLS[#TOOLTIP_CALLS + 1] = { kind = kind, fn = fn } end }
function UnitTokenFromGUID(guid) if HOVER_UNIT and UnitGUID(HOVER_UNIT) == guid then return HOVER_UNIT end end
function UnitIsPlayer(unit) return unit == "player" or MemberFor(unit) ~= nil end
function UnitIsFriend() return true end
-- With ITEM_LINKS set the client has item links ready, the way it does for what is in your bags.
C_Item.GetItemInfo = function(id)
  if not ITEM_LINKS then return nil end
  local name = ITEM_NAMES[id] or (NS and NS.BY_ITEM[id] and NS.BY_ITEM[id].name) or ("Item " .. id)
  return name, "|cffffffff|Hitem:" .. id .. "::::::::60:::::|h[" .. name .. "]|h|r"
end

-- Mana. A spell costs COSTS[id] (none when unset); a cast needs it at the start and spends it at the end.
MANA, MANA_MAX = 100000, 100000
COSTS = {}
-- MANA_SECRET: the client hands addons the player's mana as a secret value, as SecretWhenUnitPowerRestricted allows.
SECRETS = SECRETS or {}
SECRET_MANA = {}
SECRETS[SECRET_MANA] = true
function UnitPower(unit) if unit == "player" then if MANA_SECRET then return SECRET_MANA end return MANA end return 0 end
LE_GAME_ERR_OUT_OF_MANA, ERR_OUT_OF_MANA = 44, "Not enough mana"
-- Every conjured water drinks through the spell Drink, which lasts as long as its words say.
C_Item.GetItemSpell = function(id) if NS and NS.BY_ITEM[id] and NS.BY_ITEM[id].kind == "water" then return "Drink", 432 end end
C_Spell.GetSpellDescription = function(id) if id == 432 then return "Restores 436 mana over 18 sec." end end
function UnitPowerMax(unit) if unit == "player" then return MANA_MAX end return 0 end
C_Spell.GetSpellPowerCost = function(id) local c = COSTS[id] if not c then return {} end return { { type = 0, name = "MANA", cost = c, minCost = 0 } } end
-- An item picked up by id, the way an action button takes one.
C_Item.PickupItem = function(id) if C_Item.GetItemCount(id) > 0 then CURSOR = { kind = "item", id = id } end end
function RemoveItems(item, n)
  for bag = 4, 0, -1 do for slot = 16, 1, -1 do
    local st = BAGS[bag][slot]
    if st and st.itemID == item and n > 0 then
      local take = math.min(st.stackCount, n) st.stackCount = st.stackCount - take n = n - take
      if st.stackCount <= 0 then BAGS[bag][slot] = nil end
    end
  end end
end

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
    if not CURSOR or not (CURSOR.kind == "spell" or (CURSOR.kind == "item" and not CURSOR.from)) then return end
    -- As in game (log of 2026-09-28): a spell put on the button whose key is down while nothing is
    -- being cast makes the client carry the hold on from addon code, which it refuses.
    if KEY_DOWN_SLOT == slot and not CASTING then REFUSED_PLACES = (REFUSED_PLACES or 0) + 1 end
    local old = ACTIONS[slot]
    ACTIONS[slot] = { kind = CURSOR.kind, id = CURSOR.id }
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
function UnitCastingInfo(unit) if unit == "player" and CASTING then return "Conjure" end end

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
    elseif CURSOR.kind == "item" and CURSOR.from and not CURSOR.split and s and s.itemID == CURSOR.id
      and not (CURSOR.from[1] == bag and CURSOR.from[2] == slot) then
      local from = BAGS[CURSOR.from[1]][CURSOR.from[2]]
      local move = math.min(20 - s.stackCount, from.stackCount)
      s.stackCount = s.stackCount + move
      from.stackCount = from.stackCount - move
      if from.stackCount <= 0 then BAGS[CURSOR.from[1]][CURSOR.from[2]] = nil end
      -- Both stacks wait on the server for a moment, as in game.
      s.isLocked, from.isLocked = true, true
      C_Timer.After(0.3, function() s.isLocked, from.isLocked = false, false end)
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
  -- With nothing on the cursor, a click picks up what's in the slot; clearing the cursor puts it back.
  if not CURSOR and TRADE[i] then
    local t = TRADE[i]
    CURSOR = { kind = "item", id = t.itemID, count = t.count, from = t.from }
    TRADE[i] = nil
    return
  end
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
-- The trade's "NPC" unit is whoever TRADE_PARTNER names: a group member, or STRANGER.
STRANGER = { guid = "Player-70-STRANGER", name = "Wander", level = 60, class = "WARRIOR" }
function MemberFor(unit)
  if unit == "NPC" then
    for _, m in ipairs(GROUP) do if m.guid == TRADE_PARTNER then return m end end
    if TRADE_PARTNER == STRANGER.guid then return STRANGER end
    return nil
  end
  for _, m in ipairs(GROUP) do if m.unit == unit then return m end end
end
TradeFrame = obj("Frame", nil, "TradeFrame")
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
LE_PARTY_CATEGORY_HOME, LE_PARTY_CATEGORY_INSTANCE = 1, 2
function IsInGroup(category)
  if category == LE_PARTY_CATEGORY_INSTANCE then return (INSTANCE and INSTANCE.inside and INSTANCE.kind == "pvp" and #GROUP > 0) and true or false end
  return #GROUP > 0
end

-- Chat: what was sent, and a switch to make the client refuse it.
SENT = {}
C_ChatInfo = { SendChatMessage = function(text, channel)
  if REFUSE_CHAT then error("blocked by the client") end
  SENT[#SENT + 1] = { text = text, channel = channel }
end }

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
-- Which profile tab is selected, from Blizzard's tab state or the plain tabs' own.
function SelectedTab()
  if NS.report["profile tabs"] == "PanelTabButtonTemplate" then return NS.UI.parts.tabStrip.selectedTab end
  for i, tab in ipairs(NS.UI.parts.tabs) do if tab.selected then return i end end
end
-- As in the game, a check button flips its own state before its click handler runs.
function Click(button, which)
  if button.kind == "CheckButton" then button.checked = not button.checked end
  if button.scripts.PreClick then button.scripts.PreClick(button, which or "LeftButton", false) end
  button.scripts.OnClick(button, which or "LeftButton")
  if button.scripts.PostClick then button.scripts.PostClick(button, which or "LeftButton", false) end
  RunTimers(0)
end

-- A hold, the way the client behaved in the first in-game test (log of 2026-09-28): the key goes
-- down and the game casts what the button holds. Just before each cast ends it queues the next
-- repeat of that same spell, if the button still holds it; once the button holds something else
-- (or nothing) the hold ends after the cast in progress. The key is let go after max casts.
-- INTERRUPT_AT makes that cast fail instead of landing.
YIELD = 4
CAST_N = 0
function Hold(key, max)
  local bind = BINDINGS[key]
  if not bind then return 0 end
  local bar, id = bind.command:match("^MULTIACTIONBAR(%d)BUTTON(%d+)$")
  local barName = ({ ["7"] = "MultiBar7", ["6"] = "MultiBar6", ["5"] = "MultiBar5", ["4"] = "MultiBarLeft",
    ["3"] = "MultiBarRight", ["2"] = "MultiBarBottomRight", ["1"] = "MultiBarBottomLeft" })[bar]
  id = tonumber(id)
  local slot = _G[barName].actionButtons[id].action
  MultiActionButtonDown(barName, id)
  KEY_DOWN_SLOT = slot
  local a = ACTIONS[slot]
  -- An item on the button: the press uses it once (a drink), and holding repeats nothing.
  if a and a.kind == "item" then
    DRANK = (DRANK or 0) + 1
    RemoveItems(a.id, 1)
    fire("BAG_UPDATE_DELAYED") RunTimers(0)
    KEY_DOWN_SLOT = nil
    MultiActionButtonUp(barName, id)
    RunTimers(0)
    return 0
  end
  local spell = a and a.kind == "spell" and a.id
  local casts = 0
  local queued = spell ~= nil
  -- A cast's items reach the bags about a second after it lands: during the next cast, or after
  -- the key is let go.
  local pendingItem, pendingN
  local function Arrive()
    if not pendingItem then return end
    -- SPLIT_ARRIVAL: the items come in two bag updates, one topping up a stack, then the rest.
    if SPLIT_ARRIVAL and pendingN > 1 then
      AddItems(pendingItem, 1)
      fire("BAG_UPDATE_DELAYED")
      RunTimers(0.2)
      pendingN = pendingN - 1
    end
    AddItems(pendingItem, pendingN)
    pendingItem = nil
    fire("BAG_UPDATE_DELAYED")
    RunTimers(0)
  end
  while queued and casts < (max or 100) do
    CAST_N = CAST_N + 1
    local guid = "Cast-" .. CAST_N
    if (COSTS[spell] or 0) > MANA then
      fire("UI_ERROR_MESSAGE", LE_GAME_ERR_OUT_OF_MANA, ERR_OUT_OF_MANA) RunTimers(0)
      fire("UNIT_SPELLCAST_FAILED", "player", guid, spell) RunTimers(0)
      break
    end
    CASTING = true
    fire("UNIT_SPELLCAST_START", "player", guid, spell)
    RunTimers(0)
    Arrive()
    -- Something else changing in the bags while the cast is going (loot, a trade, food eaten).
    if BAG_UPDATE_MIDCAST then fire("BAG_UPDATE_DELAYED") RunTimers(0) end
    -- ADD_DURING: items of the row handed over (a trade) during that cast.
    if ADD_DURING and ADD_DURING.cast == casts + 1 then
      AddItems(ADD_DURING.item, ADD_DURING.n)
      ADD_DURING = nil
      fire("BAG_UPDATE_DELAYED") RunTimers(0)
    end
    -- One of what is being conjured drunk or eaten during this cast.
    if EAT_DURING == casts + 1 then
      local item = NS.BY_SPELL[spell].item
      for bag = 0, 4 do for s, st in pairs(BAGS[bag]) do
        if st.itemID == item and EAT_DURING then st.stackCount = st.stackCount - 1 EAT_DURING = nil if st.stackCount <= 0 then BAGS[bag][s] = nil end end
      end end
      fire("BAG_UPDATE_DELAYED") RunTimers(0)
    end
    -- The queue point, just before the cast ends.
    local now = ACTIONS[slot]
    queued = now and now.kind == "spell" and now.id == spell and BINDINGS[key] ~= nil
    if INTERRUPT_AT and INTERRUPT_AT == casts + 1 then
      INTERRUPT_AT = nil
      CASTING = false
      fire("UNIT_SPELLCAST_INTERRUPTED", "player", guid, spell)
      RunTimers(0)
      break
    end
    CASTING = false
    if COSTS[spell] then MANA = MANA - COSTS[spell] end
    fire("UNIT_SPELLCAST_SUCCEEDED", "player", guid, spell)
    RunTimers(0)
    if COSTS[spell] then fire("UNIT_POWER_UPDATE", "player", "MANA") RunTimers(0) end
    pendingItem, pendingN = NS.BY_SPELL[spell].item, YieldOf(spell)
    casts = casts + 1
  end
  -- KEEP_HOLDING: the key stays down that many seconds after the hold ends, so the last items
  -- arrive with it still down.
  if KEEP_HOLDING then
    Arrive()
    RunTimers(KEEP_HOLDING)
  end
  KEY_DOWN_SLOT = nil
  MultiActionButtonUp(barName, id)
  RunTimers(0)
  Arrive()
  return casts
end

-- What one cast makes in this world: the spell data at the player's level, unless a test says
-- the client makes something else.
YIELD_OVERRIDE = {}
function YieldOf(spell)
  return YIELD_OVERRIDE[spell] or NS.FormulaYield(NS.BY_SPELL[spell], PLAYER_LEVEL)
end

-- A click on a click-to-conjure button and the cast it starts. The items arrive at once, or with
-- later set, when the returned function is called.
function ClickCast(button, later)
  local before = #CLICK_CASTS
  Click(button)
  local spell = CLICK_CASTS[before + 1]
  if not spell then return nil end
  CAST_N = CAST_N + 1
  local guid = "Cast-" .. CAST_N
  if (COSTS[spell] or 0) > MANA then
    fire("UI_ERROR_MESSAGE", LE_GAME_ERR_OUT_OF_MANA, ERR_OUT_OF_MANA) RunTimers(0)
    fire("UNIT_SPELLCAST_FAILED", "player", guid, spell) RunTimers(0)
    return nil
  end
  CASTING = true
  fire("UNIT_SPELLCAST_START", "player", guid, spell) RunTimers(0)
  CASTING = false
  fire("UNIT_SPELLCAST_SUCCEEDED", "player", guid, spell) RunTimers(0)
  local function Arrive() AddItems(NS.BY_SPELL[spell].item, YieldOf(spell)) fire("BAG_UPDATE_DELAYED") RunTimers(0) end
  if later then return spell, Arrive end
  Arrive()
  return spell
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
check("the first login plans your own stock at your best ranks", ConjurerDB.profiles.solo.water[7] == 40 and ConjurerDB.profiles.solo.food[7] == 20,
  tostring(ConjurerDB.profiles.solo.water[7]) .. "/" .. tostring(ConjurerDB.profiles.solo.food[7]))
check("and only once", ConjurerDB.profiles.solo.seeded == true)
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
check("the inset is lowered for the Ready bar and the progress bar", ConjurerFrame.Inset.points[1][5] == -109)
check("it opened with the spellbook's sound", Played(829))
check("seven sections", #P.content.kids >= 14 and P.sections.macro ~= nil and P.sections.alert ~= nil)
check("the icon's rounded mask is Blizzard's size, centred, so the icon fills the frame",
  P.readyButton.iconMask and math.abs(P.readyButton.iconMask.w - 42 * 64 / 45) < 0.01 and P.readyButton.iconMask.points[1][1] == "CENTER")
check("a play button sits over the Ready icon", P.readyButton.play.shown and P.readyButton.play.atlas == "charactercreate-customize-playbutton"
  and not P.readyButton.stop.shown and not P.readyButton.playText.shown)
check("and it's lit up while there's something to start", P.readyButton.play.desaturated == false and P.readyButton.play.alpha == 1)
check("the headers use Blizzard's list header art", P.sections.water.header.Right and P.sections.water.header.Right.atlas == "Options_ListExpand_Right_Expanded")
check("Options starts closed", P.sections.options.body.shown == false and P.sections.options.header.Right.atlas == "Options_ListExpand_Right")
check("the others start open", P.sections.water.body.shown and P.sections.food.body.shown and P.sections.shares.body.shown and P.sections.group.body.shown)
check("the scroll frame is the MinimalScrollBar one", ns.report["scroll frame"] == "ScrollFrameTemplate with MinimalScrollBar")
check("sliders are Blizzard's stepper sliders", ns.report["slider template"] == "MinimalSliderWithSteppersTemplate")
check("the Ready glow is the spell alert flipbook", ns.report["ready glow"] == "spell alert flipbook")

local waterRows = P.rankRows.water
check("seven water rows, best rank first", #waterRows == 7 and waterRows[1].entry.rank == 7 and waterRows[7].entry.rank == 1)
check("by default only your best rank of each is listed", waterRows[1].shown and not waterRows[2].shown and not waterRows[7].shown
  and P.sections.water.body.h == 2 + 28 + 2 and P.rankRows.food[1].shown and not P.rankRows.food[2].shown)
check("the Show all ranks box sits in the Water header, off", UI.allRanks and UI.allRanks.parent == P.sections.water.header and not UI.allRanks.checked)
Click(UI.allRanks)
check("ticked, every rank you know is listed", ns.db.showAllRanks and waterRows[7].shown and P.sections.water.body.h == 2 + 7 * 28 + 2)
check("names drop the word Conjured", waterRows[1].name.text == "Crystal Water", waterRows[1].name.text)
check("each row says the level needed", waterRows[1].level.text == "Level 55" and waterRows[7].level.text == "Level 1")
check("and how many you have", waterRows[1].have.text == "Have 0")
check("the slider shows the target", waterRows[1].slider.Slider.value == 40)
check("the Ready bar says to press play, then what's next", P.readyTitle.text == "Click play to start"
  and P.readyDetail.text == "Then hold F to conjure. Next: Crystal Water, 0 of 40 (Solo).", P.readyDetail.text)
check("the key button shows the key", P.keyButton.text == "Key: F")

-- Moving a slider sets the target; syncing it back does not.
waterRows[1].slider.Slider:SetValue(60)
RunTimers(0)
check("a slider moved by hand sets the target", ns.Profile().water[7] == 60)
waterRows[1].slider.Slider:SetValue(40)
RunTimers(0)
check("and back", ns.Profile().water[7] == 40)
ns.Profile().water[6] = 250
UI.Refresh()
check("a target past the slider's end widens the slider instead of clipping", waterRows[2].slider.Slider.maxV == 300 and waterRows[2].slider.Slider.value == 250)
ns.Profile().water[6] = 420
UI.Refresh()
check("far past it, the slider grows to the next hundred", waterRows[2].slider.Slider.maxV == 500 and ns.Profile().water[6] == 420)
ns.Profile().water[6] = 0
UI.Refresh()
check("a cleared target stays cleared", ns.Profile().water[6] == 0)

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
check("the minimap button lights too, round and pulsing", ConjurerMinimapButton.lit.shown and ConjurerMinimapButton.lit.mask ~= nil
  and ConjurerMinimapButton.pulse.playing)
check("the play button turns into a stop button", P.readyButton.stop.shown and not P.readyButton.play.shown
  and P.readyButton.stop.atlas == "charactercreate-customize-stopbutton")
check("the slot is remembered for next time", ns.db.slot.bar == "MultiBar7" and ns.db.slot.index == 12)

check("the spell data gives the yield before any cast", C.Yield(ns.WATER[7]) == 10 and C.Yield(ns.FOOD[6]) == 20
  and ns.FormulaYield(ns.WATER[1], 8) == 10 and ns.FormulaYield(ns.FOOD[1], 8) == 6 and ns.FormulaYield(ns.WATER[1], 60) == 20)
local casts = Hold("F", 100)
check("one hold conjures the water row and stops there", casts == 4 and C.armed, casts)
check("exactly the water target: the button moved on during the last cast", C_Item.GetItemCount(8079) == 40, C_Item.GetItemCount(8079))
check("the casts it saw agree with the spell data", ns.db.yield[10140] and ns.db.yield[10140].n == 10 and ns.db.yield[10140].level == 60)
check("the button already holds the food", ACTIONS[180] and ACTIONS[180].id == 28612)
check("the row change chimed", Played(878))
check("and said to press again", ErrorWith("Crystal Water done. Let go, then hold F again for Cinnamon Roll."))
casts = Hold("F", 100)
check("the next hold conjures the food", casts == 2, casts)
check("exactly the food target", C_Item.GetItemCount(22895) == 20, C_Item.GetItemCount(22895))
check("finishing chimed", Played(7355) and ErrorWith("All conjured"))
check("Ready switched itself off", C.armed == false and ChatWith("Everything is conjured") == 1)
check("the binding is gone", BINDINGS.F == nil)
check("the borrowed button is empty again", ACTIONS[180] == nil)
check("hold to cast is back as it was", CVARS.ActionButtonUseKeyHeldSpell == "0" and ns.db.savedCVars == nil)
check("the glow is off", P.readyGlow.shown == false and not P.readyAnim.playing)
check("the report calls hold to cast working", C.hold.best == 4 and C.hold.presses == 2 and C.hold.releases == 2)
local reportText = table.concat(ns.DebugReport(), "\n")
check("the debug report says so", reportText:find("hold to cast: works (4 casts in one hold)", 1, true) ~= nil)

-- Nothing left: Ready refuses and says why.
Click(P.readyButton)
check("with every target met Ready stays off", C.armed == false and ChatWith("Nothing to conjure") == 1)
check("the bar says so", P.readyTitle.text == "Nothing to conjure")
check("and the play button greys out", P.readyButton.play.shown and P.readyButton.play.desaturated == true and P.readyButton.play.alpha < 1)

-- Short hold, let go early, hold again.
local base = C_Item.GetItemCount(8079)
ns.Profile().water[7] = base + 40
Click(P.readyButton)
casts = Hold("F", 2)
check("letting go stops the casting", casts == 2 and C.armed and C_Item.GetItemCount(8079) == base + 20)
casts = Hold("F", 100)
check("the next hold carries on to the target, not a cast past it", casts == 2 and C_Item.GetItemCount(8079) == base + 40
  and not C.armed, C_Item.GetItemCount(8079))

-- The client makes a different amount than the spell data says: guessed high, the button moves
-- on a cast early and comes back; after two casts that agree it knows, and ends exactly.
ns.db.yield = {}
YIELD_OVERRIDE[10140] = 8
base = C_Item.GetItemCount(8079)
ns.Profile().water[7] = base + 40
Click(P.readyButton)
local holds, total = 0, 0
while C.armed and holds < 6 do
  total = total + Hold("F", 100)
  holds = holds + 1
end
check("a yield the spell data gets wrong is learned", ns.db.yield[10140] and ns.db.yield[10140].n == 8, ns.db.yield[10140] and ns.db.yield[10140].n)
check("and the row still ends exactly on its target", not C.armed and C_Item.GetItemCount(8079) == base + 40 and total == 5, total)
YIELD_OVERRIDE[10140] = nil
ns.db.yield = {}

-- A drink taken mid-hold skews one difference; only two that agree are learned.
base = C_Item.GetItemCount(8079)
ns.Profile().water[7] = base + 50
Click(P.readyButton)
EAT_DURING = 3
Hold("F", 100)
EAT_DURING = nil
check("a drink mid-hold doesn't teach a wrong yield", ns.db.yield[10140] and ns.db.yield[10140].n == 10
  and not table.concat(ConjurerLog.entries, "\n"):find("makes 9", 1, true))
if C.armed then Hold("F", 100) end
if C.armed then C.Disarm() end
ns.db.yield = {}

-- Guessed too high on the finishing cast: the button went empty, the cast fell short, the spell
-- comes back and one more press finishes.
YIELD_OVERRIDE[10140] = 6
base = C_Item.GetItemCount(8079)
ns.Profile().water[7] = base + 10
Click(P.readyButton)
casts = Hold("F", 100)
RunTimers(C.SETTLE)
check("a cast that falls short of the guess puts its spell back", casts == 1 and C.armed and ACTIONS[C.where.slot] and ACTIONS[C.where.slot].id == 10140
  and C_Item.GetItemCount(8079) == base + 6, casts)
casts = Hold("F", 100)
check("and the next press finishes the row", not C.armed and C_Item.GetItemCount(8079) >= base + 10)
YIELD_OVERRIDE[10140] = nil
ns.db.yield = {}

-- The finishing cast interrupted: its spell goes back and the row carries on.
base = C_Item.GetItemCount(8079)
ns.Profile().water[7] = base + 20
Click(P.readyButton)
INTERRUPT_AT = 2
casts = Hold("F", 100)
check("an interrupted finishing cast puts its spell back", casts == 1 and C.armed and ACTIONS[C.where.slot] and ACTIONS[C.where.slot].id == 10140)
casts = Hold("F", 100)
check("and the next press finishes the row exactly", casts == 1 and not C.armed and C_Item.GetItemCount(8079) == base + 20, casts)

-- Something else lands in the bags during the finishing cast: the early move holds.
base = C_Item.GetItemCount(8079)
ns.Profile().water[7] = base + 20
Click(P.readyButton)
BAG_UPDATE_MIDCAST = true
casts = Hold("F", 100)
BAG_UPDATE_MIDCAST = nil
check("a bag change during the finishing cast doesn't undo the early move", casts == 2 and not C.armed
  and C_Item.GetItemCount(8079) == base + 20, casts)

-- The in-game refusal (log of 2026-09-28): an uneven stack, so the finishing cast's items came in
-- two bag updates while the key was still down. The first was taken as the cast falling short and
-- the spell went back on the held button, which the game refused.
REFUSED_PLACES = 0
local function Logged(text) return table.concat(ConjurerLog.entries, "\n"):find(text, 1, true) ~= nil end
local logMark = #ConjurerLog.entries
local function LoggedSince(text)
  for i = logMark + 1, #ConjurerLog.entries do if ConjurerLog.entries[i]:find(text, 1, true) then return true end end
  return false
end
base = C_Item.GetItemCount(8079)
ns.Profile().water[7] = base + 20
ns.Profile().food[7] = C_Item.GetItemCount(22895) + 10
Click(P.readyButton)
SPLIT_ARRIVAL, KEEP_HOLDING = true, 3
casts = Hold("F", 100)
SPLIT_ARRIVAL, KEEP_HOLDING = nil, nil
check("items arriving in two parts with the key down aren't taken as a cast falling short", casts == 2
  and C_Item.GetItemCount(8079) == base + 20 and not LoggedSince("fell short"), casts)
check("so nothing goes on the held button and the game refuses nothing", REFUSED_PLACES == 0, REFUSED_PLACES)
check("and the button holds the next row", C.armed and C.placed and C.placed.spell == ns.FOOD[7].spell)
C.Disarm()

-- A real shortfall with the key still down: the spell waits for the key up.
REFUSED_PLACES = 0
logMark = #ConjurerLog.entries
YIELD_OVERRIDE[10140] = 6
base = C_Item.GetItemCount(8079)
ns.Profile().water[7] = base + 10
ns.Profile().food[7] = 0
Click(P.readyButton)
KEEP_HOLDING = 3
casts = Hold("F", 100)
KEEP_HOLDING = nil
check("a real shortfall with the key down waits for the key up", casts == 1 and REFUSED_PLACES == 0
  and LoggedSince("fell short (" .. (base + 6) .. "/" .. (base + 10) .. ")") and LoggedSince("goes back on the button when you let go"), REFUSED_PLACES)
check("then the spell is back on the button", C.armed and ACTIONS[C.where.slot] and ACTIONS[C.where.slot].id == 10140)
check("and it says to let go and hold again", ErrorWith("Crystal Water came up short. Let go, then hold F again."))
casts = Hold("F", 100)
check("the next hold finishes the row", casts == 1 and not C.armed and C_Item.GetItemCount(8079) >= base + 10, casts)
YIELD_OVERRIDE[10140] = nil
ns.db.yield = {}

-- The row filled some other way during a cast (a trade): the button moves on at once, mid-cast,
-- so the hold ends after that cast rather than running on until the key up.
REFUSED_PLACES = 0
base = C_Item.GetItemCount(8079)
ns.Profile().water[7] = base + 30
ns.Profile().food[7] = C_Item.GetItemCount(22895) + 10
Click(P.readyButton)
ADD_DURING = { cast = 2, item = 8079, n = 20 }
casts = Hold("F", 5)
ADD_DURING = nil
check("a row filled during a cast moves the button on then, not at the key up", casts == 2 and REFUSED_PLACES == 0
  and C.armed and C.placed and C.placed.spell == ns.FOOD[7].spell, casts)
C.Disarm()
ns.Profile().food[7] = 0

-- ---- Conjuring by click ---------------------------------------------------
if not BARE then
  local CB = P.clickButton
  check("the window has a click button, made to cast from a click without being protected", CB ~= nil
    and CB.template == "InsecureActionButtonTemplate" and CB.parent == ConjurerFrame and CB.attributes.useOnKeyDown == false)
  base = C_Item.GetItemCount(8079)
  local baseFood = C_Item.GetItemCount(22895)
  ns.Profile().water[7] = base + 20
  ns.Profile().food[7] = baseFood + 10
  ns.Refresh() RunTimers(0)
  check("its spell is the next row short of its target", CB.attributes.type == "spell" and CB.attributes.spell == 10140
    and not CB.icon.desaturated and CB.icon.texture == "spellicon:10140")
  local spell, arrive = ClickCast(CB, true)
  check("a click conjures once, with no Ready and no key", spell == 10140 and not C.armed)
  check("a cast still on its way counts, so the button stays on water for the last one", CB.attributes.spell == 10140)
  arrive()
  local before = #CLICK_CASTS
  Click(CB)
  spell = CLICK_CASTS[before + 1]
  CAST_N = CAST_N + 1
  fire("UNIT_SPELLCAST_START", "player", "Cast-" .. CAST_N, spell) RunTimers(0)
  check("when a row's last cast starts, the button already holds the next row", spell == 10140 and CB.attributes.spell == 28612)
  fire("UNIT_SPELLCAST_SUCCEEDED", "player", "Cast-" .. CAST_N, spell) RunTimers(0)
  check("and stays there while that cast's items are on their way", CB.attributes.spell == 28612)
  AddItems(8079, 5) fire("BAG_UPDATE_DELAYED") RunTimers(0)
  check("half of a cast's items arriving leaves the other half still counted", CB.attributes.spell == 28612)
  AddItems(8079, 5) fire("BAG_UPDATE_DELAYED") RunTimers(0)
  check("items arriving in parts are counted off as they come", C_Item.GetItemCount(8079) == base + 20 and CB.attributes.spell == 28612)
  ClickCast(CB)
  check("the next click conjures food, and then there's nothing left", C_Item.GetItemCount(22895) == baseFood + 10
    and CB.attributes.type == nil and CB.icon.desaturated)
  before = #CLICK_CASTS
  Click(CB)
  check("with every target met a click casts nothing", #CLICK_CASTS == before)
  check("the log says what each click did", Logged("click: conjure Conjured Crystal Water") and Logged("click: conjure Conjured Cinnamon Roll")
    and Logged("click: nothing to conjure"))
  -- In combat the template does nothing, and the button says so.
  ns.Profile().water[7] = C_Item.GetItemCount(8079) + 10
  ns.Refresh() RunTimers(0)
  EnterCombatLockdown() fire("PLAYER_REGEN_DISABLED") RunTimers(0)
  before = #CLICK_CASTS
  Click(CB)
  check("in combat a click casts nothing and the button greys out", #CLICK_CASTS == before and CB.icon.desaturated
    and Logged("click in combat: nothing"))
  COMBAT = false fire("PLAYER_REGEN_ENABLED") RunTimers(0)
  check("out of combat it's back", not CB.icon.desaturated and CB.attributes.spell == 10140)
  -- On the alert: every target met, water low. Its button conjures what's low anyway.
  ClearBags()
  AddItems(8079, 5)
  AddItems(22895, 20)
  ns.Profile().water[7] = 5
  ns.Profile().food[7] = 10
  fire("BAG_UPDATE_DELAYED") RunTimers(0)
  check("the alert has a click button, between its icons and its Ready button", ConjurerAlertConjure and ConjurerAlertConjure:IsVisible()
    and ConjurerAlertConjure.parent == ConjurerAlert and ConjurerAlert.w == 40 + 2 + 40 + 2 + 40, ConjurerAlert and ConjurerAlert.w)
  check("with every target met, the alert's button conjures what's low", ConjurerAlertConjure.attributes.spell == 10140
    and CB.attributes.type == nil)
  ClickCast(ConjurerAlertConjure)
  check("and a click on it does", C_Item.GetItemCount(8079) == 15 and Logged("(the alert's pick)"))
  ns.Profile().water[7] = 0
  ns.Profile().food[7] = 0
else
  check("without the insecure action template there's no click button, and nothing breaks", P.clickButton == nil
    and ns.report["click button"] == "none (no InsecureActionButtonTemplate)")
end

-- ---- Icons that conjure their own rank ---------------------------------------
if not BARE then
  if C.armed then C.Disarm() end
  local row7 = P.rankRows.water[1]
  check("a water row's icon conjures its own rank with a click", row7.cast and row7.cast.template == "InsecureActionButtonTemplate"
    and row7.cast.attributes.type1 == "spell" and row7.cast.attributes.spell1 == 10140 and row7.cast.attributes.useOnKeyDown == false
    and row7.icon.parent == row7.cast)
  local iconCasts = #CLICK_CASTS
  Click(row7.cast)
  check("a click casts it, no Ready needed", #CLICK_CASTS == iconCasts + 1 and CLICK_CASTS[#CLICK_CASTS] == 10140 and not C.armed
    and Logged("icon click: conjure Conjured Crystal Water"))
  local wasAllRanks = ns.db.showAllRanks
  ns.db.showAllRanks = true
  UI.Refresh()
  local row6 = P.rankRows.water[2]
  Click(row6.cast)
  check("a lower rank's icon conjures that rank", row6.entry.rank == 6 and CLICK_CASTS[#CLICK_CASTS] == 10139)
  ns.db.showAllRanks = wasAllRanks
  UI.Refresh()
  Click(P.rankRows.food[1].cast)
  check("a food icon its food", CLICK_CASTS[#CLICK_CASTS] == 28612)
  check("and a gem's icon its gem", P.gemRows[1].cast and P.gemRows[1].cast.attributes.spell1 == 10054)
  EnterCombatLockdown()
  iconCasts = #CLICK_CASTS
  Click(row7.cast)
  check("in combat an icon casts nothing", #CLICK_CASTS == iconCasts and Logged("icon click in combat: nothing"))
  COMBAT = false
else
  check("without the template the row icons are plain pictures", P.rankRows.water[1].cast == nil and P.rankRows.water[1].icon ~= nil)
end

-- ---- Out of mana: the key drinks your best water -------------------------------
if C.armed then C.Disarm() end
ClearBags()
AddItems(8079, 15)
COSTS[10140] = 100
MANA_MAX, MANA = 1000, 250
REFUSED_PLACES = 0
ERRORS = {}
ns.Profile().water[7] = 100
ns.Profile().food[7] = 0
Click(P.readyButton)
casts = Hold("F", 100)
check("with mana for two casts, the hold ends after the second and the key drinks", casts == 2 and C.armed
  and C.thirst and C.thirst.entry == ns.WATER[7] and ACTIONS[C.where.slot] and ACTIONS[C.where.slot].kind == "item" and ACTIONS[C.where.slot].id == 8079, casts)
check("it says so", ErrorWith("Out of mana after this cast: F drinks Crystal Water next."))
check("the water went on the button while a cast was going, so nothing was refused", REFUSED_PLACES == 0, REFUSED_PLACES)
UI.Refresh()
check("the Ready bar says the next press drinks", P.readyDetail.text == "Out of mana: F drinks Crystal Water next", P.readyDetail.text)
local waterBefore = C_Item.GetItemCount(8079)
casts = Hold("F", 100)
check("the next press drinks your best water", casts == 0 and DRANK == 1 and C_Item.GetItemCount(8079) == waterBefore - 1)
check("and as soon as it does, the spell is back, for you to conjure whenever you like", not C.thirst and ACTIONS[C.where.slot]
  and ACTIONS[C.where.slot].kind == "spell" and ACTIONS[C.where.slot].id == 10140 and REFUSED_PLACES == 0)
check("it says so", ErrorWith("Drinking. F conjures whenever you're ready."))
UI.Refresh()
check("the Ready bar counts down the drink", P.readyDetail.text == "Drinking (18s left): F conjures whenever you're ready", P.readyDetail.text)
-- Pressed too soon: the game refuses for mana, and it's not another drink.
waterBefore = C_Item.GetItemCount(8079)
ERRORS = {}
casts = Hold("F", 100)
check("pressed too soon, it's not another drink: it says how long the drink has left", casts == 0 and DRANK == 1
  and C_Item.GetItemCount(8079) == waterBefore and ACTIONS[C.where.slot].kind == "spell" and ErrorWith("Still drinking: 18 seconds left."))
MANA = 900
fire("UNIT_POWER_UPDATE", "player", "MANA") RunTimers(0)
casts = Hold("F", 3)
check("with enough mana, the key conjures, whenever you choose", casts == 3)
C.Disarm()
check("Ready off, the borrowed button is empty", ACTIONS[C.where.slot] == nil)
RunTimers(20)
-- Full before drinking: back to the spell, saying so.
MANA = 50
ERRORS = {}
Click(P.readyButton)
check("out of mana when Ready lights, the key drinks first", C.thirst and ACTIONS[C.where.slot].kind == "item"
  and ErrorWith("Out of mana: F drinks Crystal Water next."))
MANA = MANA_MAX
fire("UNIT_POWER_UPDATE", "player", "MANA") RunTimers(0)
check("full again before a drink, the spell is back", not C.thirst and ACTIONS[C.where.slot].kind == "spell"
  and ErrorWith("Mana's full. Hold F to conjure Crystal Water."))
C.Disarm()
-- Out of mana with no water to drink: it says so, and the spell stays.
ClearBags()
MANA = 50
ERRORS = {}
Click(P.readyButton)
check("out of mana with no water, it says so and keeps the spell", C.armed and not C.thirst
  and ErrorWith("Out of mana, and no conjured water to drink.") and ACTIONS[C.where.slot].id == 10140)
C.Disarm()
-- Drinking switched off.
AddItems(8079, 15)
ns.db.drinkWhenOOM = false
Click(P.readyButton)
check("with drinking off, the key keeps the spell", C.armed and not C.thirst and ACTIONS[C.where.slot].kind == "spell")
C.Disarm()
ns.db.drinkWhenOOM = true
-- The click button drinks too.
if not BARE then
  local CB = P.clickButton
  ns.Refresh() RunTimers(0)
  check("out of mana, the click button drinks your best water", CB.attributes.type == "item" and CB.attributes.item == "item:8079"
    and CB.icon.texture == "itemicon:8079")
  local uses = #CLICK_USES
  Click(CB)
  check("a click drinks", #CLICK_USES == uses + 1 and CLICK_USES[#CLICK_USES] == "item:8079"
    and Logged("click: drink Conjured Crystal Water (out of mana)"))
  MANA = 900
  fire("UNIT_POWER_UPDATE", "player", "MANA") RunTimers(0)
  check("until the drink is taken, it stays on the water", CB.attributes.type == "item")
  RemoveItems(8079, 1) fire("BAG_UPDATE_DELAYED") RunTimers(0)
  check("once it is, a click conjures again", CB.attributes.type == "spell" and CB.attributes.spell == 10140)
end
COSTS[10140] = nil
MANA, MANA_MAX = 100000, 100000
RunTimers(20)

-- ---- Mana the addon can't read (as in game, 2026-09-28): the game's own "Not enough mana" ----------
if C.armed then C.Disarm() end
C.thirst, C.drinkUntil = nil, nil
ClearBags()
AddItems(8079, 15)
COSTS[10140] = 100
MANA_MAX, MANA = 1000, 250
MANA_SECRET = true
REFUSED_PLACES = 0
ERRORS = {}
logMark = #ConjurerLog.entries
ns.Profile().water[7] = 100
ns.Profile().food[7] = 0
Click(P.readyButton)
check("with mana it can't read, Ready can't tell ahead and says so in the log", C.armed and LoggedSince("can't tell whether you're out of mana: mana nil/1000"))
casts = Hold("F", 100)
check("it conjures until the game says not enough mana, then drinking starts", casts == 2 and C.thirst ~= nil
  and LoggedSince("out of mana (the game said not enough mana): the key drinks Conjured Crystal Water"), casts)
check("the water goes on the button once the key is up, and nothing is refused", ACTIONS[C.where.slot] and ACTIONS[C.where.slot].kind == "item"
  and ACTIONS[C.where.slot].id == 8079 and REFUSED_PLACES == 0, REFUSED_PLACES)
check("and it says the key drinks next", ErrorWith("Out of mana: F drinks Crystal Water next."))
local waterBefore2 = C_Item.GetItemCount(8079)
casts = Hold("F", 100)
check("the next press drinks, and the drink lasts as long as the water says", casts == 0 and C_Item.GetItemCount(8079) == waterBefore2 - 1
  and LoggedSince("drinking Conjured Crystal Water for 18 seconds; the spell is back"))
check("the spell is back at once", C.thirst == nil and ACTIONS[C.where.slot].kind == "spell" and ACTIONS[C.where.slot].id == 10140)
ERRORS = {}
RunTimers(5)
casts = Hold("F", 100)
check("pressed too soon, no second drink: how long the drink has left", casts == 0 and C_Item.GetItemCount(8079) == waterBefore2 - 1
  and ACTIONS[C.where.slot].kind == "spell" and ErrorWith("Still drinking: 13 seconds left."))
MANA = MANA_MAX
casts = Hold("F", 3)
check("with the mana back, the key conjures whenever you choose", casts == 3)
C.Disarm()
RunTimers(20)
-- Another spell out of mana, with Ready off and no click of Conjurer's: none of its business.
MANA = 50
ERRORS = {}
logMark = #ConjurerLog.entries
fire("UI_ERROR_MESSAGE", LE_GAME_ERR_OUT_OF_MANA, ERR_OUT_OF_MANA) RunTimers(0)
check("another spell out of mana, with Ready off, isn't Conjurer's business", C.thirst == nil and not LoggedSince("out of mana"))
RemoveItems(8079, 1) fire("BAG_UPDATE_DELAYED") RunTimers(0)
check("so the drink you take after it says nothing", not ErrorWith("Drinking.") and C.DrinkLeft() == nil)
-- With Ready lit it counts; with nothing drunk it lapses after a minute.
Click(P.readyButton)
fire("UI_ERROR_MESSAGE", LE_GAME_ERR_OUT_OF_MANA, ERR_OUT_OF_MANA) RunTimers(0)
check("with Ready lit, the game's word starts wanting a drink", C.armed and C.thirst ~= nil)
C.Disarm()
MANA = MANA_MAX
RunTimers(62)
check("with no drink taken, it lapses after a minute", C.thirst == nil and LoggedSince("drinking done: no drink taken for a minute"))
-- Another spell's refusal for something else doesn't count.
fire("UI_ERROR_MESSAGE", 99, "Out of range.") RunTimers(0)
check("other errors don't start drinking", C.thirst == nil)
-- The click button, the same way.
if not BARE then
  local CB = P.clickButton
  MANA = 50
  ns.Refresh() RunTimers(0)
  check("the click button can't tell ahead either, so it shows the conjure", CB.attributes.type == "spell")
  local failed = ClickCast(CB)
  check("a click the game refuses for mana makes it drink", failed == nil and CB.attributes.type == "item" and CB.attributes.item == "item:8079")
  local uses = #CLICK_USES
  Click(CB)
  RemoveItems(8079, 1) fire("BAG_UPDATE_DELAYED") RunTimers(0)
  check("a click drinks, and the next click conjures", #CLICK_USES == uses + 1 and CB.attributes.type == "spell" and C.DrinkLeft() == 18)
  ERRORS = {}
  failed = ClickCast(CB)
  check("clicked too soon: no second drink, how long the drink has left", failed == nil and CB.attributes.type == "spell"
    and ErrorWith("Still drinking: 18 seconds left."))
  MANA = MANA_MAX
  check("with the mana back, a click conjures", ClickCast(CB) == 10140)
  -- A click a while ago doesn't make a later refusal Conjurer's.
  RunTimers(25)
  C.thirst = nil
  MANA = 50
  RunTimers(3)
  fire("UI_ERROR_MESSAGE", LE_GAME_ERR_OUT_OF_MANA, ERR_OUT_OF_MANA) RunTimers(0)
  check("a refusal seconds after the last click isn't Conjurer's", C.thirst == nil)
  -- An icon's click counts the same as the click button's.
  Click(P.rankRows.water[1].cast)
  fire("UI_ERROR_MESSAGE", LE_GAME_ERR_OUT_OF_MANA, ERR_OUT_OF_MANA) RunTimers(0)
  check("a refusal right after a click on a water icon is", C.thirst ~= nil)
  C.thirst = nil
end
MANA_SECRET = nil
COSTS[10140] = nil
MANA, MANA_MAX = 100000, 100000
C.thirst, C.drinkUntil = nil, nil
RunTimers(20)

-- ---- Bags full ---------------------------------------------------------------
ClearBags()
local savedSizes = { [0] = BAG_SIZE[0], BAG_SIZE[1], BAG_SIZE[2], BAG_SIZE[3], BAG_SIZE[4] }
BAG_SIZE = { [0] = 16, 0, 0, 0, 0 }
for s = 1, 14 do BAGS[0][s] = { itemID = 4306, stackCount = 1 } end
ns.Profile().water[7] = 100
ns.Profile().food[7] = 0
REFUSED_PLACES = 0
CHAT = {}
Click(P.readyButton)
local bagCasts, bagHolds = 0, 0
while C.armed and bagHolds < 5 do
  bagCasts = bagCasts + Hold("F", 100)
  bagHolds = bagHolds + 1
end
check("with room for 40, Ready conjures 40 and stops, nothing lost", C_Item.GetItemCount(8079) == 40 and bagCasts == 4
  and bagHolds == 1 and not C.armed, bagCasts .. " casts in " .. bagHolds .. " holds")
check("saying the last one that fits, then that the bags are full", ErrorWith("Bags full: this is the last Crystal Water that fits.")
  and ChatWith("Your bags are full: no room for more Crystal Water. Ready is off.") == 1)
Click(P.readyButton)
check("and won't start again until there's room", not C.armed
  and ChatWith("Your bags are full: no room for more Crystal Water. Make room first.") == 1)
UI.Refresh()
check("the Ready bar says so", P.readyTitle.text == "Bags full" and P.readyDetail.text == "No room for more Crystal Water. Make room to conjure.",
  P.readyTitle.text)
if not BARE then
  ns.Refresh() RunTimers(0)
  check("and the click button has nothing to do", P.clickButton.attributes.type == nil and P.clickButton.full == ns.WATER[7])
end
BAG_SIZE = savedSizes
ClearBags()
ns.Profile().water[7] = 0

-- ---- Tidying loose stacks ---------------------------------------------------
if C.armed then C.Disarm() end
local B = ns.Bags
local function StacksOf(item)
  local list = {}
  for bag = 0, 4 do for slot = 1, 16 do local st = BAGS[bag][slot] if st and st.itemID == item then list[#list + 1] = st.stackCount end end end
  table.sort(list, function(a, b) return a > b end)
  return table.concat(list, ",")
end
local function LooseStacks()
  ClearBags()
  BAGS[0][1] = { itemID = 8079, stackCount = 7 }
  BAGS[0][2] = { itemID = 8079, stackCount = 20 }
  BAGS[0][3] = { itemID = 8079, stackCount = 5 }
  BAGS[0][4] = { itemID = 8079, stackCount = 14 }
  BAGS[1][1] = { itemID = 22895, stackCount = 3 }
  BAGS[1][2] = { itemID = 22895, stackCount = 4 }
end
local function Settle(times)
  for i = 1, times or 6 do fire("BAG_UPDATE_DELAYED") RunTimers(2) end
end
-- A conjure landing, the way the client reports it.
local function Conjured()
  CAST_N = CAST_N + 1
  fire("UNIT_SPELLCAST_SUCCEEDED", "player", "Cast-" .. CAST_N, 10140) RunTimers(0)
end
ns.db.tidy = true
Settle()
B.tidyWanted = false
LooseStacks()
Settle()
check("loose stacks alone aren't touched: nothing asked for a tidy", StacksOf(8079) == "20,14,7,5")
RemoveItems(8079, 1) fire("BAG_UPDATE_DELAYED") RunTimers(0)
Settle()
check("eating or drinking doesn't set it off", StacksOf(8079) == "20,13,7,5", StacksOf(8079))
LooseStacks()
logMark = #ConjurerLog.entries
Conjured()
Settle()
check("after a conjure, loose conjured stacks are merged into whole ones", StacksOf(8079) == "20,20,6" and StacksOf(22895) == "7", StacksOf(8079) .. " / " .. StacksOf(22895))
check("smallest onto biggest, one move at a time, each logged", LoggedSince("tidy: 5 Conjured Crystal Water onto 14")
  and LoggedSince("tidy: 3 Conjured Cinnamon Roll onto 4"))
check("nothing is left on the cursor", CURSOR == nil)
RemoveItems(8079, 1) fire("BAG_UPDATE_DELAYED") RunTimers(0)
RemoveItems(8079, 1) fire("BAG_UPDATE_DELAYED") RunTimers(0)
Settle()
check("once tidy, a drink or two afterwards leaves the stacks be", StacksOf(8079) == "20,18,6", StacksOf(8079))
-- Not while something else is going on.
LooseStacks()
ns.Profile().water[7] = 100
Click(P.readyButton)
Settle()
check("not while Ready is lit", C.armed and StacksOf(8079) == "20,14,7,5")
logMark = #ConjurerLog.entries
C.Disarm()
RunTimers(2)
check("once Ready is off, the tidy starts by itself", LoggedSince("tidy: 5 Conjured Crystal Water onto 14"))
Settle()
check("and finishes as the bags settle", StacksOf(8079) == "20,20,6")
ns.Profile().water[7] = 0
LooseStacks()
fire("TRADE_SHOW") RunTimers(0)
Settle()
check("not while a trade is open", StacksOf(8079) == "20,14,7,5")
TradeCancel() RunTimers(0)
Settle()
check("but once it closes", StacksOf(8079) == "20,20,6")
LooseStacks()
Conjured()
CASTING = true
Settle()
CASTING = false
check("not while casting", StacksOf(8079) == "20,14,7,5")
Settle()
check("and once the casting stops, the tidy asked for goes ahead", StacksOf(8079) == "20,20,6")
LooseStacks()
Conjured()
CURSOR = { kind = "spell", id = 1 }
Settle()
local stillHeld = CURSOR and CURSOR.kind == "spell" and CURSOR.id == 1
CURSOR = nil
check("not while something is on the cursor, which stays there", StacksOf(8079) == "20,14,7,5" and stillHeld)
B.tidyWanted = false
LooseStacks()
Conjured()
EnterCombatLockdown()
logMark = #ConjurerLog.entries
Settle()
COMBAT = false
check("not in combat, not even an attempt", StacksOf(8079) == "20,14,7,5" and not LoggedSince("tidy:"))
fire("PLAYER_REGEN_ENABLED") RunTimers(2)
Settle()
check("after the fight, the tidy asked for goes ahead", StacksOf(8079) == "20,20,6")
LooseStacks()
Conjured()
ns.db.tidy = false
Settle()
check("and never with Tidy switched off, even a move already on its way", StacksOf(8079) == "20,14,7,5")
ns.db.tidy = true
ClearBags()

-- Combat: Ready goes off before the lockdown.
ns.Profile().water[7] = C_Item.GetItemCount(8079) + 40
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
ns.Profile().water[7] = C_Item.GetItemCount(8079) + 4
ns.Profile().water[6] = 4
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
ns.Profile().water[6] = 0

-- The settings locked by the client: Ready still works, one cast per press.
LOCKED_CVARS.ActionButtonUseKeyHeldSpell = true
ns.Profile().water[7] = C_Item.GetItemCount(8079) + 8
Click(P.readyButton)
check("a locked setting doesn't stop Ready", C.armed and CVARS.ActionButtonUseKeyHeldSpell == "0")
check("it says to press once per cast", ChatWith("each press conjures once") == 1 and P.readyDetail.text:find("Hold to cast is off, so press once per cast", 1, true) ~= nil)
check("and the report says the client refused", ns.report["setting ActionButtonUseKeyHeldSpell"] == "the client refused to change it")
Click(P.readyButton)
LOCKED_CVARS.ActionButtonUseKeyHeldSpell = nil
ns.db.manageCVars = false
Click(P.readyButton)
check("with the option off the settings are left alone", CVARS.ActionButtonUseKeyHeldSpell == "0" and ns.db.savedCVars == nil)
Click(P.readyButton)
UI.Refresh()
check("and the Ready bar says hold to cast is off", P.readyDetail.text:find("Hold to cast is off in the game's options.", 1, true) ~= nil)
ns.db.manageCVars = true

-- The game's settings, shown and switched in Options.
UI.Refresh()
check("Options shows the game's settings as they stand", P.settingsState.text:find("Press and Hold Casting |cffff5555off|r", 1, true) ~= nil
  and P.settingsButton.shown)
ns.db.collapsed.options = true
UI.Refresh()
check("closed, Options says whether hold to cast is on", P.sections.options.header.Summary.text == "Press and Hold Casting off")
Click(P.settingsButton)
check("Turn both on turns them on for good", CVARS.ActionButtonUseKeyHeldSpell == "1" and ChatWith("Press and Hold Casting and Cast on Key Down are on.") == 1)
check("and the button goes", not P.settingsButton.shown and P.settingsState.text:find("Press and Hold Casting |cff66dd66on|r", 1, true) ~= nil)
ns.Profile().water[7] = C_Item.GetItemCount(8079) + 40
Click(P.readyButton)
Click(P.readyButton)
check("settings already on are left on by Ready", CVARS.ActionButtonUseKeyHeldSpell == "1" and ns.db.savedCVars == nil)
CVARS.ActionButtonUseKeyHeldSpell = "0"
LOCKED_CVARS.ActionButtonUseKeyHeldSpell = true
UI.Refresh()
Click(P.settingsButton)
check("refused, it says where to tick it", ChatWith("Tick Press and Hold Casting in Options > Combat") == 1 and CVARS.ActionButtonUseKeyHeldSpell == "0")
LOCKED_CVARS.ActionButtonUseKeyHeldSpell = nil
ns.db.leaveCVarsOn = true
Click(P.readyButton)
check("Ready turns them on", C.armed and CVARS.ActionButtonUseKeyHeldSpell == "1")
Click(P.readyButton)
check("with Leave them on ticked they stay on", CVARS.ActionButtonUseKeyHeldSpell == "1" and ns.db.savedCVars == nil)
ns.db.leaveCVarsOn = false
CVARS.ActionButtonUseKeyHeldSpell = "0"

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
check("filling from the group adds you and each share at its rank", ns.Profile().water[7] == 120 and ns.Profile().water[6] == 20
  and ns.Profile().food[7] == 80 and ns.Profile().food[6] == 20,
  ns.Profile().water[7] .. " " .. tostring(ns.Profile().water[6]) .. " " .. ns.Profile().food[7] .. " " .. tostring(ns.Profile().food[6]))
check("and says what it set", ChatWith("Targets set from your group: 120 Crystal Water, 20 Sparkling Water, 80 Cinnamon Roll, 20 Sweet Roll.") == 1)
check("ranks you left untouched are cleared", ns.Profile().water[5] == 0)
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
check("she shows as handed out, with how long until it's forgotten", ({ T.Status(members[1]) })[1] == "Handed out (30m)" and P.memberRows[1].button.text == "Again")
check("the Group section has the forget-after slider, at 30 minutes", P.sections.group.body.minutesSlider and P.sections.group.body.minutesSlider.Slider.value == 30)
RunTimers(20 * 60)
check("20 minutes on, 10 are left", ({ T.Status(members[1]) })[1] == "Handed out (10m)")
RunTimers(11 * 60)
check("after 30 minutes she's owed a share again", not ({ T.Status(members[1]) })[1]:find("Handed out", 1, true) and ns.db.handed["Player-70-E1"] == nil)
check("and the log says why", table.concat(ConjurerLog.entries, "\n"):find("forgot what Elyse was handed: 30 minutes passed", 1, true) ~= nil)
P.sections.group.body.minutesSlider.Slider:SetValue(0) RunTimers(0)
ns.db.handed["Player-70-E1"] = { water = 40, food = 20, name = "Elyse", t = time() - 99999 }
check("set to 0, a hand-out is kept until reset", ns.db.handedMinutes == 0 and ({ T.Status(members[1]) })[1] == "Handed out")
P.sections.group.body.minutesSlider.Slider:SetValue(30) RunTimers(0)
ns.db.handed["Player-70-E1"] = { water = 40, food = 20, name = "Elyse", t = time() }
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
check("a stranger's trade is not filled by itself", TRADE[1] == nil)
fire("TRADE_ACCEPT_UPDATE", 1, 0)
TradeComplete()
RunTimers(2)
check("or counted", ns.db.handed["Player-70-STRANGER"] == nil)
check("the trade window has a Give share button hanging under it", ConjurerTradeButton and ConjurerTradeButton.parent == TradeFrame
  and ConjurerTradeButton.points[1][2] == TradeFrame and ConjurerTradeButton.points[1][3] == "BOTTOMLEFT"
  and ConjurerTradeButton.text == "Conjurer: give share")
AddItems(22895, 20)
fire("TRADE_SHOW")
RunTimers(5)
Click(ConjurerTradeButton)
RunTimers(5)
check("its button gives a stranger their class's share by hand", TRADE[1] and TRADE[1].itemID == 22895 and TRADE[1].count == 20)
fire("TRADE_ACCEPT_UPDATE", 1, 0)
TradeComplete()
RunTimers(2)
check("and that trade is counted", ns.db.handed["Player-70-STRANGER"] and ns.db.handed["Player-70-STRANGER"].food == 20)
local tradeLog = table.concat(ConjurerLog.entries, "\n")
check("each fill says it started", tradeLog:find("fill for Wander starting", 1, true) ~= nil and tradeLog:find("fill for Elyse starting", 1, true) ~= nil)
-- The trade window reporting that it opened twice fills it once.
TRADE_PARTNER = "Player-70-E1"
ns.db.handed["Player-70-E1"] = nil
ClearBags()
AddItems(8079, 40)
AddItems(22895, 20)
fire("TRADE_SHOW")
fire("TRADE_SHOW")
RunTimers(5)
check("opened twice, it's filled once", TRADE[1] and TRADE[2] and TRADE[3] and not TRADE[4]
  and table.concat(ConjurerLog.entries, "\n"):find("fill for Elyse skipped: a fill is already running", 1, true) ~= nil)
TradeCancel()
RunTimers(2)

-- A fill that can't go ahead says why in the log.
TRADE_PARTNER = "Player-70-E1"
ns.db.handed["Player-70-E1"] = nil
fire("TRADE_SHOW")
TradeCancel()
RunTimers(5)
check("a trade closed before its fill says so", table.concat(ConjurerLog.entries, "\n"):find("fill for Elyse skipped: the trade closed first", 1, true) ~= nil)

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

-- Loose stacks are merged before a fill, so whole stacks go over.
TRADE_PARTNER = "Player-70-E1"
ns.db.handed["Player-70-E1"] = nil
ClearBags()
BAGS[0][1] = { itemID = 8079, stackCount = 13 }
BAGS[0][2] = { itemID = 8079, stackCount = 7 }
BAGS[0][3] = { itemID = 8079, stackCount = 20 }
BAGS[0][4] = { itemID = 22895, stackCount = 20 }
logMark = #ConjurerLog.entries
fire("TRADE_SHOW")
RunTimers(8)
check("before a fill, loose stacks of what's given are merged, so whole stacks go over", TRADE[1] and TRADE[2] and TRADE[3] and not TRADE[4]
  and TRADE[1].itemID == 8079 and TRADE[1].count == 20 and TRADE[2].itemID == 8079 and TRADE[2].count == 20 and TRADE[3].itemID == 22895,
  (TRADE[1] and TRADE[1].count or "-") .. " " .. (TRADE[2] and TRADE[2].count or "-") .. " " .. (TRADE[3] and TRADE[3].count or "-"))
check("the log says so", LoggedSince("trade: tidying stacks first") and LoggedSince("tidy: 7 Conjured Crystal Water onto 13 before the trade")
  and LoggedSince("fill for Elyse starting (stacks tidied)"))
check("nothing left on the cursor", CURSOR == nil)
TradeCancel() RunTimers(1)
-- Tidying switched off: the stacks go as they are.
ClearBags()
BAGS[0][1] = { itemID = 8079, stackCount = 13 }
BAGS[0][2] = { itemID = 8079, stackCount = 7 }
BAGS[0][3] = { itemID = 8079, stackCount = 20 }
BAGS[0][4] = { itemID = 22895, stackCount = 20 }
ns.db.tidy = false
fire("TRADE_SHOW")
RunTimers(8)
check("with tidying off, the stacks go as they are", TRADE[1] and TRADE[1].count == 20 and TRADE[2] and TRADE[2].count == 13
  and TRADE[3] and TRADE[3].count == 7 and TRADE[4] and TRADE[4].itemID == 22895)
TradeCancel() RunTimers(1)
ns.db.tidy = true
-- + Water merges first too.
TRADE_PARTNER = "Player-70-STRANGER"
ClearBags()
BAGS[0][1] = { itemID = 8079, stackCount = 13 }
BAGS[0][2] = { itemID = 8079, stackCount = 7 }
fire("TRADE_SHOW") RunTimers(1)
Click(ConjurerTradeWater) RunTimers(4)
check("+ Water merges loose stacks first and hands over a whole one", TRADE[1] and TRADE[1].itemID == 8079 and TRADE[1].count == 20 and not TRADE[2])
TradeCancel() RunTimers(1)
TRADE_PARTNER = "Player-70-E1"

-- The trade window's own row: a stack at a time, and clearing it.
TRADE_PARTNER = "Player-70-STRANGER"
ClearBags()
AddItems(8079, 20)
AddItems(8079, 13)
AddItems(22895, 20)
AddItems(3772, 20)
fire("TRADE_SHOW") RunTimers(5)
check("the trade window has + Water, + Food and Clear beside Give share", ConjurerTradeWater and ConjurerTradeFood and ConjurerTradeClear
  and ConjurerTradeWater.points[1][2] == ConjurerTradeButton and ConjurerTradeFood.points[1][2] == ConjurerTradeWater
  and ConjurerTradeClear.points[1][2] == ConjurerTradeFood)
Click(ConjurerTradeWater) RunTimers(3)
check("+ Water puts in your fullest stack of the best water they can use", TRADE[1] and TRADE[1].itemID == 8079 and TRADE[1].count == 20 and not TRADE[2])
Click(ConjurerTradeWater) RunTimers(3)
check("and again, the next stack", TRADE[2] and TRADE[2].itemID == 8079 and TRADE[2].count == 13)
Click(ConjurerTradeFood) RunTimers(3)
check("+ Food, a stack of food", TRADE[3] and TRADE[3].itemID == 22895 and TRADE[3].count == 20)
Click(ConjurerTradeClear) RunTimers(1)
local anyLocked = false
for bag = 0, 4 do for slot, st in pairs(BAGS[bag]) do if st.isLocked then anyLocked = true end end end
check("Clear takes it all back out, nothing left on the cursor or locked", next(TRADE) == nil and CURSOR == nil and not anyLocked
  and C_Item.GetItemCount(8079) == 33)
TradeCancel() RunTimers(1)
STRANGER.level = 30
fire("TRADE_SHOW") RunTimers(1)
Click(ConjurerTradeWater) RunTimers(3)
check("someone of level 30 gets the best water they can drink", TRADE[1] and TRADE[1].itemID == 3772)
TradeCancel() RunTimers(1)
STRANGER.level = 60

-- Strangers: their class's share, but no more than the amounts for strangers.
STRANGER.class = "PRIEST"
fire("TRADE_SHOW") RunTimers(1)
check("a stranger gets their class's share, no more than the amounts for strangers", T.ShareText(T.PartnerAsMember()) == "20 Crystal Water, 20 Cinnamon Roll",
  T.ShareText(T.PartnerAsMember()))
P.sections.shares.body.strangers.water.Slider:SetValue(10) RunTimers(0)
check("the strangers row sets those amounts", ns.db.strangers.water == 10 and T.ShareText(T.PartnerAsMember()) == "10 Crystal Water, 20 Cinnamon Roll")
check("a group member's share isn't capped", T.ShareText(members[1]) == "40 Crystal Water, 20 Cinnamon Roll", T.ShareText(members[1]))
TradeCancel() RunTimers(1)
Click(P.sections.shares.body.checks["And for strangers too"])
ns.db.handed["Player-70-STRANGER"] = nil
ns.db.autoFill = false
fire("TRADE_SHOW") RunTimers(5)
ns.db.autoFill = true
check("with And for strangers too ticked, a stranger's trade fills by itself", ns.db.strangers.autoFill and TRADE[1] and TRADE[1].itemID == 8079
  and TRADE[1].count == 10 and TRADE[2] and TRADE[2].itemID == 22895 and TRADE[2].count == 20)
fire("TRADE_ACCEPT_UPDATE", 1, 0)
TradeComplete()
RunTimers(2)
check("and is counted", ns.db.handed["Player-70-STRANGER"] and ns.db.handed["Player-70-STRANGER"].water == 10)
Click(P.sections.shares.body.checks["And for strangers too"])
ns.db.strangers.water = 20
ns.db.handed["Player-70-STRANGER"] = nil
STRANGER.class = "WARRIOR"

-- Conjuring with the trade open: it goes in as it arrives.
local function ConjureDuringTrade()
  CAST_N = CAST_N + 1
  fire("UNIT_SPELLCAST_START", "player", "Cast-" .. CAST_N, 10140) RunTimers(0)
  fire("UNIT_SPELLCAST_SUCCEEDED", "player", "Cast-" .. CAST_N, 10140) RunTimers(0)
  AddItems(8079, 5) fire("BAG_UPDATE_DELAYED") RunTimers(0.2)
  AddItems(8079, 5) fire("BAG_UPDATE_DELAYED") RunTimers(3)
end
ClearBags()
AddItems(8079, 15)
fire("TRADE_SHOW") RunTimers(1)
ConjureDuringTrade()
check("what you conjure with a trade open goes in, one slot even when it arrives in parts", TRADE[1] and TRADE[1].itemID == 8079
  and TRADE[1].count == 10 and not TRADE[2], TRADE[1] and TRADE[1].count)
check("the rest stays in your bags", C_Item.GetItemCount(8079) == 25 and CURSOR == nil)
TradeCancel() RunTimers(1)
ns.db.tradeConjure = false
fire("TRADE_SHOW") RunTimers(1)
ConjureDuringTrade()
check("with that switched off, it stays in your bags", next(TRADE) == nil)
TradeCancel() RunTimers(1)
ns.db.tradeConjure = true
-- A stack of exactly what was conjured goes in whole, with no split.
ClearBags()
AddItems(8079, 20)
fire("TRADE_SHOW") RunTimers(1)
logMark = #ConjurerLog.entries
ConjureDuringTrade()
check("a new stack of exactly what was conjured goes in whole", TRADE[1] and TRADE[1].count == 10 and not LoggedSince("split 10"))
TradeCancel() RunTimers(1)
ns.db.tradeConjure = true
ConjureDuringTrade()
check("and with no trade open nothing happens", next(TRADE) == nil)

-- Player tooltips: what Conjurer would hand them.
local function Hover(unit)
  TIP_LINES = {}
  HOVER_UNIT = unit
  for _, c in ipairs(TOOLTIP_CALLS) do if c.kind == Enum.TooltipDataType.Unit then c.fn(GameTooltip, { guid = UnitGUID(unit) }) end end
  HOVER_UNIT = nil
  return table.concat(TIP_LINES, "\n")
end
check("player tooltips are hooked the client's way", ns.report["player tooltips"] == "TooltipDataProcessor")
ns.db.handed["Player-70-E1"] = nil
check("a group member's tooltip shows their share", Hover("party1") == "Conjurer: 40 Crystal Water, 20 Cinnamon Roll", Hover("party1"))
ns.db.handed["Player-70-E1"] = { water = 40, food = 20, name = "Elyse", t = time() }
check("and once handed out, how long until it's forgotten", Hover("party1") == "Conjurer: 40 Crystal Water, 20 Cinnamon Roll (handed out, 30m left)", Hover("party1"))
ns.db.handed["Player-70-E1"] = nil
TRADE_PARTNER = "Player-70-STRANGER"
check("a stranger's shows theirs, up to the amounts for strangers", Hover("NPC") == "Conjurer: 20 Cinnamon Roll", Hover("NPC"))
STRANGER.class = "PRIEST"
check("a priest stranger gets 20 water, not a priest's 40", Hover("NPC") == "Conjurer: 20 Crystal Water, 20 Cinnamon Roll", Hover("NPC"))
STRANGER.class = "MAGE"
check("someone with no share gets no line", Hover("NPC") == "")
STRANGER.class = "WARRIOR"
ns.db.tooltip = false
check("and none at all with the option off", Hover("party1") == "")
ns.db.tooltip = true

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

-- ---- Profiles -------------------------------------------------------------
RAID, GROUP = false, {}
UI.Show() RunTimers(0)
fire("GROUP_ROSTER_UPDATE") RunTimers(0)
check("alone again, the profile goes back to Solo", ns.ProfileKey() == "solo" and ChatWith("Profile: Solo.") == 1)
local strip, box = P.tabStrip, P.targetsBox
local function TopOf(f) return -f.points[1][5] end
local function SharesTop() return TopOf(P.sections.shares.header) end
local foodBody = P.sections.food.body
check("Water and Food sit in their own inset", ns.report["targets box"] == "InsetFrameTemplate" and box.NineSlice ~= nil)
check("the box wraps them with a margin", TopOf(box) + 6 == TopOf(P.sections.water.header) and TopOf(box) + box.h == TopOf(foodBody) + foodBody.h + 6 and P.sections.water.header.points[1][4] == 6 and P.sections.food.body.points[2][4] == -6)
check("sections outside the box keep the full width", P.sections.shares.header.points[1][4] == 0)
check("eight profile tabs hang from its bottom border", #P.tabs == 8 and P.tabs[1].text == "Solo" and P.tabs[8].text == "AV 40" and P.tabs[1].points[1][2] == box and P.tabs[1].points[1][3] == "BOTTOMLEFT" and P.tabs[1].points[1][4] == 8 and P.tabs[1].points[1][5] == 1)
local function BorderOverTabs()
  for _, tab in ipairs(P.tabs) do if not (box.NineSlice:GetFrameLevel() > tab:GetFrameLevel()) then return false end end
  return true
end
check("the box's border is drawn over every tab, so their tops rest under it", BorderOverTabs())
check("side by side, 3 apart, not overlapping", P.tabs[2].points[1][1] == "LEFT" and P.tabs[2].points[1][2] == P.tabs[1] and P.tabs[2].points[1][4] == 3)
check("in Blizzard's tab template", ns.report["profile tabs"] == "PanelTabButtonTemplate" and #strip.Tabs == 8)
check("Solo's tab is the selected one", SelectedTab() == 1)
local tabW = P.tabs[1].w
local rowRight = 8 + 8 * tabW + 7 * 3
check("spread evenly across the whole width at full size", tabW >= 72 and P.tabs[8].w == tabW and rowRight <= P.content.w and rowRight >= P.content.w - 11, tabW .. " " .. rowRight)
check("the selected tab sits above its neighbours", P.tabs[1].level > P.tabs[2].level)
check("the next section starts below the tabs", SharesTop() >= TopOf(box) + box.h + 32)
ns.db.collapsed.food = true
UI.Refresh()
check("with Food closed, the box ends under its header and the tabs follow", TopOf(box) + box.h == TopOf(P.sections.food.header) + 26 + 6 and SharesTop() >= TopOf(box) + box.h + 32)
ns.db.collapsed.food = false
UI.Refresh()
check("each profile has its own amounts at your best rank", ns.Profile("party").food[7] ~= nil and ns.Profile("raid40").water[7] == 300
  and ns.Profile("bg40").water[7] == 240 and ns.Profile("bg10").food[7] == 60)
local soloWater = ns.Profile("solo").water[7]
GROUP = { { unit = "party1", guid = "Q1", name = "Quen", level = 60, class = "PRIEST" } }
fire("GROUP_ROSTER_UPDATE") RunTimers(0)
check("joining a party, Ready conjures Party's amounts", ns.ProfileKey() == "party" and SelectedTab() == 2 and ChatWith("Profile: Party.") >= 1)
check("and its tab carries the in-use check", P.tabs[2].inUse.shown and not P.tabs[1].inUse.shown)
ns.Profile().water[7] = 100
UI.Refresh()
check("the rows show Party's targets", P.rankRows.water[1].slider.Slider.value == 100)
P.rankRows.water[1].slider.Slider:SetValue(140) RunTimers(0)
check("a slider changes the profile shown and no other", ns.Profile("party").water[7] == 140 and ns.Profile("solo").water[7] == soloWater)
local function RaidOf(n)
  GROUP = {}
  for i = 1, n - 1 do GROUP[i] = { unit = "raid" .. i, guid = "R" .. i, name = "R" .. i, level = 60, class = "MAGE" } end
  RAID = true
  fire("GROUP_ROSTER_UPDATE") RunTimers(0)
end
RaidOf(8)
check("a raid of 8 is Raid 10", ns.ProfileKey() == "raid10")
RaidOf(14)
check("a raid of 14 is Raid 20", ns.ProfileKey() == "raid20")
RaidOf(25)
check("a raid of 25 is Raid 40", ns.ProfileKey() == "raid40" and SelectedTab() == 5 and P.tabs[5].inUse.shown)
-- A tab you click shows its amounts to set; Ready keeps to your group's size (the user's report:
-- a tab left open was what got conjured).
local raid40Water = ns.Profile("raid40").water[7]
Click(P.tabs[1])
check("clicking a tab shows that profile's amounts", SelectedTab() == 1 and P.rankRows.water[1].slider.Slider.value == soloWater)
check("but Ready still conjures your group's", ns.ProfileKey() == "raid40" and ns.Target(ns.WATER[7]) == raid40Water)
check("the in-use check stays on your group's tab", P.tabs[5].inUse.shown and not P.tabs[1].inUse.shown)
check("the border stays over the newly raised tab", BorderOverTabs())
check("and the Ready line says which amounts are shown", P.readyDetail.text:find("(Raid 40).", 1, true) ~= nil
  and P.readyDetail.text:find("Showing Solo's amounts.", 1, true) ~= nil, P.readyDetail.text)
P.rankRows.water[1].slider.Slider:SetValue(55) RunTimers(0)
check("its sliders set that profile, not the one in use", ns.Profile("solo").water[7] == 55 and ns.Profile("raid40").water[7] == raid40Water)
ns.Profile("solo").water[7] = soloWater
RaidOf(30)
check("while the raid stays the same size, the tab you're looking at stays", SelectedTab() == 1)
Click(P.tabs[5])
check("clicking your group's tab again follows the group", UI.viewKey == nil and SelectedTab() == 5)
Click(P.tabs[1])
RaidOf(12)
check("when the raid changes size the window shows the new profile", ns.ProfileKey() == "raid20" and SelectedTab() == 4)
INSTANCE = { inside = true, kind = "pvp", max = 10 }
RaidOf(10)
check("Warsong Gulch, 10 a side, is BG 10", ns.ProfileKey() == "bg10")
INSTANCE.max = 15
fire("ZONE_CHANGED_NEW_AREA") RunTimers(0)
check("Arathi Basin, 15 a side, is BG 20", ns.ProfileKey() == "bg20")
INSTANCE.max = 40
fire("PLAYER_ENTERING_WORLD") RunTimers(0)
check("Alterac Valley, 40 a side, is AV 40", ns.ProfileKey() == "bg40" and SelectedTab() == 8)
INSTANCE.max = 0
RaidOf(9)
check("a battleground that gives no size goes by the group", ns.ProfileKey() == "bg10")
INSTANCE = { inside = true, kind = "raid", max = 40 }
RaidOf(35)
check("a raid instance is a raid, not a battleground", ns.ProfileKey() == "raid40")
INSTANCE = nil
RAID, GROUP = false, {}
fire("GROUP_ROSTER_UPDATE") RunTimers(0)
check("out and alone, back to Solo", ns.ProfileKey() == "solo" and ns.Profile().water[7] == soloWater)
-- The user's case: solo, with the Raid 40 tab open, Ready conjures Solo's amounts.
ns.Profile("solo").water[7] = C_Item.GetItemCount(8079) + 10
ns.Profile("raid40").water[7] = C_Item.GetItemCount(8079) + 100
Click(P.tabs[5])
Click(P.readyButton)
check("solo with the Raid 40 tab open, Ready conjures Solo's amounts", C.armed and C.working == ns.WATER[7]
  and ns.Target(C.working) == C_Item.GetItemCount(8079) + 10 and P.readyDetail.text:find("(Solo)", 1, true) ~= nil, P.readyDetail.text)
C.Disarm()
ns.Profile("solo").water[7] = soloWater
-- Off: a tab you click is what Ready conjures, and it stays put when the group changes.
local groupSize = P.sections.options.body.checks["Conjure for your group's size"]
Click(groupSize)
check("switched off, Ready keeps the profile it was on", not ns.db.profileAuto and ns.ProfileKey() == "solo" and SelectedTab() == 1)
GROUP = { { unit = "party1", guid = "Q1", name = "Quen", level = 60, class = "PRIEST" } }
fire("GROUP_ROSTER_UPDATE") RunTimers(0)
check("and stays put when your group changes", ns.ProfileKey() == "solo")
Click(P.tabs[5])
check("a tab you click is then what Ready conjures", ns.ProfileKey() == "raid40" and SelectedTab() == 5 and P.tabs[5].inUse.shown)
Click(groupSize)
check("on again, Ready goes back to your group's size", ns.db.profileAuto and ns.ProfileKey() == "party" and SelectedTab() == 2)
GROUP = {}
fire("GROUP_ROSTER_UPDATE") RunTimers(0)
ns.Profile("raid40").water[7] = C_Item.GetItemCount(8079) + 100
RaidOf(25)
UI.Refresh()
check("Ready works to your group's profile", P.readyDetail.text:find("Crystal Water, %d+ of " .. ns.Profile("raid40").water[7] .. " %(Raid 40%)") ~= nil, P.readyDetail.text)
check("the log has the switches", table.concat(ConjurerLog.entries, "\n"):find("profile: Raid 40 (picked)", 1, true) ~= nil
  and table.concat(ConjurerLog.entries, "\n"):find("profile: AV 40 (your group)", 1, true) ~= nil)
RAID, GROUP = false, {}
fire("GROUP_ROSTER_UPDATE") RunTimers(0)
check("the debug report names the profile", table.concat(ns.DebugReport(), "\n"):find("profile: Solo; follows your group: true; your group now: Solo", 1, true) ~= nil)

-- ---- The quick access bar: always shown, and the progress bars -----------------------
ClearBags()
AddItems(8079, 40)
AddItems(22895, 20)
ns.Profile().water[7] = 60
ns.Profile().food[7] = 20
ns.db.alert.always = false
fire("BAG_UPDATE_DELAYED") RunTimers(0)
UI.Refresh()
check("the section is the quick access bar", P.sections.alert.header.Name.text == "Quick access bar", P.sections.alert.header.Name.text)
check("with plenty of both and Only when low, it stays away", not ConjurerAlert.shown and P.sections.alert.body.show.low.checked
  and not P.sections.alert.body.show.always.checked)
Click(P.sections.alert.body.show.always)
check("set to Always, it's on screen with nothing low", ns.db.alert.always and ConjurerAlert.shown and ConjurerAlertWater:IsVisible()
  and ConjurerAlertFood:IsVisible() and P.sections.alert.body.show.always.checked and not P.sections.alert.body.show.low.checked)
check("with its counts, and no glow", tostring(ConjurerAlertWater.count.text) == "40" and not ConjurerAlertWater.glow.shown)
TIP_LINES = {}
ConjurerAlertWater.scripts.OnEnter(ConjurerAlertWater)
check("its tooltip doesn't call plenty low", GameTooltip.text == "Conjured water" and (TIP_LINES[1] or ""):find("^40 .- in your bags%.$") ~= nil
  and TIP_LINES[2] == "Low is fewer than 20: the icon glows then.", tostring(GameTooltip.text) .. " / " .. tostring(TIP_LINES[1]))
check("and the play button and cog", ConjurerAlertPlay:IsVisible() and ConjurerAlertSettings:IsVisible())
check("a progress bar under it says how far the conjuring has got", ConjurerAlertProgress and ConjurerAlertProgress:IsVisible()
  and ConjurerAlertProgress.text.text == "60 of 80 (75%)" and ConjurerAlertProgress.value == 0.75, ConjurerAlertProgress and ConjurerAlertProgress.text.text)
check("as does the one in the window, with the profile", P.progress and P.progress.text.text == "Solo: 60 of 80 (75%)" and P.progress.value == 0.75,
  P.progress and P.progress.text.text)
local AP = ConjurerAlertProgress
if BARE then
  check("without the art, the progress bars are plain", AP.art == "plain" and P.progress.art == "plain" and AP.status.value == 0.75)
else
  check("the progress bars are the professions book's skill bar, with alchemy's liquid", AP.art:find("skill bar (Skillbar_Fill_Flipbook_Alchemy_c60", 1, true) == 1
    and AP.fill.atlas == "Skillbar_Fill_Flipbook_Alchemy_c60" and P.progress.fill.atlas == "Skillbar_Fill_Flipbook_Alchemy_c60", AP.art)
  local flip = AP.anim.anims[1]
  check("the fill flows once, a flipbook at the book's rate, then rests on its last frame", AP.anim.playing and AP.anim.looping == "NONE"
    and AP.anim.toFinal == true and flip.animKind == "FlipBook" and flip.rows == 30 and flip.frames == 60 and flip.duration == 2)
  AP.anim.playing = false
  AP:Refresh()
  check("a refresh that changes nothing leaves it resting", not AP.anim.playing)
  AP:SetProgress(61, 80)
  check("it flows again when the bar moves", AP.anim.playing)
  AP:Refresh()
  AP.anim.playing = false
  AP:Hide() AP:Show()
  check("and when it comes into view", AP.anim.playing)
  AP.anim.playing = false
  AP.scripts.OnEnter(AP)
  check("hovered, it flows round and round", AP.anim.playing and AP.anim.looping == "REPEAT")
  AP.scripts.OnLeave(AP)
  check("left, it finishes the pass it's on and rests", AP.anim.looping == "NONE")
  P.progress.anim.playing = false
  P.progress.scripts.OnEnter(P.progress)
  check("the window's bar too", P.progress.anim.playing and P.progress.anim.looping == "REPEAT")
  P.progress:Hide()
  check("and it stops going round if it's hidden while hovered", P.progress.anim.looping == "NONE")
  P.progress:Show()
  GameTooltip:Hide()
  AP.anim.playing = false
  RunTimers(31)
  check("and again now and then, after a random wait of up to half a minute", AP.anim.playing)
  AP.anim.playing = false
  RunTimers(31)
  check("and again after that", AP.anim.playing)
  AP.anim.playing = false
  AP:Hide()
  RunTimers(31)
  check("but not while it's out of sight", not AP.anim.playing)
  RunTimers(31)
  check("nor waits on in the background", not AP.anim.playing)
  AP:Show()
  check("until it's back", AP.anim.playing)
  -- The waits made certain: the shortest, then the longest.
  local random = math.random
  math.random = function(a, b) return a end
  AP:Flow()
  AP.anim.playing = false
  RunTimers(11.9)
  check("never sooner than 12 seconds", not AP.anim.playing)
  RunTimers(0.2)
  check("then it flows", AP.anim.playing)
  math.random = function(a, b) return b end
  AP:Flow() AP:Flow() AP:Flow()
  local plays = AP.anim.plays
  RunTimers(30)
  check("a newer wait cancels the older ones: one flow, not three", AP.anim.plays == plays + 1, AP.anim.plays - plays)
  Click(P.readyButton)
  check("Ready lighting up flows it at once", C.armed and AP.anim.plays == plays + 2, AP.anim.plays - plays)
  plays = AP.anim.plays
  RunTimers(6)
  check("and while you're conjuring it flows every few seconds", AP.anim.plays == plays + 1 and P.progress.anim.plays > 0, AP.anim.plays - plays)
  RunTimers(6)
  check("again and again", AP.anim.plays == plays + 2, AP.anim.plays - plays)
  Click(P.readyButton)
  RunTimers(6)
  plays = AP.anim.plays
  RunTimers(29)
  check("Ready off, it's back to waiting up to half a minute", not C.armed and AP.anim.plays == plays, AP.anim.plays - plays)
  RunTimers(1)
  check("and flows at the end of it", AP.anim.plays == plays + 1, AP.anim.plays - plays)
  math.random = random
  check("cut by its mask to the progress, as the book cuts it", math.abs(AP.mask.w - (40 * 0.75 - 7)) < 0.001
    and AP.fill.mask == AP.mask and math.abs(P.progress.mask.w - (100 * 0.75 - 7)) < 0.001, AP.mask.w)
  check("with the flare riding its edge while it fills", AP.flare.shown and AP.flare.mask == AP.mask and AP.flare.atlas == "Skillbar_Flare_Alchemy_c60")
  check("as tall as the book's, its letters the book's size", AP.h == 23 and P.progress.h == 23
    and AP.text.font == "GameFontHighlightOutline" and P.progress.text.font == "GameFontHighlightOutline")
  check("its frame and background keep their round ends on a long bar", AP.art:find("frame in three pieces", 1, true) ~= nil)
  local pieces, leftEnds = 0, 0
  for _, tex in ipairs(TEXTURES) do
    local tc = tex.texCoord
    if tex.parent == P.progress and tex.texture == 8164391 and tc then
      pieces = pieces + 1
      -- The left end is the art's first 8 of its 374 across.
      if tc[1] == 119 / 512 and math.abs(tc[2] - 127 / 512) < 1e-9 then leftEnds = leftEnds + 1 end
    end
  end
  check("cut from the art's own place in its file", pieces == 6 and leftEnds == 2, pieces .. " pieces, " .. leftEnds .. " left ends")
end
Click(P.readyButton)
check("Ready lit from the window lights the bar's Ready button too", C.armed and ConjurerAlertPlay.glow.shown and ConjurerAlertPlay.anim.playing)
Click(P.readyButton)
check("and it goes out with it", not C.armed and not ConjurerAlertPlay.glow.shown and not ConjurerAlertPlay.anim.playing)
AddItems(8079, 20)
fire("BAG_UPDATE_DELAYED") RunTimers(0)
UI.Refresh()
check("both fill as you conjure", ConjurerAlertProgress.text.text == "80 of 80 (100%)" and P.progress.text.text == "Solo: 80 of 80 (100%)")
check("full, the count turns green and the flare goes", AP.text.color[1] == 0.5 and AP.text.color[2] == 1 and (BARE or not AP.flare.shown))
local AL = P.sections.alert.body
check("the bar and its count are on to start", AL.progressCheck.checked and AL.progressTextCheck.checked and ConjurerAlertProgress.text.shown)
Click(AL.progressTextCheck)
check("the count can be taken off the bar, leaving the bar", not ns.db.alert.progressText and ConjurerAlertProgress:IsVisible()
  and not ConjurerAlertProgress.text.shown)
check("the window's bar keeps its count", P.progress.text.shown ~= false)
Click(AL.progressCheck)
check("and the bar can go altogether", not ns.db.alert.progress and not ConjurerAlertProgress.shown and ConjurerAlert.shown)
fire("BAG_UPDATE_DELAYED") RunTimers(0)
check("and stays gone as the bags change", not ConjurerAlertProgress.shown)
Click(AL.progressCheck)
Click(AL.progressTextCheck)
check("both back on", ConjurerAlertProgress:IsVisible() and ConjurerAlertProgress.text.shown and ConjurerAlertProgress.text.text == "80 of 80 (100%)")
check("the bar sits in the bag window's panel, as ShardGrid's windows do", ConjurerAlertBorder and ConjurerAlertBorder:IsVisible() and AL.frameCheck.checked
  and (ConjurerAlertBorder.template == "DefaultPanelFlatTemplate" or (BARE and ns.report["alert frame"] ~= "DefaultPanelFlatTemplate")), ns.report["alert frame"])
check("titled Conjurer", BARE or ConjurerAlertBorder.TitleContainer.TitleText.text == "Conjurer")
check("round its icons and its progress bar, under the title bar", ConjurerAlertBorder.points[1][2] == ConjurerAlert
  and math.abs(ConjurerAlertBorder.points[1][4] - (-10 - 6 * 74 / 65)) < 1e-9 and ConjurerAlertBorder.points[1][5] == 27
  and ConjurerAlertBorder.points[2][2] == ConjurerAlertProgress and math.abs(ConjurerAlertBorder.points[2][4] - (8 + 4 * 74 / 65)) < 1e-9
  and ConjurerAlertBorder.points[2][5] == -9)
check("too short for its metal corners, it's drawn at their size and shrunk", math.abs(ConjurerAlertBorder:GetScale() - 65 / 74) < 1e-9,
  ConjurerAlertBorder:GetScale())
check("under the icons, which take the clicks, its background taking a drag", ConjurerAlertBorder.level + 1 < ConjurerAlert:GetFrameLevel()
  and (BARE or ConjurerAlertBorder.NineSlice.level == ConjurerAlertBorder.level + 1)
  and ConjurerAlertBorder.scripts.OnDragStart ~= nil)
local fit = 65 / 74
check("its cog is ShardGrid's, in the title bar's right end", ConjurerAlertSettings.points[1][1] == "TOPRIGHT"
  and ConjurerAlertSettings.points[1][2] == ConjurerAlertBorder and math.abs(ConjurerAlertSettings.points[1][4] + 5 * fit) < 1e-9
  and math.abs(ConjurerAlertSettings.points[1][5] + 3 * fit) < 1e-9 and ConjurerAlertSettings.w == 20
  and (BARE or ConjurerAlertSettings.art.atlas == "common-dropdown-a-button-settings"))
local rowW = ConjurerAlert.w
check("so the row ends at the Ready button", rowW == ConjurerAlertPlay.points[1][4] + 40, rowW)
Click(AL.frameCheck)
check("the border and background can go, keeping the icons, buttons and bar", not ns.db.alert.frame and not ConjurerAlertBorder.shown
  and ConjurerAlertWater:IsVisible() and ConjurerAlertPlay:IsVisible() and ConjurerAlertSettings:IsVisible() and ConjurerAlertProgress:IsVisible())
-- The cog family's art shows from 1 to 21 of its 27 square, down.
local artShown, artTop = 20 * 20 / 27, 20 / 27
check("the cog then ends the row, what shows of it in the middle of the icons", ConjurerAlertSettings.points[1][2] == ConjurerAlert
  and ConjurerAlertSettings.points[1][4] == rowW + 2 + 2 and ConjurerAlertSettings.w == 20
  and math.abs((-ConjurerAlertSettings.points[1][5] + artTop) - (40 - artShown) / 2) < 1e-9
  and math.abs(ConjurerAlert.w - (ConjurerAlertSettings.points[1][4] + 20 * 23 / 27)) < 1e-9, ConjurerAlert.w)
check("the row, and so the progress bar, ends where the cog's art does", math.abs(ConjurerAlert.w - (rowW + 2 + 2 + 20 * 23 / 27)) < 1e-9
  and ConjurerAlertProgress.points[2][2] == ConjurerAlert and ConjurerAlertProgress.points[2][4] == 2)
fire("BAG_UPDATE_DELAYED") RunTimers(0)
check("and stay gone as the bags change", not ConjurerAlertBorder.shown and ConjurerAlert.shown)
Click(AL.frameCheck)
check("and come back", ns.db.alert.frame and ConjurerAlertBorder.shown and AL.frameCheck.checked)
check("with the cog back in the title bar", ConjurerAlertSettings.points[1][2] == ConjurerAlertBorder and ConjurerAlert.w == rowW)
local titleText = function() return ConjurerAlertBorder.TitleContainer.TitleText.text end
if not BARE then
  check("the title says Conjurer to start", titleText() == "Conjurer" and not AL.titleProgressCheck.checked)
  Click(AL.titleProgressCheck)
  check("or the progress count, green once it's full", ns.db.alert.titleProgress and titleText() == "|cff80ff8080 of 80 (100%)|r", titleText())
  RemoveItems(8079, 20)
  fire("BAG_UPDATE_DELAYED") RunTimers(0)
  check("kept up to date as the bags change", titleText() == "60 of 80 (75%)" and ConjurerAlertProgress.text.text == "60 of 80 (75%)", titleText())
  check("the debug report says so", table.concat(ns.DebugReport(), "\n"):find("count in its title", 1, true) ~= nil)
  Click(AL.titleProgressCheck)
  check("and back to Conjurer", not ns.db.alert.titleProgress and titleText() == "Conjurer")
  AddItems(8079, 20)
  fire("BAG_UPDATE_DELAYED") RunTimers(0)
end
check("full size to start", ns.db.alert.scale == 100 and ConjurerAlert:GetScale() == 1 and AL.scaleSlider ~= nil)
ConjurerAlert.GetLeft = function() return 300 end
ConjurerAlert.GetTop = function() return 600 end
AL.scaleSlider.Slider:SetValue(150)
check("the size slider scales it", ns.db.alert.scale == 150 and ConjurerAlert:GetScale() == 1.5, ConjurerAlert:GetScale())
local pt = ConjurerAlert.points[1]
check("keeping its top left corner where it was on screen", pt[1] == "TOPLEFT" and pt[3] == "BOTTOMLEFT"
  and math.abs(pt[4] - 200) < 1e-9 and math.abs(pt[5] - 400) < 1e-9 and ns.db.alert.point[1] == "TOPLEFT")
AL.scaleSlider.Slider:SetValue(100)
ConjurerAlert.GetLeft, ConjurerAlert.GetTop = nil, nil
check("and back", ConjurerAlert:GetScale() == 1)
Click(AL.progressCheck)
check("the progress bar reaches 2 past the row, its frame in line with the icons' edges", ConjurerAlertProgress.points[1][4] == -2
  and ConjurerAlertProgress.points[2][4] == 2)
check("without the progress bar the frame closes up under the icons", ConjurerAlertBorder.points[2][2] == ConjurerAlert
  and math.abs(ConjurerAlertBorder.points[2][4] - (8 + 6 * 74 / 40)) < 1e-9
  and math.abs(ConjurerAlertBorder:GetScale() - 40 / 74) < 1e-9)
Click(AL.progressCheck)
check("and opens again for it", ConjurerAlertBorder.points[2][2] == ConjurerAlertProgress and math.abs(ConjurerAlertBorder:GetScale() - 65 / 74) < 1e-9)
check("the debug report says how the bar is dressed", table.concat(ns.DebugReport(), "\n"):find(", frame on (", 1, true) ~= nil)
AddItems(8079, 20)
fire("BAG_UPDATE_DELAYED") RunTimers(0)
UI.Refresh()
check("more than a target doesn't count past it", ConjurerAlertProgress.text.text == "80 of 80 (100%)" and P.progress.value == 1)
check("the section sums it up", ns.Alert.Summary():find("^always shown, water below 20") ~= nil, ns.Alert.Summary())
ns.Profile().water[7] = 0
ns.Profile().food[7] = 0
UI.Refresh() fire("BAG_UPDATE_DELAYED") RunTimers(0)
check("with no targets it says so", P.progress.text.text == "Solo: Nothing to conjure" and ConjurerAlertProgress.text.text == "Nothing to conjure")
check("and shows no fill", BARE or (not AP.fill.shown and not AP.flare.shown))
EnterCombatLockdown() fire("PLAYER_REGEN_DISABLED") RunTimers(0) fire("BAG_UPDATE_DELAYED") RunTimers(0)
check("Always still keeps to the combat choice: out of combat only by default", not ConjurerAlert.shown)
COMBAT = false fire("PLAYER_REGEN_ENABLED") RunTimers(0) fire("BAG_UPDATE_DELAYED") RunTimers(0)
check("and it's back after the fight", ConjurerAlert.shown)
Click(P.sections.alert.body.show.low)
check("back to Only when low, it goes", not ns.db.alert.always and not ConjurerAlert.shown)

-- ---- Odds and ends ------------------------------------------------------
ns.Profile().water[7] = C_Item.GetItemCount(8079) + 20
ConjurerMinimapButton.scripts.OnClick(ConjurerMinimapButton, "RightButton")
check("right-clicking the minimap button lights Ready", C.armed)
ConjurerMinimapButton.scripts.OnClick(ConjurerMinimapButton, "RightButton")
RunTimers(0)
check("and puts it out, light and pulse", not C.armed and not ConjurerMinimapButton.lit.shown and not ConjurerMinimapButton.pulse.playing)
ConjurerMinimapButton.scripts.OnClick(ConjurerMinimapButton, "LeftButton")
check("left click closes the window", ConjurerFrame.shown == false)
SlashCmdList.CONJURER("ready")
check("/conjure ready works too", C.armed)
SlashCmdList.CONJURER("ready")
SlashCmdList.CONJURER("debug")
check("/conjure debug prints the report", ChatWith("Conjurer 1.3.1 debug report") == 1 and ChatWith("refused actions: none") == 1)
check("the report names the borrowed button", ChatWith("button to borrow: Action Bar") == 1)
check("nothing was refused in the whole run", #ns.refused == 0)
fire("ADDON_ACTION_FORBIDDEN", "Conjurer", "UNKNOWN()")
check("a refused action is logged with its stage", #ns.refused == 1 and ns.refused[1].stage ~= nil)
fire("ADDON_ACTION_FORBIDDEN", "SomeOtherAddon", "UNKNOWN()")
check("another addon's is not", #ns.refused == 1)

-- ---- The low food and water alert --------------------------------------------
if C.armed then C.Disarm() end
UI.Show() RunTimers(0)
local Al = ns.Alert
ClearBags()
AddItems(8079, 40)
AddItems(22895, 20)
fire("BAG_UPDATE_DELAYED") RunTimers(0)
check("with plenty of both no alert shows", ConjurerAlert == nil or not ConjurerAlert.shown)
ClearBags()
AddItems(8079, 5)
AddItems(22895, 20)
PLAYED = {}
fire("BAG_UPDATE_DELAYED") RunTimers(0)
check("low on water, the water alert shows", ConjurerAlertWater:IsVisible() and not ConjurerAlertFood:IsVisible())
check("with how many are left", tostring(ConjurerAlertWater.count.text) == "5")
check("its icon is the best water", ConjurerAlertWater.icon.texture == "itemicon:8079")
TIP_LINES = {}
ConjurerAlertWater.scripts.OnEnter(ConjurerAlertWater)
check("and its tooltip says it's low", GameTooltip.text == "Conjured water is low" and (TIP_LINES[1] or ""):find("^Only 5 .- left%.$") ~= nil,
  tostring(GameTooltip.text) .. " / " .. tostring(TIP_LINES[1]))
check("and the proc glow", ConjurerAlertWater.glow.shown and ConjurerAlertWater.anim.playing)
local CONJ_W = ConjurerAlertConjure and 42 or 0
check("the alert is one icon wide, plus its buttons, 2 apart like the action bars", ConjurerAlert.w == 40 + 2 + CONJ_W + 40, ConjurerAlert.w)
check("with a Ready button and a cog", ConjurerAlertPlay:IsVisible() and ConjurerAlertSettings:IsVisible())
check("the Ready button is the window's, as big as the icons, play over it", ConjurerAlertPlay.w == 40
  and ((ConjurerAlertPlay.play.shown and ConjurerAlertPlay.play.atlas == "charactercreate-customize-playbutton"
    and ConjurerAlertSettings.art.atlas == "common-dropdown-a-button-settings")
  or (BARE and ConjurerAlertPlay.playText.shown and ConjurerAlertPlay.playText.text == "Start")))
check("not lit while Ready is off", not ConjurerAlertPlay.glow.shown)
check("no sound unless asked for", not Played(3175))
check("the log says when it came up", table.concat(ConjurerLog.entries, "\n"):find("alert: water low, 5 left (alert below 20)", 1, true) ~= nil)
ClearBags()
AddItems(5350, 44)
AddItems(22895, 20)
fire("BAG_UPDATE_DELAYED") RunTimers(0)
check("a pile of rank 1 water doesn't hide that the best rank is out", ConjurerAlertWater:IsVisible() and tostring(ConjurerAlertWater.count.text) == "0")
Click(P.sections.alert.body.lowerRanks)
check("unless lower ranks count too", ns.db.alert.lowerRanks == true and not ConjurerAlert.shown)
Click(P.sections.alert.body.lowerRanks)
check("off again, only the best rank counts", ns.db.alert.lowerRanks == false and ConjurerAlertWater:IsVisible())
ClearBags()
AddItems(8079, 5)
fire("BAG_UPDATE_DELAYED") RunTimers(0)
check("both low, both show, water first", ConjurerAlertWater.shown and ConjurerAlertFood.shown and ConjurerAlert.w == 82 + 2 + CONJ_W + 40
  and ConjurerAlertWater.points[1][4] == 0 and ConjurerAlertFood.points[1][4] == 42)
fire("PLAYER_REGEN_DISABLED") RunTimers(0)
check("hidden in combat", not ConjurerAlert.shown)
fire("PLAYER_REGEN_ENABLED") RunTimers(0)
check("back after it", ConjurerAlert.shown)
Click(P.sections.alert.body.when["in"])
check("set to in combat, it hides out of combat", ns.db.alert.when == "in" and not ConjurerAlert.shown)
check("and the three boxes act as one choice", P.sections.alert.body.when["in"].checked and not P.sections.alert.body.when.out.checked)
fire("PLAYER_REGEN_DISABLED") RunTimers(0)
check("and shows in combat", ConjurerAlert.shown)
check("where its play button greys out, since conjuring can't start in a fight", ConjurerAlertPlay.alpha == 0.5 and ConjurerAlertPlay.icon.desaturated == true)
fire("PLAYER_REGEN_ENABLED") RunTimers(0)
Click(P.sections.alert.body.when.always)
check("set to in and out of combat, it shows out of combat", ns.db.alert.when == "always" and ConjurerAlert.shown)
fire("PLAYER_REGEN_DISABLED") RunTimers(0)
check("and in combat", ConjurerAlert.shown)
fire("PLAYER_REGEN_ENABLED") RunTimers(0)
check("and its play button is live again out of combat", ConjurerAlertPlay.alpha == 1)
Click(P.sections.alert.body.when.out)
check("back to out of combat", ns.db.alert.when == "out" and P.sections.alert.body.when.out.checked and not P.sections.alert.body.when.always.checked)
ns.db.alert.sound = true
AddItems(8079, 40)
fire("BAG_UPDATE_DELAYED")
ClearBags()
AddItems(22895, 20)
fire("BAG_UPDATE_DELAYED") RunTimers(0)
check("with the sound on it chimes as water runs low", Played(3175))
ns.db.alert.sound = false
PLAYER_LEVEL = 50
ClearBags()
AddItems(8079, 40)
AddItems(22895, 20)
fire("BAG_UPDATE_DELAYED") RunTimers(0)
check("water too high a rank to drink doesn't count", ConjurerAlertWater:IsVisible() and tostring(ConjurerAlertWater.count.text) == "0")
PLAYER_LEVEL = 60
ns.db.alert.water = 0
fire("BAG_UPDATE_DELAYED") RunTimers(0)
ClearBags()
AddItems(22895, 20)
fire("BAG_UPDATE_DELAYED") RunTimers(0)
check("a threshold of 0 never alerts", not ConjurerAlert.shown)
ns.db.alert.water = 20
ns.db.alert.enabled = false
fire("BAG_UPDATE_DELAYED") RunTimers(0)
check("switched off, it stays hidden", not ConjurerAlert.shown)
ns.db.alert.enabled = true
fire("BAG_UPDATE_DELAYED") RunTimers(0)
ns.Profile().water[7] = 40
Click(ConjurerAlertPlay)
check("its play button starts conjuring", C.armed)
check("and turns into a stop button", (ConjurerAlertPlay.stop.shown and not ConjurerAlertPlay.play.shown
  and ConjurerAlertPlay.stop.atlas == "charactercreate-customize-stopbutton") or (BARE and ConjurerAlertPlay.playText.text == "Stop"))
check("lit up like the window's Ready button", ConjurerAlertPlay.glow.shown and ConjurerAlertPlay.anim.playing and ConjurerAlertPlay.highlighted)
AddItems(8079, 30)
fire("BAG_UPDATE_DELAYED") RunTimers(0)
check("started from the alert, it stays up while conjuring runs", ConjurerAlertWater:IsVisible() and tostring(ConjurerAlertWater.count.text) == "30")
check("without the glow once it isn't low", not ConjurerAlertWater.glow.shown)
Click(ConjurerAlertPlay)
check("its stop button stops conjuring, and then the alert goes", not C.armed and not ConjurerAlert.shown)
ClearBags()
AddItems(22895, 20)
fire("BAG_UPDATE_DELAYED") RunTimers(0)
local castsBefore = #CLICK_CASTS
Click(ConjurerAlertWater, "RightButton")
check("right-clicking an icon does the same, and casts nothing itself", C.armed and #CLICK_CASTS == castsBefore)
Click(ConjurerAlertWater, "RightButton")
check("and again stops", not C.armed)
ConjurerFrame:Hide()
Click(ConjurerAlertSettings)
check("the cog opens Conjurer", ConjurerFrame.shown)
ConjurerFrame:Hide()
castsBefore = #CLICK_CASTS
Click(ConjurerAlertWater, "LeftButton")
if BARE then
  check("without the template, clicking an icon opens Conjurer", ConjurerFrame.shown)
else
  check("clicking an icon conjures the water it shows, your best rank", #CLICK_CASTS == castsBefore + 1 and CLICK_CASTS[#CLICK_CASTS] == 10140
    and not ConjurerFrame.shown and Logged("alert icon click: conjure Conjured Crystal Water"))
end
UI.Show() RunTimers(0)
ns.db.alert.point = nil
ConjurerAlertWater.scripts.OnDragStop(ConjurerAlertWater)
check("dragging it saves where it is", type(ns.db.alert.point) == "table" and ns.db.alert.point[1] == ConjurerAlert.points[1][1]
  and ns.db.alert.point[3] == ConjurerAlert.points[1][4] and ns.db.alert.point[4] == ConjurerAlert.points[1][5])
AddItems(8079, 40)
fire("BAG_UPDATE_DELAYED") RunTimers(0)
check("stocked up again, it goes", not ConjurerAlert.shown)
check("there are no move buttons any more", P.alertMove == nil and P.announceMove == nil and Al.SetPreview == nil and ns.Announce.SetPreview == nil)
P.sections.alert.body.waterSlider.Slider:SetValue(30)
RunTimers(0)
check("the slider sets the water threshold", ns.db.alert.water == 30)
ns.db.collapsed.alert = true
UI.Refresh()
check("closed, the section sums it up", P.sections.alert.header.Summary.text == "shown when low, water below 30, food below 10, out of combat", P.sections.alert.header.Summary.text)
ns.db.collapsed.alert = false
ns.db.alert.water = 20
UI.Refresh()

-- ---- The announce button ----------------------------------------------------
local An = ns.Announce
if C.armed then C.Disarm() end
GROUP, RAID, INSTANCE = {}, false, nil
fire("GROUP_ROSTER_UPDATE") RunTimers(0)
UI.Show() RunTimers(0)
local AB = P.sections.announce.body
ns.db.alert.always = true
fire("BAG_UPDATE_DELAYED") RunTimers(0)
local barWidth = ConjurerAlert.w
local function AnnounceUp() return ConjurerAnnounce ~= nil and ConjurerAnnounce:IsVisible() end
check("the announce button is off until you turn it on", ns.db.announce.shown == false and not AnnounceUp())
Click(AB.shownCheck)
check("turned on, it waits until you're in a group", ns.db.announce.shown and not AnnounceUp())
GROUP = { { unit = "party1", guid = "Q1", name = "Quen", level = 60, class = "PRIEST" } }
fire("GROUP_ROSTER_UPDATE") RunTimers(0)
check("in a party it shows, in the quick access bar's title bar", AnnounceUp() and ConjurerAnnounce.parent == ConjurerAlert)
local hfit = ConjurerAlertBorder.fit
check("at its left end, mirroring the cog, the row as it was", ConjurerAnnounce.points[1][1] == "TOPLEFT"
  and ConjurerAnnounce.points[1][2] == ConjurerAlertBorder and math.abs(ConjurerAnnounce.points[1][4] - 7 * hfit) < 1e-9
  and math.abs(ConjurerAnnounce.points[1][5] + 3 * hfit) < 1e-9 and ConjurerAnnounce.w == ConjurerAlertSettings.w
  and ConjurerAlert.w == barWidth, ConjurerAlert.w .. " " .. barWidth)
check("the chat symbol in a framed button of the cog's family", ConjurerAnnounce.art.atlas == "common-dropdown-a-button-sharetochat"
  or (BARE and ConjurerAnnounce.bubble ~= nil))
Click(P.sections.alert.body.frameCheck)
local cx = ConjurerAlertPlay.points[1][4] + 40 + 2 + (24 - 20) / 2
check("without the panel it's under the cog at the end of the row", ConjurerAnnounce:IsVisible()
  and ConjurerAnnounce.points[1][2] == ConjurerAlert and ConjurerAnnounce.points[1][4] == cx
  and ConjurerAlertSettings.points[1][2] == ConjurerAlert and ConjurerAlertSettings.points[1][4] == cx
  and ConjurerAnnounce.w == 20 and ConjurerAlertSettings.w == 20, tostring(ConjurerAnnounce.points[1][4]) .. " " .. cx)
-- What shows of each, against the icons, which fill the row's 40.
local artShown, artTop = 20 * 20 / 27, 20 / 27
local cogTop = -ConjurerAlertSettings.points[1][5] + artTop
local annTop = -ConjurerAnnounce.points[1][5] + artTop
local above, between, below = cogTop, annTop - (cogTop + artShown), 40 - (annTop + artShown)
check("with the same room above, between and below them", above > 2 and math.abs(above - between) < 1e-9 and math.abs(between - below) < 1e-9,
  above .. " " .. between .. " " .. below)
check("the row no wider for it than for the cog alone, ending where their art does", math.abs(ConjurerAlert.w - (cx + 20 * 23 / 27)) < 1e-9,
  ConjurerAlert.w .. " " .. barWidth)
Click(P.sections.alert.body.frameCheck)
check("the panel back, it's back in the title bar", ConjurerAnnounce:IsVisible() and ConjurerAnnounce.points[1][2] == ConjurerAlertBorder
  and ConjurerAnnounce.w == ConjurerAlertSettings.w and ConjurerAlert.w == barWidth)
ClearBags()
AddItems(8079, 45)
AddItems(8078, 20)
AddItems(22895, 20)
SENT = {}
Click(ConjurerAnnounce)
check("a click tells the party", #SENT == 1 and SENT[1].channel == "PARTY")
check("what you have left, best rank first, with the level each needs", SENT[1].text
  == "Mage food and water here! Trade me for yours. I have 45 Crystal Water (55+), 20 Sparkling Water (45+) and 20 Cinnamon Roll (55+).", SENT[1].text)
check("the button shows its cooldown", BARE or (ConjurerAnnounce.cooldown and ConjurerAnnounce.cooldown.cd and ConjurerAnnounce.cooldown.cd[2] == 10))
Click(ConjurerAnnounce)
check("not twice in a row", #SENT == 1 and ChatWith("Announced a moment ago") == 1)
fire("CHAT_MSG_PARTY", SENT[1].text, "Vatik") RunTimers(0)
check("the log says it reached the chat", table.concat(ConjurerLog.entries, "\n"):find("announce seen in chat (CHAT_MSG_PARTY)", 1, true) ~= nil)
RunTimers(11)
RAID = true
GROUP = { { unit = "raid1", guid = "R1", name = "R1", level = 60, class = "MAGE" }, { unit = "raid2", guid = "R2", name = "R2", level = 60, class = "MAGE" } }
Click(ConjurerAnnounce)
check("in a raid it tells the raid", SENT[2] and SENT[2].channel == "RAID")
RunTimers(11)
INSTANCE = { inside = true, kind = "pvp", max = 10 }
Click(ConjurerAnnounce)
check("in a battleground it tells the battleground", SENT[3] and SENT[3].channel == "INSTANCE_CHAT")
INSTANCE, RAID = nil, false
GROUP = { { unit = "party1", guid = "Q1", name = "Quen", level = 60, class = "PRIEST" } }
fire("GROUP_ROSTER_UPDATE") RunTimers(0)
P.announceBox:SetText("Water: {water}. Food: {food}.")
P.announceBox.scripts.OnTextChanged(P.announceBox, true) RunTimers(0)
check("typing the message saves it", ns.db.announce.message == "Water: {water}. Food: {food}.")
check("the preview fills it in", P.announcePreview.text:find("Sends to your party: |cffffffffWater: 45 Crystal Water (55+), 20 Sparkling Water (45+). Food: 20 Cinnamon Roll (55+).", 1, true) ~= nil,
  P.announcePreview.text)
P.announceBox:SetText("set by the addon, not typed")
P.announceBox.scripts.OnTextChanged(P.announceBox, false)
check("a change the addon makes itself is not saved as yours", ns.db.announce.message == "Water: {water}. Food: {food}.")
RunTimers(11)
ClearBags()
AddItems(8079, 45)
Click(ConjurerAnnounce)
check("a kind you're out of says so", SENT[4] and SENT[4].text == "Water: 45 Crystal Water (55+). Food: no food.", SENT[4] and SENT[4].text)
ns.db.announce.message = string.rep("a", 300) .. " {stock}"
check("a long message is cut to the chat's 255", #An.Message() == 255 and An.Message():sub(-3) == "...")
Click(AB.shownCheck) Click(AB.shownCheck)
ns.db.announce.message = "x"
UI.Refresh()
for _, kid in ipairs(AB.kids) do if kid.text == "Reset text" then Click(kid) end end
check("Reset text brings back the default", ns.db.announce.message == nil and P.announceBox.text == An.DEFAULT_MESSAGE)
RunTimers(11)
ClearBags()
local before = #SENT
Click(ConjurerAnnounce)
check("with nothing to offer it says so and sends nothing", #SENT == before and ChatWith("You have no conjured food or water to offer yet.") == 1)
AddItems(8079, 45)
ConjurerFrame:Hide()
ConjurerAnnounce.scripts.OnClick(ConjurerAnnounce, "RightButton") RunTimers(0)
check("right-click opens Conjurer", ConjurerFrame.shown)
ns.db.alert.point = nil
ConjurerAnnounce.scripts.OnDragStop(ConjurerAnnounce)
check("dragging it moves the whole bar", type(ns.db.alert.point) == "table")
REFUSE_CHAT = true
RunTimers(11)
Click(ConjurerAnnounce)
check("a refused message is logged and said", table.concat(ConjurerLog.entries, "\n"):find("announce to PARTY: failed", 1, true) ~= nil
  and ChatWith("The game didn't let Conjurer send that.") == 1)
REFUSE_CHAT = nil
GROUP = {}
fire("GROUP_ROSTER_UPDATE") RunTimers(0)
check("alone, it hides again", not AnnounceUp())
Click(AB.groupCheck)
check("with Only while you're in a group off, it stays up alone", ns.db.announce.groupOnly == false and AnnounceUp())
RunTimers(11)
before = #SENT
Click(ConjurerAnnounce)
check("alone, it tells the people around you (Say)", #SENT == before + 1 and SENT[#SENT].channel == "SAY")
fire("CHAT_MSG_SAY", SENT[#SENT].text, "Vatik") RunTimers(0)
check("and checks Say for it too", table.concat(ConjurerLog.entries, "\n"):find("announce seen in chat (CHAT_MSG_SAY)", 1, true) ~= nil)
-- Links people can shift-click.
ITEM_LINKS = true
RunTimers(11)
before = #SENT
Click(ConjurerAnnounce)
local sentText = SENT[#SENT] and SENT[#SENT].text or ""
check("the items go out as links people can shift-click", #SENT == before + 1
  and sentText:find("45 |cffffffff|Hitem:8079::::::::60:::::|h[Conjured Crystal Water]|h|r (55+)", 1, true) ~= nil, sentText)
fire("CHAT_MSG_SAY", (sentText:gsub("::::::::60:::::", ":0:0:0:0:0:0:0:60")), "Vatik") RunTimers(0)
check("and it is still recognised in the chat when the links come back a little different",
  select(2, table.concat(ConjurerLog.entries, "\n"):gsub("announce seen in chat %(CHAT_MSG_SAY%)", "")) == 2)
ns.db.announce.message = string.rep("a", 200) .. " {stock}"
check("too long with links, it goes with plain names", An.Message() == string.rep("a", 200) .. " 45 Crystal Water (55+)", An.Message())
ns.db.announce.message = nil
ITEM_LINKS = nil
Click(AB.groupCheck)
Click(AB.shownCheck)
check("switched off, it goes from the bar, and the bar closes up", not AnnounceUp() and ConjurerAlert.w == barWidth)
Click(AB.shownCheck)
GROUP = { { unit = "party1", guid = "Q1", name = "Quen", level = 60, class = "PRIEST" } }
fire("GROUP_ROSTER_UPDATE") RunTimers(0)
ns.db.alert.always = false
AddItems(22895, 20)
fire("BAG_UPDATE_DELAYED") RunTimers(0)
check("it shows only with the bar: Only when low and nothing low hides both", not ConjurerAlert.shown and not AnnounceUp())
Click(AB.shownCheck)
GROUP = {}
fire("GROUP_ROSTER_UPDATE") RunTimers(0)
UI.Show() RunTimers(0)
ns.db.collapsed.announce = true
UI.Refresh()
check("closed, the section sums it up", P.sections.announce.header.Summary.text == "off")
ns.db.collapsed.announce = false
UI.Refresh()

-- ---- Mana gems ------------------------------------------------------------------
if C.armed then C.Disarm() end
UI.Show() RunTimers(0)
for _, g in ipairs(ns.GEMS) do KNOWN[g.spell] = true end
fire("SPELLS_CHANGED") RunTimers(0)
ClearBags()
local keepWater, keepFood = ns.Profile().water[7], ns.Profile().food[7]
for r = 1, 7 do ns.Profile().water[r] = 0 ns.Profile().food[r] = 0 end
UI.Refresh()
local GB = P.sections.gems.body
check("the Mana gems section lists the gems you know, best first", P.gemRows[1].shown and P.gemRows[1].gem.name == "Mana Ruby"
  and P.gemRows[4].shown and P.gemRows[1].have.text == "Missing" and P.gemRows[1].level.text == "Level 58")
check("keeping them is off to start", ns.db.gems.keep == false and C.CurrentRow() == nil)
Click(GB.keepCheck)
check("ticked, every gem you know is kept, best first", ns.db.gems.keep and ns.KeepsGem(ns.GEMS[1]) and C.CurrentRow() == ns.GEMS[4])
check("and the missing ones show on the alert", ConjurerAlertGem4 and ConjurerAlertGem4:IsVisible() and ConjurerAlertGem1:IsVisible()
  and ConjurerAlertGem4.icon.texture == "itemicon:8008" and ConjurerAlertGem4.count.text == "")
if not BARE then
  Click(ConjurerAlertGem4)
  check("a missing gem's alert icon conjures that gem", CLICK_CASTS[#CLICK_CASTS] == 10054)
end
Click(P.gemRows[2].check)
check("a gem you untick isn't kept", ns.db.gems[10053] == false and not ns.KeepsGem(ns.GEMS[3]) and not ConjurerAlertGem3:IsVisible())
ns.db.collapsed.gems = true
UI.Refresh()
check("closed, the section sums it up", P.sections.gems.header.Summary.text == "keeping 3, 3 missing", P.sections.gems.header.Summary.text)
ns.db.collapsed.gems = false
UI.Refresh()
Click(P.readyButton)
local gemCasts = Hold("F", 100)
check("one press conjures the missing gem and the hold stops there", gemCasts == 1 and C_Item.GetItemCount(8008) == 1 and C.armed, gemCasts)
check("the next kept gem is already on the button", ACTIONS[C.where.slot] and ACTIONS[C.where.slot].id == 3552)
Hold("F", 100)
Hold("F", 100)
check("with every kept gem made, Ready goes off", not C.armed and C_Item.GetItemCount(5513) == 1 and C_Item.GetItemCount(5514) == 1
  and C_Item.GetItemCount(8007) == 0)
check("and the alert lets them go", not ConjurerAlertGem4:IsVisible() and not ConjurerAlertGem1:IsVisible())
check("the rows say so", P.gemRows[1].have.text == "Have it")
Click(GB.keepCheck)
ns.Profile().water[7], ns.Profile().food[7] = keepWater, keepFood
for _, g in ipairs(ns.GEMS) do KNOWN[g.spell] = nil end
fire("SPELLS_CHANGED") RunTimers(0)

-- ---- The eat and drink macro ----------------------------------------------
local Mac = ns.Macro
ClearBags()
AddItems(22895, 20)
AddItems(8079, 20)
UI.Show()
RunTimers(0)
check("no macro is made until asked", Mac.Index() == 0 and next(MACROS) == nil)
check("the section says what one press would do", P.macroText.text == "One press drinks Crystal Water and eats Cinnamon Roll.", P.macroText.text)
check("and that it isn't made", P.macroStatus.text:find("Not made yet", 1, true) ~= nil and P.macroMake.text == "Make macro")
check("its icon is the water, which comes first", P.macroButton.icon.texture == "itemicon:8079")
Click(P.macroMake)
local mi = Mac.Index()
check("Make macro writes it", mi > 0 and MACROS[mi].name == "Conjurer Eat")
check("with the character's macros", mi > 120)
check("eating and drinking the best ranks by item id", MACROS[mi].body == "#showtooltip\n/use item:8079\n/use item:22895", MACROS[mi].body)
check("the question mark icon, so the item shows", MACROS[mi].icon == 134400)
check("from now on it is kept up to date", ns.db.macro.auto == true and ns.db.macro.made == true)
check("the button now says Update", P.macroMake.text == "Update macro" and P.macroStatus.text:find("a character macro", 1, true) ~= nil)
ClearBags()
AddItems(22895, 20)
AddItems(8078, 20)
fire("BAG_UPDATE_DELAYED")
RunTimers(0)
check("out of Crystal Water it drinks Sparkling Water", MACROS[mi].body == "#showtooltip\n/use item:8078\n/use item:22895")
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
check("it starts with the session", all:find("session start: Conjurer 1.3.1, client 1.60.1.70009, Vatik MAGE 60", 1, true) ~= nil)
check("it has the window's templates", all:find("window built: window template ButtonFrameTemplate", 1, true) ~= nil)
check("it has Ready being lit", all:find("Ready is lit; hold to cast on", 1, true) ~= nil)
check("it has the binding", all:find("bind F -> MULTIACTIONBAR7BUTTON12", 1, true) ~= nil)
check("it has every cast", all:find("cast Conjured Crystal Water (key held)", 1, true) ~= nil)
check("it has the row changing", all:find("row done: Conjured Crystal Water 40/40; next Conjured Cinnamon Roll", 1, true) ~= nil)
check("it has the hold's length", all:find("key up after 4 conjures in this hold", 1, true) ~= nil)
check("it has what it learned", all:find("learned: one Conjured Crystal Water cast makes 10 at level 60", 1, true) ~= nil)
check("and when the spell data was wrong", all:find("learned: one Conjured Crystal Water cast makes 8 at level 60 (the spell data said 10)", 1, true) ~= nil)
check("and when a guess fell short", all:find("fell short", 1, true) ~= nil)
check("it has the early move", all:find("this cast finishes Conjured Crystal Water; the button now holds Conjured Cinnamon Roll, so the hold stops at the target", 1, true) ~= nil)
check("it has Ready going off and why", all:find("Ready off: Everything is conjured. Ready is off.", 1, true) ~= nil)
check("it has the settings changing and going back", all:find("setting ActionButtonUseKeyHeldSpell: turned on by Conjurer (was 0)", 1, true) ~= nil
  and all:find("setting ActionButtonUseKeyHeldSpell put back to 0", 1, true) ~= nil)
check("it has the trades", all:find("trade opened with Elyse (PRIEST 58); filling", 1, true) ~= nil
  and all:find("handed Elyse: 20 Cinnamon Roll, 40 Crystal Water", 1, true) ~= nil)
check("it has each step of a fill", all:find("into trade slot 1", 1, true) ~= nil)
check("it has the refusals", all:find("Ready refused: Nothing to conjure", 1, true) ~= nil)
check("it has the macro", all:find("macro made (character): #showtooltip | /use item:8079 | /use item:22895", 1, true) ~= nil)
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
for i = 1, 1600 do ns.Log("filler " .. i) end
check("the log keeps its last 1500 lines", #ConjurerLog.entries == 1500 and ConjurerLog.entries[1500]:find("filler 1600", 1, true) ~= nil)
SV_TEXT = DumpSV("ConjurerLog", ConjurerLog)

-- A reload while Ready was lit: the next login puts the settings back.
if C.armed then C.Disarm() end
ns.Profile().water[7] = C_Item.GetItemCount(8079) + 20
Click(P.readyButton)
check("lit before the reload", C.armed and CVARS.ActionButtonUseKeyHeldSpell == "1")
SAVED = ConjurerDB
`;

// ------------------------------------------------------------------
// Scenarios, each in a fresh Lua state
// ------------------------------------------------------------------
const scenarios = [
  { label: 'reload while lit', code: String.raw`
    ConjurerDB = { savedCVars = { ActionButtonUseKeyHeldSpell = "0" }, seeded = true, yield = { [5504] = { n = 1, level = 8 } } }
    ConjurerLog = { session = 3, entries = { "#3 12:00:00 session end (logout or reload)" } }
    CVARS.ActionButtonUseKeyHeldSpell = "1"
    local ns = LoadConjurer()
    fire("ADDON_LOADED", "Conjurer") fire("PLAYER_LOGIN") RunTimers(0)
    check("the setting left on by a reload is put back at login", CVARS.ActionButtonUseKeyHeldSpell == "0" and ns.db.savedCVars == nil)
    check("the planned targets are kept", ns.Profile().seeded == true)
    check("the log carries on in a new session", ConjurerLog.session == 4 and ConjurerLog.entries[1]:find("#3 ", 1, true) == 1
      and table.concat(ConjurerLog.entries, "\n"):find("#4 %d%d:%d%d:%d%d session start") ~= nil)
    check("the put-back is logged", table.concat(ConjurerLog.entries, "\n"):find("setting ActionButtonUseKeyHeldSpell put back to 0", 1, true) ~= nil)
    check("a yield learned the old, noisy way is dropped once", next(ns.db.yield) == nil and ns.db.yieldVersion == 2)
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
    check("no targets are planned", ns.Profile().seeded == nil)
  ` },
  { label: 'a young mage', code: String.raw`
    PLAYER_LEVEL = 24
    local ns = LoadConjurer()
    for _, e in ipairs({ ns.WATER[1], ns.WATER[2], ns.WATER[3], ns.FOOD[1], ns.FOOD[2], ns.FOOD[3] }) do KNOWN[e.spell] = true end
    fire("ADDON_LOADED", "Conjurer") fire("PLAYER_LOGIN") RunTimers(0)
    check("a young mage's stock is planned at the ranks it knows", ns.Profile().water[3] == 40 and ns.Profile().food[3] == 20
      and (ns.Profile().water[7] or 0) == 0)
    ns.UI.Toggle() RunTimers(0)
    local rows = ns.UI.parts.rankRows.water
    local body = ns.UI.parts.sections.water.body
    check("by default only the best rank it knows is listed", rows[5].shown and not rows[6].shown and not rows[7].shown and body.h == 2 + 28 + 2)
    ns.db.showAllRanks = true
    ns.UI.Refresh()
    check("ranks not learned are not shown", not rows[1].shown and not rows[2].shown and not rows[3].shown and not rows[4].shown)
    check("the learned ones are", rows[5].shown and rows[6].shown and rows[7].shown and rows[5].name.text == "Purified Water")
    check("closed up at the top, best first", rows[5].points[1][5] == -2 and rows[6].points[1][5] == -30 and rows[7].points[1][5] == -58)
    check("the section is only as tall as those rows", body.h == 2 + 3 * 28 + 2, body.h)
    check("with no empty-list line", body.empty.shown == false)
    ns.Profile().water[7] = 40
    ns.db.collapsed.water = true
    ns.UI.Refresh()
    check("a closed section counts only learned ranks", ns.UI.parts.sections.water.header.Summary.text == "1 rank, 0 of 40",
      ns.UI.parts.sections.water.header.Summary.text)
    ns.db.collapsed.water = false
    KNOWN[ns.WATER[4].spell] = true
    fire("SPELLS_CHANGED") RunTimers(0)
    check("learning a rank adds its row at the top", rows[4].shown and rows[4].points[#rows[4].points][5] == -2
      and rows[5].points[#rows[5].points][5] == -30 and body.h == 2 + 4 * 28 + 2)
    KNOWN[ns.WATER[4].spell] = nil
    fire("SPELLS_CHANGED") RunTimers(0)
    check("a target on a rank not learned is skipped", ns.Conjure.CurrentRow() == ns.WATER[3])
    GROUP = { { unit = "party1", guid = "G1", name = "Low", level = 12, class = "PRIEST" } }
    check("a level 12 gets rank 2", ns.Trade.ShareText(ns.Trade.Members()[1]) == "40 Fresh Water, 20 Bread")
  ` },
  { label: 'a mage before any conjure spell', code: String.raw`
    PLAYER_LEVEL = 2
    local ns = Login()
    check("nothing is planned yet", ns.Profile().seeded == nil)
    KNOWN[5504] = true
    fire("SPELLS_CHANGED")
    check("learning Conjure Water plans it", ns.Profile().seeded == true and ns.Profile().water[1] == 40)
    ns.UI.Toggle() RunTimers(0)
    local food = ns.UI.parts.sections.food.body
    check("with no food rank learned the Food list says so", food.empty.shown and food.empty.text == "You haven't learned Conjure Food yet.")
    local shownRows = 0
    for _, row in ipairs(ns.UI.parts.rankRows.food) do if row.shown then shownRows = shownRows + 1 end end
    check("and shows no rows", shownRows == 0)
    check("the Water list shows its one rank", ns.UI.parts.rankRows.water[7].shown and ns.UI.parts.sections.water.body.empty.shown == false)
    fire("BAG_UPDATE_DELAYED") RunTimers(0)
    check("out of water it alerts, but never about food it can't make", ConjurerAlert.shown and ConjurerAlertWater.shown and not ConjurerAlertFood.shown)
  ` },
  { label: 'targets from before profiles', code: String.raw`
    ConjurerDB = { targets = { water = { [1] = 40, [3] = 60 }, food = { [1] = 20 } }, seeded = true }
    local ns = LoadConjurer()
    for _, e in ipairs({ ns.WATER[1], ns.WATER[2], ns.WATER[3], ns.FOOD[1], ns.FOOD[2], ns.FOOD[3] }) do KNOWN[e.spell] = true end
    fire("ADDON_LOADED", "Conjurer") fire("PLAYER_LOGIN") RunTimers(0)
    local solo = ns.db.profiles.solo
    check("the targets you had are now the Solo profile", solo.water[3] == 60 and solo.water[1] == 40 and solo.food[1] == 20)
    check("the old place is cleared", ns.db.targets == nil and ns.db.seeded == nil and solo.seeded == true)
    check("Solo isn't planned again on top of them", (solo.food[3] or 0) == 0)
    check("the other profiles start at the best rank known", ns.db.profiles.party.water[3] == 100 and ns.db.profiles.bg40.food[3] == 100)
    check("alone, Solo is in use", ns.db.profile == "solo" and ns.Target(ns.WATER[3]) == 60)
    check("the move is logged", table.concat(ConjurerLog.entries, "\n"):find("saved settings: targets moved into the Solo profile", 1, true) ~= nil)
  ` },
  { label: 'only your best rank', code: String.raw`
    local ns = Login()
    KnowAll()
    fire("SPELLS_CHANGED") RunTimers(0)
    ns.Profile().water[7] = 0
    ns.Profile().water[6] = 40
    check("a target on a hidden rank isn't conjured", ns.Conjure.CurrentRow() == ns.FOOD[7])
    ns.db.showAllRanks = true
    check("once shown, it is", ns.Conjure.CurrentRow() == ns.WATER[6])
    ns.db.showAllRanks = false
    GROUP = { { unit = "party1", guid = "L1", name = "Low", level = 48, class = "PRIEST" } }
    ns.Trade.FillTargets(true)
    check("a group needing a lower rank is told to show all ranks",
      ChatWith("Some of your group need a lower rank (Sparkling Water, Sweet Roll). Tick Show all ranks to see and conjure it.") == 1)
  ` },
  { label: 'no FlipBook', code: String.raw`
    BAD_FLIPBOOK = true
    local ns = Login()
    ns.UI.Toggle() RunTimers(0)
    check("without flipbooks the glow pulses", ns.report["ready glow"] == "pulse")
    local sheets = 0
    for _, tex in ipairs(TEXTURES) do
      if tex.atlas == "Skillbar_Fill_Flipbook_Alchemy_c60" and tex.shown then sheets = sheets + 1 end
    end
    check("and the progress bar is plain, not every frame of the sheet at once", ConjurerProgress.art == "plain" and sheets == 0, sheets)
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
  'UIPanelScrollFrameTemplate', 'InsetFrameTemplate', 'SecureHandlerStateTemplate', 'PanelTabButtonTemplate',
  'InputBoxTemplate', 'CooldownFrameTemplate', 'InsecureActionButtonTemplate', 'DefaultPanelFlatTemplate', 'DefaultPanelTemplate'];
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
  .replace(/check\("the inset is lowered for the Ready bar[^"]*"[^\n]*\n/, '')
  .replace(/check\("the headers use Blizzard's list header art"[^\n]*\n/, 'check("the headers fall back to plain bars with a sign", P.sections.water.header.Sign and P.sections.water.header.Sign.text == "-")\n')
  .replace(/check\("Options starts closed"[^\n]*\n/, 'check("Options starts closed", P.sections.options.body.shown == false and P.sections.options.header.Sign.text == "+")\n')
  .replace(/check\("the scroll frame is the MinimalScrollBar one"[^\n]*\n/, 'check("the scroll frame falls back", ns.report["scroll frame"] == "plain, mouse wheel only")\n')
  .replace(/check\("sliders are Blizzard's stepper sliders"[^\n]*\n/, 'check("the sliders fall back to plain ones", ns.report["slider template"] == "plain")\n')
  .replace(/check\("the Ready glow is the spell alert flipbook"[^\n]*\n/, 'check("the Ready glow falls back to a pulse", ns.report["ready glow"] == "pulse")\n')
  .replace(/check\("its arrow turns"[^\n]*\n/, 'check("its sign turns", P.sections.water.header.Sign.text == "+")\n')
  .replace(/check\("the icon's rounded mask is Blizzard's size[^\n]*\n[^\n]*\n/, 'check("without the mask atlas the icon is left unmasked", P.readyButton.iconMask == nil)\n')
  .replace(/check\("a play button sits over the Ready icon"[^\n]*\n[^\n]*\n/, 'check("without the play art the button says Start", P.readyButton.playText.shown and P.readyButton.playText.text == "Start" and not P.readyButton.play.shown)\n')
  .replace(/check\("and it's lit up while there's something to start"[^\n]*\n/, 'check("in full while there is something to start", P.readyButton.playText.alpha == 1)\n')
  .replace(/check\("the play button turns into a stop button"[^\n]*\n[^\n]*\n/, 'check("and Stop while lit", P.readyButton.playText.shown and P.readyButton.playText.text == "Stop")\n')
  .replace(/check\("and the play button greys out"[^\n]*\n/, 'check("and Start fades when there is nothing to start", P.readyButton.playText.text == "Start" and P.readyButton.playText.alpha < 1)\n')
  .replace(/check\("Water and Food sit in their own inset"[^\n]*\n/, 'check("without the inset template Water and Food get a plain box", ns.report["targets box"] == "plain")\n')
  .replace(/check\("side by side, 3 apart, not overlapping"[^\n]*\n/, 'check("plain tabs sit side by side", P.tabs[2].points[1][4] == 3)\n')
  .replace(/check\("spread evenly across the whole width at full size"[^\n]*\n/, 'check("they fit the list", 8 + 8 * P.tabs[1].w + 7 * 3 <= P.content.w)\n')
  .replace(/check\("the selected tab sits above its neighbours"[^\n]*\n/, '')
  .replace(/check\("in Blizzard's tab template"[^\n]*\n/, 'check("without the tab template the tabs are plain buttons", ns.report["profile tabs"] == "plain" and P.tabs[1].bg ~= nil)\n')
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
  check('the reader parses it', Array.isArray(log.entries) && log.entries.length === 1500, log.entries && log.entries.length);
  check('with the session number', log.session === 1);
  check('and the report', Array.isArray(log.report) && /^Conjurer 1\.3\.1 debug report/.test(log.report[0]));
  const { execFileSync } = require('child_process');
  const out = execFileSync(process.execPath, [DIR + 'tools/conjurer-log.js', '--file', tmp, '--last', '5'], { encoding: 'utf8' });
  check('the command prints the file and the lines', out.includes('Conjurer log: ' + tmp) && out.includes('filler 1600') && out.includes('--- debug report'));
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
  check('version 1.3.1', field(toc, 'Version') === '1.3.1');
  check('the version matches the code', /ns\.version = "1\.3\.1"/.test(sources['Core.lua']));
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
  check('the changelog opens on 1.3.1', /^## 1\.3\.1 - /.test(top), top.slice(0, 30));
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
