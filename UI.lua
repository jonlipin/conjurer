-- Conjurer
-- UI: the window.
--
-- A portrait window built from the client's own ButtonFrameTemplate, like the spellbook and the
-- bags: the Conjure icon in the round portrait, the Ready bar next to it, and below that an inset
-- holding collapsible sections with the reputation list's header art. Every template and atlas is
-- tried first and a plain stand-in is used when it is missing; /conjure debug says which one won.

local ADDON, ns = ...
local report = ns.report
local UI = {}
ns.UI = UI

-- The profile the sliders show and set: the tab you clicked, else the one Ready conjures to.
UI.viewKey = nil
function UI.ViewKey()
	if ns.db and ns.db.profileAuto and UI.viewKey and ns.PROFILE_BY_KEY[UI.viewKey] then return UI.viewKey end
	return ns.ProfileKey()
end

local WIDTH, HEIGHT = 648, 640 -- the eight profile tabs, side by side at the art's 72 minimum, fit the list
local ROW_H = 28
local SLIDER_W = 178

local frame, scroll, content
local readyButton, readyGlow, readyAnim, readyTitle, readyDetail, keyButton, keyHint, capture
local capturing = false
local sections = {}
local rankRows = { water = {}, food = {} }
local shareRows = {}
local memberRows = {}
local groupEmpty, optionsInfo
local syncers = {}
local ticker

local SECTIONS = {
	{ key = "water", title = "Water" },
	{ key = "food", title = "Food" },
	{ key = "gems", title = "Mana gems" },
	{ key = "shares", title = "Shares by class" },
	{ key = "group", title = "Group" },
	{ key = "macro", title = "Eat and drink macro" },
	{ key = "alert", title = "Low food and water alert" },
	{ key = "announce", title = "Announce button" },
	{ key = "options", title = "Options" },
}
local macroButton, macroText, macroStatus, macroMake, alertMove
local announceBox, announcePreview, announceMove

local function Guard(label, fn) return ns.Guard(label, fn) end

local function Sound(id, fallback)
	pcall(PlaySound, (SOUNDKIT and SOUNDKIT[id]) or fallback, "SFX")
end

local function Text(parent, font, layer)
	local fs = parent:CreateFontString(nil, layer or "ARTWORK", font or "GameFontHighlight")
	fs:SetJustifyH("LEFT")
	fs:SetWordWrap(false)
	return fs
end

local function Tip(region, title, body)
	region:SetScript("OnEnter", function(self)
		GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
		GameTooltip:SetText(title, 1, 1, 1)
		if body then GameTooltip:AddLine(body, nil, nil, nil, true) end
		GameTooltip:Show()
	end)
	region:SetScript("OnLeave", function() GameTooltip:Hide() end)
end

-- ------------------------------------------------------------------
-- Controls, each with a plain stand-in
-- ------------------------------------------------------------------

local function NewButton(parent, text, width, height)
	local ok, b = pcall(CreateFrame, "Button", nil, parent, "UIPanelButtonTemplate")
	if ok and b then
		report["button template"] = "UIPanelButtonTemplate"
	else
		b = CreateFrame("Button", nil, parent)
		local fs = b:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
		fs:SetAllPoints()
		b:SetFontString(fs)
		local bg = b:CreateTexture(nil, "BACKGROUND")
		bg:SetAllPoints()
		bg:SetColorTexture(0.3, 0.05, 0.05, 0.9)
		local hl = b:CreateTexture(nil, "HIGHLIGHT")
		hl:SetAllPoints()
		hl:SetColorTexture(1, 1, 1, 0.12)
		report["button template"] = "plain (no UIPanelButtonTemplate)"
	end
	b:SetSize(width or 80, height or 22)
	b:SetText(text or "")
	return b
end

local function NewCheck(parent, label, get, set, tip)
	local cb
	for _, tmpl in ipairs({ "UICheckButtonTemplate", "ChatConfigCheckButtonTemplate" }) do
		local ok, made = pcall(CreateFrame, "CheckButton", nil, parent, tmpl)
		if ok and made then
			cb = made
			report["check template"] = tmpl
			break
		end
	end
	if not cb then
		cb = CreateFrame("CheckButton", nil, parent)
		local box = cb:CreateTexture(nil, "BACKGROUND")
		box:SetAllPoints()
		box:SetColorTexture(0, 0, 0, 0.6)
		local mark = cb:CreateTexture(nil, "ARTWORK")
		mark:SetPoint("TOPLEFT", 5, -5)
		mark:SetPoint("BOTTOMRIGHT", -5, 5)
		mark:SetColorTexture(1, 0.82, 0, 1)
		cb:SetCheckedTexture(mark)
		report["check template"] = "plain"
	end
	cb:SetSize(24, 24)
	local fs = Text(parent, "GameFontHighlight")
	fs:SetPoint("LEFT", cb, "RIGHT", 2, 0)
	fs:SetText(label)
	cb.label = fs
	cb:SetScript("OnClick", Guard("checkbox " .. label, function(self)
		local on = self:GetChecked() and true or false
		Sound(on and "IG_MAINMENU_OPTION_CHECKBOX_ON" or "IG_MAINMENU_OPTION_CHECKBOX_OFF", 856)
		set(on)
		ns.Log("option \"" .. label .. "\": " .. (on and "on" or "off"))
		ns.Refresh()
	end))
	if tip then Tip(cb, label, tip) end
	syncers[#syncers + 1] = function() cb:SetChecked(get() and true or false) end
	return cb
end

-- A slider with Blizzard's stepper arrows and the value on its right, as in the game's options.
-- Returns a holder with :Set(value) (no callback) and :SetActive(on).
local PLAIN_SLIDERS = { "MinimalSliderTemplate", "UISliderTemplate", "OptionsSliderTemplate" }

local function NewSlider(parent, width, minV, maxV, step, onUserRaw)
	local onUser = Guard("slider", onUserRaw)
	local holder
	local ok, made = pcall(CreateFrame, "Frame", nil, parent, "MinimalSliderWithSteppersTemplate")
	local mixin = MinimalSliderWithSteppersMixin
	if ok and made and made.Slider and made.Init and mixin and mixin.Event and mixin.Label then
		holder = made
		holder:SetSize(width, 20)
		local formatters = { [mixin.Label.Right] = function(v) return tostring(math.floor(v + 0.5)) end }
		local fine = pcall(holder.Init, holder, 0, minV, maxV, (maxV - minV) / step, formatters)
		if fine and holder.RegisterCallback then
			holder:RegisterCallback(mixin.Event.OnValueChanged, function(_, v)
				if holder.syncing then return end
				onUser(math.floor(v / step + 0.5) * step)
			end, holder)
			holder.top = maxV
			function holder:Set(v)
				v = tonumber(v) or 0
				local top = math.max(maxV, math.ceil(v / 100) * 100)
				self.syncing = true
				if top ~= self.top then
					self.top = top
					self.Slider:SetMinMaxValues(minV, top)
				end
				self.Slider:SetValue(v)
				if self.FormatValue then self:FormatValue(v) end
				self.syncing = false
			end
			function holder:SetActive(on) if self.SetEnabled then self:SetEnabled(on and true or false) end end
			report["slider template"] = "MinimalSliderWithSteppersTemplate"
			return holder
		end
		made:Hide()
	elseif ok and made then
		made:Hide()
	end

	-- The plain slider, with our own value text.
	local slider
	for _, tmpl in ipairs(PLAIN_SLIDERS) do
		local okPlain, s = pcall(CreateFrame, "Slider", nil, parent, tmpl)
		if okPlain and s and s.SetMinMaxValues then
			slider = s
			report["slider template"] = tmpl
			for _, key in ipairs({ "Low", "High", "Text" }) do
				if type(s[key]) == "table" and s[key].SetText then s[key]:SetText("") end
			end
			break
		end
	end
	if not slider then
		slider = CreateFrame("Slider", nil, parent)
		slider:SetOrientation("HORIZONTAL")
		local bar = slider:CreateTexture(nil, "BACKGROUND")
		bar:SetPoint("LEFT")
		bar:SetPoint("RIGHT")
		bar:SetHeight(6)
		bar:SetColorTexture(0, 0, 0, 0.6)
		local thumb = slider:CreateTexture(nil, "OVERLAY")
		thumb:SetSize(10, 16)
		thumb:SetColorTexture(1, 0.82, 0, 1)
		slider:SetThumbTexture(thumb)
		report["slider template"] = "plain"
	end
	holder = CreateFrame("Frame", nil, parent)
	holder:SetSize(width, 20)
	slider:SetParent(holder)
	slider:SetPoint("LEFT", 4, 0)
	slider:SetPoint("RIGHT", -4, 0)
	slider:SetHeight(16)
	slider:SetMinMaxValues(minV, maxV)
	slider:SetValueStep(step)
	if slider.SetObeyStepOnDrag then slider:SetObeyStepOnDrag(true) end
	local value = Text(holder, "GameFontNormal")
	value:SetPoint("LEFT", holder, "RIGHT", 4, 0)
	holder.Slider, holder.valueText, holder.top = slider, value, maxV
	slider:SetScript("OnValueChanged", function(_, v)
		v = math.floor(v / step + 0.5) * step
		value:SetText(tostring(v))
		if holder.syncing then return end
		onUser(v)
	end)
	function holder:Set(v)
		v = tonumber(v) or 0
		local top = math.max(maxV, math.ceil(v / 100) * 100)
		self.syncing = true
		if top ~= self.top then
			self.top = top
			slider:SetMinMaxValues(minV, top)
		end
		slider:SetValue(v)
		value:SetText(tostring(v))
		self.syncing = false
	end
	function holder:SetActive(on)
		if slider.SetEnabled then slider:SetEnabled(on and true or false) end
		value:SetAlpha(on and 1 or 0.4)
	end
	return holder
end

-- ------------------------------------------------------------------
-- The window
-- ------------------------------------------------------------------

local function CreateWindow()
	local panel, used
	for _, tmpl in ipairs({ "ButtonFrameTemplate", "PortraitFrameTemplate" }) do
		local ok, made = pcall(CreateFrame, "Frame", "ConjurerFrame", UIParent, tmpl)
		if ok and made and (made.NineSlice or made.Inset or made.PortraitContainer) then
			panel, used = made, tmpl
			break
		end
		if ok and made then made:Hide() end
	end
	if not panel then
		local ok, made = pcall(CreateFrame, "Frame", "ConjurerFrame", UIParent, "BackdropTemplate")
		panel = (ok and made) or CreateFrame("Frame", "ConjurerFrame", UIParent)
		used = "plain"
		if panel.SetBackdrop then
			panel:SetBackdrop({
				bgFile = "Interface\\Tooltips\\UI-Tooltip-Background",
				edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border",
				tile = true, tileSize = 16, edgeSize = 14,
				insets = { left = 3, right = 3, top = 3, bottom = 3 },
			})
			panel:SetBackdropColor(0.05, 0.05, 0.07, 0.95)
		else
			local bg = panel:CreateTexture(nil, "BACKGROUND")
			bg:SetAllPoints()
			bg:SetColorTexture(0.05, 0.05, 0.07, 0.95)
		end
	end
	report["window template"] = used
	if used == "ButtonFrameTemplate" and ButtonFrameTemplate_HideButtonBar then
		pcall(ButtonFrameTemplate_HideButtonBar, panel)
	end

	panel:SetSize(WIDTH, HEIGHT)
	panel:SetFrameStrata("MEDIUM")
	if panel.SetToplevel then panel:SetToplevel(true) end
	panel:SetClampedToScreen(true)
	panel:SetMovable(true)
	panel:EnableMouse(true)
	panel:RegisterForDrag("LeftButton")
	panel:SetScript("OnDragStart", panel.StartMoving)
	panel:SetScript("OnDragStop", function(self)
		self:StopMovingOrSizing()
		local point, _, relPoint, x, y = self:GetPoint(1)
		ns.db.point = { point, relPoint, x, y }
	end)

	local title = panel.TitleText or (panel.TitleContainer and panel.TitleContainer.TitleText)
	if not title then
		title = panel:CreateFontString(nil, "OVERLAY", "GameFontNormal")
		title:SetPoint("TOP", 0, -6)
	end
	title:SetText("Conjurer")

	panel.portraitTexture = (panel.PortraitContainer and panel.PortraitContainer.portrait) or panel.portrait
	if not panel.CloseButton then
		local ok, close = pcall(CreateFrame, "Button", nil, panel, "UIPanelCloseButton")
		if ok and close then
			close:SetPoint("TOPRIGHT", 1, 1)
		else
			close = NewButton(panel, "x", 22, 22)
			close:SetPoint("TOPRIGHT", -4, -4)
			close:SetScript("OnClick", function() panel:Hide() end)
		end
	end

	-- The inset, lowered to leave room for the Ready bar.
	local inset = panel.Inset
	if not inset then
		local ok, made = pcall(CreateFrame, "Frame", nil, panel, "InsetFrameTemplate")
		inset = (ok and made) or CreateFrame("Frame", nil, panel)
		if not ok then
			local bg = inset:CreateTexture(nil, "BACKGROUND")
			bg:SetAllPoints()
			bg:SetColorTexture(0, 0, 0, 0.35)
		end
	end
	inset:ClearAllPoints()
	inset:SetPoint("TOPLEFT", panel, "TOPLEFT", 4, -88)
	inset:SetPoint("BOTTOMRIGHT", panel, "BOTTOMRIGHT", -6, 4)
	panel.insetFrame = inset

	panel:Hide()
	tinsert(UISpecialFrames, "ConjurerFrame")
	return panel
end

local function SetPortrait(icon)
	if not frame then return end
	if frame.SetPortraitToAsset then
		if pcall(frame.SetPortraitToAsset, frame, icon) then return end
	end
	if frame.portraitTexture then frame.portraitTexture:SetTexture(icon) end
end

local function Place()
	frame:ClearAllPoints()
	local p = ns.db.point
	if type(p) == "table" and p[1] then
		frame:SetPoint(p[1], UIParent, p[2] or p[1], p[3] or 0, p[4] or 0)
	else
		frame:SetPoint("CENTER", UIParent, "CENTER", 0, 40)
	end
end

-- ------------------------------------------------------------------
-- The Ready bar
-- ------------------------------------------------------------------

-- An icon button dressed like an action bar button: the icon under the bar's rounded mask, its
-- frame, its pressed art and its hover highlight.
local function DressIcon(button, size)
	local icon = button:CreateTexture(nil, "ARTWORK")
	icon:SetAllPoints()
	button.icon = icon
	-- The mask art is 64 wide for a 45 wide icon: most of it is margin. Blizzard leaves it at that
	-- size, centred on the icon, so only the icon's corners are rounded off. Fitted to the icon it
	-- shrinks the picture to two thirds and leaves a dark ring inside the frame.
	if ns.HasAtlas("UI-HUD-ActionBar-IconFrame-Mask") and button.CreateMaskTexture then
		local mask = button:CreateMaskTexture()
		mask:SetAtlas("UI-HUD-ActionBar-IconFrame-Mask")
		mask:SetPoint("CENTER", icon, "CENTER")
		mask:SetSize(size * 64 / 45, size * 64 / 45)
		icon:AddMaskTexture(mask)
		button.iconMask = mask
	end
	if ns.HasAtlas("UI-HUD-ActionBar-IconFrame") then
		local w = size * 46 / 45
		local border = button:CreateTexture(nil, "OVERLAY")
		border:SetAtlas("UI-HUD-ActionBar-IconFrame")
		border:SetPoint("TOPLEFT")
		border:SetSize(w, size)
		local pushed = button:CreateTexture(nil, "OVERLAY")
		pushed:SetAtlas("UI-HUD-ActionBar-IconFrame-Down")
		pushed:SetPoint("TOPLEFT")
		pushed:SetSize(w, size)
		button:SetPushedTexture(pushed)
		local hl = button:CreateTexture(nil, "HIGHLIGHT")
		hl:SetAtlas("UI-HUD-ActionBar-IconFrame-Mouseover")
		hl:SetPoint("TOPLEFT")
		hl:SetSize(w, size)
		hl:SetBlendMode("ADD")
		report["icon button art"] = "action bar button"
	else
		local hl = button:CreateTexture(nil, "HIGHLIGHT")
		hl:SetAllPoints()
		hl:SetColorTexture(1, 1, 1, 0.15)
		report["icon button art"] = "plain icon"
	end
	return icon
end
UI.DressIcon = DressIcon

-- The spell alert glow the action bars use for a proc, round an icon button. Falls back to a
-- pulsing highlight. Returns the texture and its animation, both stopped and hidden.
local function MakeGlow(button, size)
	local glow = button:CreateTexture(nil, "OVERLAY", nil, 7)
	glow:SetPoint("CENTER")
	glow:SetSize(size * 1.42, size * 1.42)
	glow:Hide()
	local anim = glow:CreateAnimationGroup()
	local style
	if ns.HasAtlas("UI-HUD-ActionBar-Proc-Loop-Flipbook") then
		glow:SetAtlas("UI-HUD-ActionBar-Proc-Loop-Flipbook")
		local ok = pcall(function()
			local flip = anim:CreateAnimation("FlipBook")
			flip:SetDuration(1)
			flip:SetFlipBookRows(6)
			flip:SetFlipBookColumns(5)
			flip:SetFlipBookFrames(30)
			flip:SetFlipBookFrameWidth(0)
			flip:SetFlipBookFrameHeight(0)
		end)
		if ok then
			anim:SetLooping("REPEAT")
			style = "spell alert flipbook"
		end
	end
	if not style then
		if ns.HasAtlas("UI-HUD-ActionBar-IconFrame-Mouseover") then
			glow:SetAtlas("UI-HUD-ActionBar-IconFrame-Mouseover")
		else
			glow:SetColorTexture(0.35, 0.75, 1, 0.6)
		end
		glow:SetBlendMode("ADD")
		local pulse = anim:CreateAnimation("Alpha")
		pulse:SetFromAlpha(0.3)
		pulse:SetToAlpha(1)
		pulse:SetDuration(0.6)
		anim:SetLooping("BOUNCE")
		style = "pulse"
	end
	return glow, anim, style
end
UI.MakeGlow = MakeGlow

-- Character creation's play and stop buttons, laid over the Ready icon so it reads as a button to
-- press. Other art from this client's atlas table stands in when those are missing.
local PLAY_ART = { "charactercreate-customize-playbutton", "common-icon-forwardarrow", "CGuy_Play" }
local STOP_ART = { "charactercreate-customize-stopbutton", "CGuy_Stop" }

local function FirstAtlas(list)
	for _, atlas in ipairs(list) do
		if ns.HasAtlas(atlas) then return atlas end
	end
	return nil
end

local function BuildReadyBar()
	readyButton = CreateFrame("Button", "ConjurerReadyButton", frame)
	readyButton:SetSize(42, 42)
	readyButton:SetPoint("TOPLEFT", frame, "TOPLEFT", 72, -32)
	readyButton:RegisterForClicks("LeftButtonUp", "RightButtonUp")
	DressIcon(readyButton, 42)

	local play, stop = FirstAtlas(PLAY_ART), FirstAtlas(STOP_ART)
	readyButton.play = readyButton:CreateTexture(nil, "OVERLAY", nil, 2)
	readyButton.play:SetPoint("CENTER")
	readyButton.play:SetSize(30, 30)
	if play then readyButton.play:SetAtlas(play) end
	readyButton.stop = readyButton:CreateTexture(nil, "OVERLAY", nil, 2)
	readyButton.stop:SetPoint("CENTER")
	readyButton.stop:SetSize(26, 26)
	if stop then readyButton.stop:SetAtlas(stop) end
	readyButton.stop:Hide()
	readyButton.playArt, readyButton.stopArt = play, stop
	-- Without either piece of art, words say it instead.
	readyButton.playText = readyButton:CreateFontString(nil, "OVERLAY", "GameFontNormalOutline")
	readyButton.playText:SetPoint("BOTTOM", 0, 3)
	readyButton.playText:Hide()
	report["ready play art"] = (play or "none") .. " / " .. (stop or "none")

	local style
	readyGlow, readyAnim, style = MakeGlow(readyButton, 42)
	report["ready glow"] = style

	readyButton:SetScript("OnClick", Guard("Ready button", function(_, which)
		if which == "RightButton" and ns.Conjure.armed then
			ns.Conjure.Disarm("Ready is off.")
		else
			ns.Conjure.Toggle()
		end
		Sound("IG_MAINMENU_OPTION_CHECKBOX_ON", 856)
	end))
	Tip(readyButton, "Start conjuring",
		"Click to get Ready. The button lights up, and while it's lit, holding your key conjures each row in turn until its target is met. Click again (stop), or enter combat, to switch it off.")

	readyTitle = Text(frame, "GameFontNormalLarge")
	readyTitle:SetPoint("TOPLEFT", readyButton, "TOPRIGHT", 10, -2)
	readyTitle:SetWidth(330)
	readyDetail = Text(frame, "GameFontHighlightSmall")
	readyDetail:SetPoint("TOPLEFT", readyTitle, "BOTTOMLEFT", 0, -4)
	readyDetail:SetWidth(330)
	readyDetail:SetWordWrap(true)
	readyDetail:SetJustifyV("TOP")
	readyDetail:SetHeight(26)

	keyButton = NewButton(frame, "Key: F", 118, 22)
	keyButton:SetPoint("TOPRIGHT", frame, "TOPRIGHT", -16, -34)
	keyButton:RegisterForClicks("AnyUp")
	keyHint = Text(frame, "GameFontDisableSmall")
	keyHint:SetPoint("TOP", keyButton, "BOTTOM", 0, -3)
	keyHint:SetText("the key you hold")
	Tip(keyButton, "The key you hold",
		"Click, then press the key (or a side mouse button) you want to hold to conjure. Conjurer only uses it while Ready is lit; the rest of the time it does whatever you have it bound to. Escape cancels.")

	-- Covers the window without taking the mouse, so it has a real size to take keys with.
	capture = CreateFrame("Frame", nil, frame)
	capture:SetAllPoints(frame)
	capture:Hide()
	local IGNORED = { LSHIFT = true, RSHIFT = true, LCTRL = true, RCTRL = true, LALT = true, RALT = true,
		LMETA = true, RMETA = true, UNKNOWN = true }
	local function Modifiers()
		local s = ""
		if IsAltKeyDown and IsAltKeyDown() then s = s .. "ALT-" end
		if IsControlKeyDown and IsControlKeyDown() then s = s .. "CTRL-" end
		if IsShiftKeyDown and IsShiftKeyDown() then s = s .. "SHIFT-" end
		return s
	end
	local function EndCapture()
		capturing = false
		if capture.EnableKeyboard then pcall(capture.EnableKeyboard, capture, false) end
		capture:Hide()
		UI.Refresh()
	end
	local function Accept(key)
		ns.db.key = key
		EndCapture()
		ns.Log("key set to " .. key)
		ns.Conjure.Rebind()
		ns.Print("You'll hold " .. ns.Conjure.KeyText(key) .. " to conjure.")
	end
	capture:SetScript("OnKeyDown", Guard("key capture", function(_, key)
		if key == "ESCAPE" then EndCapture() return end
		if IGNORED[key] then return end
		Accept(Modifiers() .. key)
	end))
	UI.EndCapture, UI.AcceptKey = EndCapture, Accept

	local MOUSE = { Button4 = "BUTTON4", Button5 = "BUTTON5", MiddleButton = "BUTTON3" }
	keyButton:SetScript("OnClick", Guard("Key button", function(_, which)
		if capturing then
			if MOUSE[which] then Accept(Modifiers() .. MOUSE[which]) else EndCapture() end
			return
		end
		if which ~= "LeftButton" then return end
		if ns.InCombat() then
			ns.Print("Set the key out of combat.")
			return
		end
		capturing = true
		capture:Show()
		if capture.EnableKeyboard then pcall(capture.EnableKeyboard, capture, true) end
		if capture.SetPropagateKeyboardInput then pcall(capture.SetPropagateKeyboardInput, capture, false) end
		UI.Refresh()
	end))
end

-- ------------------------------------------------------------------
-- Sections
-- ------------------------------------------------------------------

local ART = {
	left = "Options_ListExpand_Left",
	middle = "_Options_ListExpand_Middle",
	right = "Options_ListExpand_Right",
	open = "Options_ListExpand_Right_Expanded",
}
local headerArt

local function HasHeaderArt()
	if headerArt == nil then
		headerArt = ns.HasAtlas(ART.left) and ns.HasAtlas(ART.middle) and ns.HasAtlas(ART.right) and ns.HasAtlas(ART.open)
		report["section header art"] = headerArt and "Blizzard list header (Options_ListExpand)"
			or "plain bars (the list header atlases are missing)"
	end
	return headerArt
end

local function NewHeader(parent, def)
	local h = CreateFrame("Button", nil, parent)
	h:SetHeight(26)
	if HasHeaderArt() then
		local function Three(layer, alpha)
			local l = h:CreateTexture(nil, layer)
			l:SetAtlas(ART.left, true)
			l:SetPoint("TOPLEFT")
			local r = h:CreateTexture(nil, layer)
			r:SetAtlas(ART.right, true)
			r:SetPoint("TOPRIGHT")
			local m = h:CreateTexture(nil, layer)
			m:SetAtlas(ART.middle)
			m:SetPoint("TOPLEFT", l, "TOPRIGHT")
			m:SetPoint("BOTTOMRIGHT", r, "BOTTOMLEFT")
			if alpha then
				for _, t in ipairs({ l, r, m }) do
					t:SetAlpha(alpha)
					t:SetBlendMode("ADD")
				end
			end
			return r
		end
		h.Right = Three("BACKGROUND")
		h.HighlightRight = Three("HIGHLIGHT", 0.4)
	else
		local bg = h:CreateTexture(nil, "BACKGROUND")
		bg:SetAllPoints()
		bg:SetColorTexture(0.14, 0.11, 0.07, 0.95)
		local line = h:CreateTexture(nil, "BORDER")
		line:SetPoint("BOTTOMLEFT")
		line:SetPoint("BOTTOMRIGHT")
		line:SetHeight(1)
		line:SetColorTexture(0.75, 0.62, 0.32, 0.8)
		local hl = h:CreateTexture(nil, "HIGHLIGHT")
		hl:SetAllPoints()
		hl:SetColorTexture(1, 1, 1, 0.08)
		h.Sign = Text(h, "GameFontNormalLarge")
		h.Sign:SetPoint("RIGHT", -12, 0)
	end
	h.Name = Text(h, "GameFontNormal")
	h.Name:SetPoint("LEFT", 12, 0)
	h.Name:SetText(def.title)
	h.Summary = Text(h, "GameFontDisableSmall")
	h.Summary:SetPoint("LEFT", h.Name, "RIGHT", 10, 0)
	h:SetScript("OnClick", Guard("section header", function() UI.ToggleSection(def.key) end))
	return h
end

function UI.ToggleSection(key)
	local collapsed = not ns.db.collapsed[key]
	ns.db.collapsed[key] = collapsed
	Sound(collapsed and "IG_MAINMENU_OPTION_CHECKBOX_OFF" or "IG_MAINMENU_OPTION_CHECKBOX_ON", 856)
	UI.Refresh()
end

function UI.CollapseAll(collapsed)
	for _, def in ipairs(SECTIONS) do ns.db.collapsed[def.key] = collapsed and true or false end
	UI.Refresh()
end

-- The one-line summary a closed section shows.
local function RankSummary(kind)
	local ranks, have, want = 0, 0, 0
	for _, entry in ipairs(ns.KINDS[kind]) do
		local t = ns.Target(entry, UI.ViewKey())
		if t > 0 and ns.Known(entry.spell) and ns.Shown(entry) then
			ranks = ranks + 1
			have = have + math.min(ns.Count(entry.item), t)
			want = want + t
		end
	end
	if ranks == 0 then return "nothing planned" end
	return ranks .. " rank" .. (ranks == 1 and "" or "s") .. ", " .. have .. " of " .. want
end

local SUMMARY = {
	water = function() return RankSummary("water") end,
	food = function() return RankSummary("food") end,
	gems = function()
		if not ns.db.gems.keep then return "off" end
		local kept, missing = 0, 0
		for _, gem in ipairs(ns.GEMS) do
			if ns.Known(gem.spell) and ns.KeepsGem(gem) then
				kept = kept + 1
				if ns.Count(gem.item) == 0 then missing = missing + 1 end
			end
		end
		return "keeping " .. kept .. (missing > 0 and (", " .. missing .. " missing") or ", all there")
	end,
	shares = function()
		local n, total = 0, 0
		for _, file in ipairs(ns.Classes()) do
			total = total + 1
			local s = ns.Share(file)
			if (s.water or 0) + (s.food or 0) > 0 then n = n + 1 end
		end
		return n .. " of " .. total .. " classes get a share, you keep " .. (ns.db.keep.water or 0) .. " water and "
			.. (ns.db.keep.food or 0) .. " food"
	end,
	group = function() return ns.Trade.Summary() end,
	macro = function() return ns.Macro.Summary() end,
	alert = function() return ns.Alert.Summary() end,
	announce = function() return ns.Announce.Summary() end,
	options = function()
		return "Press and Hold Casting " .. (ns.Conjure.HoldReady() and "on" or "off")
	end,
}

-- ------------------------------------------------------------------
-- Section bodies
-- ------------------------------------------------------------------

-- One row per rank, built once; only the ranks you've learned are shown, laid out in RefreshRanks.
local function BuildRanks(body, kind)
	local list = ns.KINDS[kind]
	body.empty = Text(body, "GameFontDisable")
	body.empty:SetPoint("TOPLEFT", body, "TOPLEFT", 14, -8)
	body.empty:SetText("You haven't learned Conjure " .. ns.KIND_LABEL[kind] .. " yet.")
	body.empty:Hide()
	for r = #list, 1, -1 do
		local entry = list[r]
		local row = CreateFrame("Frame", nil, body)
		row:SetHeight(ROW_H)
		row:Hide()
		row.entry = entry
		row.icon = row:CreateTexture(nil, "ARTWORK")
		row.icon:SetSize(22, 22)
		row.icon:SetPoint("LEFT", 8, 0)
		row.name = Text(row, "GameFontHighlight")
		row.name:SetPoint("LEFT", 36, 0)
		row.name:SetWidth(168)
		row.level = Text(row, "GameFontDisableSmall")
		row.level:SetPoint("LEFT", 208, 0)
		row.level:SetWidth(56)
		row.have = Text(row, "GameFontHighlightSmall")
		row.have:SetPoint("LEFT", 266, 0)
		row.have:SetWidth(62)
		row.slider = NewSlider(row, SLIDER_W, 0, 300, 5, function(v)
			ns.SetTarget(entry, v, UI.ViewKey())
			ns.Refresh()
		end)
		row.slider:SetPoint("LEFT", 330, 0)
		row:EnableMouse(true)
		row:SetScript("OnEnter", function(self)
			GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
			local ok = GameTooltip.SetItemByID and pcall(GameTooltip.SetItemByID, GameTooltip, entry.item)
			if not ok then GameTooltip:SetText(entry.name, 1, 1, 1) end
			GameTooltip:AddLine("Rank " .. entry.rank .. ". Set how many you want in your bags.", 0.6, 0.85, 1, true)
			GameTooltip:Show()
		end)
		row:SetScript("OnLeave", function() GameTooltip:Hide() end)
		rankRows[kind][#rankRows[kind] + 1] = row
	end
	body:SetHeight(ROW_H)
end

-- Shows the ranks this character has learned (just the best one unless "Show all ranks" is
-- ticked), best first, closing up over the others.
local function RefreshRanks(kind)
	local body = sections[kind].body
	local y, shown = 2, 0
	for _, row in ipairs(rankRows[kind]) do
		local entry = row.entry
		if ns.Known(entry.spell) and ns.Shown(entry) then
			row:ClearAllPoints()
			row:SetPoint("TOPLEFT", body, "TOPLEFT", 0, -y)
			row:SetPoint("TOPRIGHT", body, "TOPRIGHT", 0, -y)
			row:Show()
			local have, target = ns.Count(entry.item), ns.Target(entry, UI.ViewKey())
			row.icon:SetTexture(ns.ItemIcon(entry))
			row.name:SetText(ns.ShortName(entry))
			row.level:SetText("Level " .. entry.level)
			row.have:SetText("Have " .. have)
			if target > 0 and have >= target then
				row.have:SetTextColor(0.4, 0.85, 0.4)
			elseif target > 0 then
				row.have:SetTextColor(1, 0.82, 0)
			else
				row.have:SetTextColor(0.8, 0.8, 0.8)
			end
			row.slider:Set(target)
			y = y + ROW_H
			shown = shown + 1
		else
			row:Hide()
		end
	end
	body.empty:SetShown(shown == 0)
	if shown == 0 then y = y + 26 end
	body:SetHeight(y + 2)
end

local gemRows = {}

local function BuildGems(body)
	local y = 4
	local keep = NewCheck(body, "Keep your mana gems",
		function() return ns.db.gems.keep end,
		function(v)
			ns.db.gems.keep = v
			if ns.Conjure.armed then ns.Conjure.Update() end
			ns.Alert.Update()
		end,
		"Ready conjures any ticked gem you're missing, one of each as the game allows, and the low alert shows it until you have it again.")
	keep:SetPoint("TOPLEFT", body, "TOPLEFT", 8, -y)
	body.keepCheck = keep
	y = y + 28
	body.rowsTop = y
	for r = #ns.GEMS, 1, -1 do
		local gem = ns.GEMS[r]
		local row = CreateFrame("Frame", nil, body)
		row:SetHeight(ROW_H)
		row:Hide()
		row.gem = gem
		row.icon = row:CreateTexture(nil, "ARTWORK")
		row.icon:SetSize(22, 22)
		row.icon:SetPoint("LEFT", 30, 0)
		row.name = Text(row, "GameFontHighlight")
		row.name:SetPoint("LEFT", 58, 0)
		row.name:SetWidth(146)
		row.level = Text(row, "GameFontDisableSmall")
		row.level:SetPoint("LEFT", 208, 0)
		row.level:SetWidth(56)
		row.have = Text(row, "GameFontHighlightSmall")
		row.have:SetPoint("LEFT", 266, 0)
		row.have:SetWidth(62)
		row.check = NewCheck(row, "Keep", function() return ns.db.gems[gem.spell] ~= false end,
			function(v)
				ns.db.gems[gem.spell] = v
				if ns.Conjure.armed then ns.Conjure.Update() end
				ns.Alert.Update()
			end, nil)
		row.check:SetPoint("LEFT", row, "LEFT", 330, 0)
		row:EnableMouse(true)
		row:SetScript("OnEnter", function(self)
			GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
			local ok = GameTooltip.SetItemByID and pcall(GameTooltip.SetItemByID, GameTooltip, gem.item)
			if not ok then GameTooltip:SetText(gem.name, 1, 1, 1) end
			GameTooltip:Show()
		end)
		row:SetScript("OnLeave", function() GameTooltip:Hide() end)
		gemRows[#gemRows + 1] = row
	end
	body.empty = Text(body, "GameFontDisable")
	body.empty:SetText("You haven't learned Conjure Mana Agate yet; mages learn it at level 28.")
	body.empty:Hide()
	body:SetHeight(y)
end

local function RefreshGems(body)
	local y, shown = body.rowsTop, 0
	local keeping = ns.db.gems.keep
	for _, row in ipairs(gemRows) do
		local gem = row.gem
		if ns.Known(gem.spell) then
			row:ClearAllPoints()
			row:SetPoint("TOPLEFT", body, "TOPLEFT", 0, -y)
			row:SetPoint("TOPRIGHT", body, "TOPRIGHT", 0, -y)
			row:Show()
			row.icon:SetTexture(ns.ItemIcon(gem))
			row.name:SetText(ns.ItemName(gem))
			row.level:SetText("Level " .. gem.level)
			local have = ns.Count(gem.item) > 0
			row.have:SetText(have and "Have it" or "Missing")
			if have then row.have:SetTextColor(0.4, 0.85, 0.4) elseif keeping and ns.KeepsGem(gem) then row.have:SetTextColor(1, 0.6, 0.2) else row.have:SetTextColor(0.8, 0.8, 0.8) end
			row.check:SetAlpha(keeping and 1 or 0.45)
			row.check.label:SetAlpha(keeping and 1 or 0.45)
			y = y + ROW_H
			shown = shown + 1
		else
			row:Hide()
		end
	end
	body.empty:ClearAllPoints()
	body.empty:SetPoint("TOPLEFT", body, "TOPLEFT", 14, -y - 4)
	body.empty:SetShown(shown == 0)
	if shown == 0 then y = y + 24 end
	body:SetHeight(y + 4)
end

local function ShareRow(body, y, label, iconSet, get, set, maxV)
	local row = CreateFrame("Frame", nil, body)
	row:SetHeight(ROW_H)
	row:SetPoint("TOPLEFT", body, "TOPLEFT", 0, -y)
	row:SetPoint("TOPRIGHT", body, "TOPRIGHT", 0, -y)
	row.icon = row:CreateTexture(nil, "ARTWORK")
	row.icon:SetSize(18, 18)
	row.icon:SetPoint("LEFT", 8, 0)
	iconSet(row.icon)
	row.name = Text(row, "GameFontHighlight")
	row.name:SetPoint("LEFT", 32, 0)
	row.name:SetWidth(112)
	row.name:SetText(label)
	row.water = NewSlider(row, 150, 0, maxV, 5, function(v) set("water", v) ns.Refresh() end)
	row.water:SetPoint("LEFT", 150, 0)
	row.food = NewSlider(row, 150, 0, maxV, 5, function(v) set("food", v) ns.Refresh() end)
	row.food:SetPoint("LEFT", 352, 0)
	row.Sync = function()
		row.water:Set(get("water"))
		row.food:Set(get("food"))
	end
	shareRows[#shareRows + 1] = row
	return row
end

local function BuildShares(body)
	local y = 4
	local waterLabel = Text(body, "GameFontNormalSmall")
	waterLabel:SetPoint("TOPLEFT", body, "TOPLEFT", 150 + 19, -y)
	waterLabel:SetText("Water")
	local foodLabel = Text(body, "GameFontNormalSmall")
	foodLabel:SetPoint("TOPLEFT", body, "TOPLEFT", 352 + 19, -y)
	foodLabel:SetText("Food")
	y = y + 16

	local keep = ShareRow(body, y, "You keep", function(tex)
		tex:SetTexture(ns.SpellIcon(ns.WATER[#ns.WATER]))
	end, function(kind) return ns.db.keep[kind] or 0 end, function(kind, v) ns.db.keep[kind] = v end, 200)
	keep.name:SetTextColor(1, 0.82, 0)
	Tip(keep, "You keep", "What you conjure for yourself on top of the group's shares, at your best rank. Fill targets from group adds it in.")
	y = y + ROW_H

	for _, file in ipairs(ns.Classes()) do
		local row = ShareRow(body, y, ns.ClassName(file), function(tex) ns.SetClassIcon(tex, file) end,
			function(kind) return ns.Share(file)[kind] or 0 end,
			function(kind, v) ns.Share(file)[kind] = v end, 100)
		row.name:SetTextColor(ns.ClassColor(file))
		y = y + ROW_H
	end

	y = y + 6
	local checks = {
		{ "Fill the trade window when a group member opens trade with you",
			function() return ns.db.autoFill end, function(v) ns.db.autoFill = v end,
			"Their share goes in by itself. You still press the game's Trade button to finish." },
		{ "Give the highest rank each person can use",
			function() return ns.db.bestRank end, function(v) ns.db.bestRank = v end,
			"Conjured food and water need a level. Off: everyone gets your best rank." },
		{ "Include the whole raid, not just your group of five",
			function() return ns.db.includeRaid end, function(v) ns.db.includeRaid = v end, nil },
	}
	for _, c in ipairs(checks) do
		local cb = NewCheck(body, c[1], c[2], c[3], c[4])
		cb:SetPoint("TOPLEFT", body, "TOPLEFT", 8, -y)
		y = y + 26
	end
	body:SetHeight(y + 4)
end

local function MemberRow(body, i)
	local row = memberRows[i]
	if row then return row end
	row = CreateFrame("Frame", nil, body)
	row:SetHeight(26)
	row.icon = row:CreateTexture(nil, "ARTWORK")
	row.icon:SetSize(18, 18)
	row.icon:SetPoint("LEFT", 8, 0)
	row.name = Text(row, "GameFontHighlight")
	row.name:SetPoint("LEFT", 30, 0)
	row.name:SetWidth(140)
	row.share = Text(row, "GameFontHighlightSmall")
	row.share:SetPoint("LEFT", 174, 0)
	row.share:SetWidth(186)
	row.status = Text(row, "GameFontNormalSmall")
	row.status:SetPoint("LEFT", 364, 0)
	row.status:SetWidth(112)
	row.button = NewButton(row, "Trade", 70, 22)
	row.button:SetPoint("RIGHT", -6, 0)
	row.button:SetScript("OnClick", Guard("group Trade button", function()
		if row.member then ns.Trade.Request(row.member, row.full) end
	end))
	memberRows[i] = row
	return row
end

-- The top of the Group section: how long a hand-out counts before that member is owed again.
local GROUP_TOP = 32

local function BuildGroupTop(body)
	local label = Text(body, "GameFontHighlight")
	label:SetPoint("TOPLEFT", body, "TOPLEFT", 14, -9)
	label:SetText("Forget handed out after")
	local slider = NewSlider(body, 178, 0, 120, 5, function(v)
		ns.db.handedMinutes = v
		ns.Refresh()
	end)
	slider:SetPoint("TOPLEFT", body, "TOPLEFT", 186, -6)
	local hint = Text(body, "GameFontDisableSmall")
	hint:SetPoint("TOPLEFT", body, "TOPLEFT", 400, -10)
	hint:SetText("minutes (0: until you reset)")
	syncers[#syncers + 1] = function() slider:Set(tonumber(ns.db.handedMinutes) or 0) end
	body.minutesSlider = slider
end

local function RefreshGroup(body)
	local members = ns.Trade.Members()
	local y = GROUP_TOP
	for i, m in ipairs(members) do
		local row = MemberRow(body, i)
		row:ClearAllPoints()
		row:SetPoint("TOPLEFT", body, "TOPLEFT", 0, -y)
		row:SetPoint("TOPRIGHT", body, "TOPRIGHT", 0, -y)
		row.member = m
		ns.SetClassIcon(row.icon, m.class)
		row.name:SetText("|c" .. ns.ClassHex(m.class) .. m.name .. "|r  |cff9d9d9d" .. (m.level or "??") .. "|r")
		row.share:SetText(ns.Trade.ShareText(m))
		local text, tone, action = ns.Trade.Status(m)
		local c = ns.Trade.COLORS[tone] or ns.Trade.COLORS.grey
		row.status:SetText(text)
		row.status:SetTextColor(c[1], c[2], c[3])
		row.full = action == "Again"
		if action then
			row.button:SetText(action)
			row.button:Show()
		else
			row.button:Hide()
		end
		row:Show()
		y = y + 26
	end
	for i = #members + 1, #memberRows do memberRows[i]:Hide() end
	groupEmpty:SetShown(#members == 0)
	if #members == 0 then y = y + 30 end
	body:SetHeight(y + 4)
end

local function BuildMacro(body)
	local y = 8
	macroButton = CreateFrame("Button", "ConjurerMacroButton", body)
	macroButton:SetSize(36, 36)
	macroButton:SetPoint("TOPLEFT", body, "TOPLEFT", 12, -y)
	DressIcon(macroButton, 36)
	macroButton:RegisterForDrag("LeftButton")
	macroButton:SetScript("OnDragStart", Guard("macro drag", function() ns.Macro.Pickup() end))
	macroButton:SetScript("OnClick", Guard("macro button", function() ns.Macro.Pickup() UI.Refresh() end))
	Tip(macroButton, "Eat and drink",
		"Drag this onto your action bar. One press eats your best conjured food and drinks your best conjured water at the same time. Conjurer keeps it pointed at your best ranks as your bags change.")

	macroText = Text(body, "GameFontHighlight")
	macroText:SetPoint("TOPLEFT", macroButton, "TOPRIGHT", 12, -1)
	macroText:SetWidth(290)
	macroStatus = Text(body, "GameFontDisableSmall")
	macroStatus:SetPoint("TOPLEFT", macroText, "BOTTOMLEFT", 0, -5)
	macroStatus:SetWidth(290)

	macroMake = NewButton(body, "Make macro", 120, 22)
	macroMake:SetPoint("TOPRIGHT", body, "TOPRIGHT", -12, -y - 6)
	macroMake:SetScript("OnClick", Guard("Make macro", function()
		ns.Macro.Write(true)
		UI.Refresh()
	end))
	Tip(macroMake, "Make macro", "Writes the " .. ns.Macro.NAME .. " macro now. After that Conjurer keeps it up to date.")
	y = y + 46

	local checks = {
		{ "Keep it up to date as your bags change", function() return ns.db.macro.auto end,
			function(v) ns.db.macro.auto = v if v then ns.Macro.Write(false) end end, nil },
		{ "Save it with this character's macros", function() return ns.db.macro.perCharacter end,
			function(v) ns.db.macro.perCharacter = v end,
			"Off: with the macros every character shares. Takes effect the next time the macro is made." },
	}
	for _, c in ipairs(checks) do
		local cb = NewCheck(body, c[1], c[2], c[3], c[4])
		cb:SetPoint("TOPLEFT", body, "TOPLEFT", 8, -y)
		y = y + 26
	end
	body:SetHeight(y + 4)
end

local function RefreshMacro()
	local _, food, water = ns.Macro.Body()
	local icon = (food and ns.ItemIcon(food)) or (water and ns.ItemIcon(water)) or "Interface\\Icons\\INV_Misc_QuestionMark"
	macroButton.icon:SetTexture(icon)
	local parts = {}
	if food then parts[#parts + 1] = "eats " .. ns.ShortName(food) end
	if water then parts[#parts + 1] = "drinks " .. ns.ShortName(water) end
	macroText:SetText(#parts > 0 and ("One press " .. table.concat(parts, " and ") .. ".") or "No conjured food or water to use yet.")
	local index = ns.Macro.Index()
	if index > 0 then
		macroStatus:SetText(ns.Macro.NAME .. ": " .. (ns.Macro.status or "made") .. ", "
			.. (ns.Macro.IsCharacterMacro(index) and "a character macro" or "a general macro") .. ". Drag the icon to your bar.")
		macroMake:SetText("Update macro")
	else
		macroStatus:SetText("Not made yet. Click Make macro, or drag the icon to your bar.")
		macroMake:SetText("Make macro")
	end
end

local function BuildAlert(body)
	local y = 4
	local on = NewCheck(body, "Show an alert icon when your conjured water or food runs low",
		function() return ns.db.alert.enabled end,
		function(v) ns.db.alert.enabled = v ns.Alert.Update() end,
		"One icon per kind that's low, with how many you have left.")
	on:SetPoint("TOPLEFT", body, "TOPLEFT", 8, -y)
	y = y + 30
	for _, kind in ipairs(ns.KIND_ORDER) do
		local label = Text(body, "GameFontHighlight")
		label:SetPoint("TOPLEFT", body, "TOPLEFT", 38, -y - 4)
		label:SetText(ns.KIND_LABEL[kind] .. " below")
		local slider = NewSlider(body, 178, 0, 100, 5, function(v)
			ns.db.alert[kind] = v
			ns.Alert.Update()
			ns.Refresh()
		end)
		slider:SetPoint("TOPLEFT", body, "TOPLEFT", 150, -y)
		syncers[#syncers + 1] = function() slider:Set(ns.db.alert[kind] or 0) end
		body[kind .. "Slider"] = slider
		y = y + ROW_H
	end
	local lower = NewCheck(body, "Count lower ranks too",
		function() return ns.db.alert.lowerRanks end,
		function(v) ns.db.alert.lowerRanks = v ns.Alert.Update() ns.Refresh() end,
		"Off: only your best rank counts (and any better one you were given), so 40 Water won't hide that you're out of Fresh Water. On: every rank you're high enough to use counts.")
	lower:SetPoint("TOPLEFT", body, "TOPLEFT", 34, -y)
	body.lowerRanks = lower
	y = y + 30
	-- When it may show: three boxes that work as one choice.
	local whenLabel = Text(body, "GameFontHighlight")
	whenLabel:SetPoint("TOPLEFT", body, "TOPLEFT", 38, -y - 5)
	whenLabel:SetText("Show it")
	local x = 110
	body.when = {}
	for _, when in ipairs(ns.Alert.WHEN) do
		local label = ns.Alert.WHEN_LABEL[when]
		local cb = NewCheck(body, label, function() return (ns.db.alert.when or "out") == when end,
			function() ns.Alert.SetWhen(when) end, nil)
		cb:SetPoint("TOPLEFT", body, "TOPLEFT", x, -y)
		body.when[when] = cb
		x = x + 30 + math.max(60, #label * 7)
	end
	y = y + 30
	local sound = NewCheck(body, "Play a sound when it appears",
		function() return ns.db.alert.sound end, function(v) ns.db.alert.sound = v end, nil)
	sound:SetPoint("TOPLEFT", body, "TOPLEFT", 8, -y)
	y = y + 30
	alertMove = NewButton(body, "Show it to move it", 150, 22)
	alertMove:SetPoint("TOPLEFT", body, "TOPLEFT", 12, -y)
	alertMove:SetScript("OnClick", Guard("alert move", function()
		ns.Alert.SetPreview(not ns.Alert.preview)
		UI.Refresh()
	end))
	local hint = Text(body, "GameFontDisableSmall")
	hint:SetPoint("LEFT", alertMove, "RIGHT", 10, 0)
	hint:SetWidth(360)
	hint:SetText("Drag it into place. Its play button starts conjuring; the cog opens this window.")
	y = y + 30
	body:SetHeight(y + 4)
end

local function NewEditBox(parent, width)
	local ok, box = pcall(CreateFrame, "EditBox", nil, parent, "InputBoxTemplate")
	if ok and box then
		report["edit box template"] = "InputBoxTemplate"
	else
		box = CreateFrame("EditBox", nil, parent)
		box:SetFontObject("ChatFontNormal")
		local bg = box:CreateTexture(nil, "BACKGROUND")
		bg:SetPoint("TOPLEFT", -4, 2)
		bg:SetPoint("BOTTOMRIGHT", 4, -2)
		bg:SetColorTexture(0, 0, 0, 0.6)
		report["edit box template"] = "plain"
	end
	box:SetSize(width, 20)
	box:SetAutoFocus(false)
	if box.SetMaxLetters then box:SetMaxLetters(255) end
	return box
end

local function BuildAnnounce(body)
	local y = 4
	local shown = NewCheck(body, "Show the announce button",
		function() return ns.db.announce.shown end,
		function(v) ns.db.announce.shown = v ns.Announce.Update() end,
		"A button you can put anywhere. One click tells your party, raid or battleground to trade you for food and water, with how much you have left.")
	shown:SetPoint("TOPLEFT", body, "TOPLEFT", 8, -y)
	y = y + 26
	local groupOnly = NewCheck(body, "Only while you're in a group",
		function() return ns.db.announce.groupOnly end,
		function(v) ns.db.announce.groupOnly = v ns.Announce.Update() end, nil)
	groupOnly:SetPoint("TOPLEFT", body, "TOPLEFT", 8, -y)
	body.shownCheck, body.groupCheck = shown, groupOnly
	y = y + 30

	local label = Text(body, "GameFontHighlight")
	label:SetPoint("TOPLEFT", body, "TOPLEFT", 14, -y - 3)
	label:SetText("Message")
	announceBox = NewEditBox(body, 440)
	announceBox:SetPoint("TOPLEFT", body, "TOPLEFT", 84, -y)
	announceBox:SetScript("OnTextChanged", Guard("announce text", function(self, userInput)
		if not userInput then return end
		ns.db.announce.message = self:GetText()
		UI.Refresh()
	end))
	announceBox:SetScript("OnEnterPressed", function(self) self:ClearFocus() end)
	announceBox:SetScript("OnEscapePressed", function(self) self:ClearFocus() end)
	syncers[#syncers + 1] = function()
		if announceBox.HasFocus and announceBox:HasFocus() then return end
		announceBox:SetText(ns.db.announce.message or ns.Announce.DEFAULT_MESSAGE)
	end
	y = y + 24
	local hint = Text(body, "GameFontDisableSmall")
	hint:SetPoint("TOPLEFT", body, "TOPLEFT", 84, -y)
	hint:SetText("{stock} becomes what you have left; {water} and {food} each kind.")
	y = y + 18
	announcePreview = Text(body, "GameFontHighlightSmall")
	announcePreview:SetPoint("TOPLEFT", body, "TOPLEFT", 14, -y)
	announcePreview:SetWidth(540)
	announcePreview:SetWordWrap(true)
	announcePreview:SetHeight(28)
	y = y + 32

	local send = NewButton(body, "Announce now", 120, 22)
	send:SetPoint("TOPLEFT", body, "TOPLEFT", 12, -y)
	send:SetScript("OnClick", Guard("Announce now", function() ns.Announce.Send() UI.Refresh() end))
	announceMove = NewButton(body, "Show it to move it", 150, 22)
	announceMove:SetPoint("LEFT", send, "RIGHT", 8, 0)
	announceMove:SetScript("OnClick", Guard("announce move", function()
		ns.Announce.SetPreview(not ns.Announce.preview)
		UI.Refresh()
	end))
	local reset = NewButton(body, "Reset text", 100, 22)
	reset:SetPoint("LEFT", announceMove, "RIGHT", 8, 0)
	reset:SetScript("OnClick", Guard("announce reset", function()
		ns.db.announce.message = nil
		UI.Refresh()
	end))
	y = y + 28
	body:SetHeight(y + 4)
end

local function RefreshAnnounce()
	local A = ns.Announce
	local text = A.Message()
	local channel = A.Channel()
	if not text then
		announcePreview:SetText("Nothing to offer yet: conjure some food or water first.")
	elseif channel then
		announcePreview:SetText("Sends to " .. A.CHANNEL_LABEL[channel] .. ": |cffffffff" .. text .. "|r")
	else
		announcePreview:SetText("Not in a group now. It would say: |cffffffff" .. text .. "|r")
	end
	announceMove:SetText(A.preview and "Done moving" or "Show it to move it")
end

local settingsState, settingsButton

local function BuildOptions(body)
	local y = 6
	-- The game's own hold to cast settings, as they stand, with a button to turn them on for good.
	settingsState = Text(body, "GameFontHighlight")
	settingsState:SetPoint("TOPLEFT", body, "TOPLEFT", 14, -y - 4)
	settingsState:SetWidth(390)
	settingsButton = NewButton(body, "Turn both on", 120, 22)
	settingsButton:SetPoint("TOPRIGHT", body, "TOPRIGHT", -12, -y)
	settingsButton:SetScript("OnClick", Guard("Turn both on", function()
		ns.Conjure.TurnSettingsOn()
		UI.Refresh()
	end))
	Tip(settingsButton, "Turn both on",
		"Turns on Press and Hold Casting and Cast on Key Down in the game's options for good, the same as ticking them in Options > Combat.")
	y = y + 30
	local checks = {
		{ "Turn them on while Ready is lit",
			function() return ns.db.manageCVars end, function(v) ns.db.manageCVars = v end,
			"When you click play, Conjurer turns on Press and Hold Casting and Cast on Key Down if they're off." },
		{ "Leave them on when Ready goes off",
			function() return ns.db.leaveCVarsOn end, function(v) ns.db.leaveCVarsOn = v end,
			"Off: they go back to how you had them. On: they stay on." },
		{ "Chime when a row reaches its target", function() return ns.db.chime end, function(v) ns.db.chime = v end, nil },
		{ "Conjure for your group's size", function() return ns.db.profileAuto end,
			function(v)
				-- Off, Ready keeps to the profile it was on until you click another tab.
				if not v then ns.db.profile = ns.ProfileKey() end
				ns.db.profileAuto = v
				UI.viewKey = nil
				ns.Log("profile: " .. ns.PROFILE_BY_KEY[ns.ProfileKey()].label .. (v and " (your group)" or " (kept)"))
				if ns.Conjure.armed then ns.Conjure.Update() end
				ns.Refresh()
			end,
			"On: Ready conjures the profile for your group now (solo, party, raid of 10, 20 or 40, or a battleground by its size), and clicking a tab only shows its amounts to set. Off: Ready conjures the tab you click." },
		{ "Show the minimap button", function() return ns.db.minimap.shown end,
			function(v) ns.db.minimap.shown = v if ns.Minimap then ns.Minimap.Apply() end end, nil },
	}
	body.checks = {}
	for _, c in ipairs(checks) do
		local cb = NewCheck(body, c[1], c[2], c[3], c[4])
		cb:SetPoint("TOPLEFT", body, "TOPLEFT", 8, -y)
		body.checks[c[1]] = cb
		y = y + 26
	end
	y = y + 4
	optionsInfo = Text(body, "GameFontDisableSmall")
	optionsInfo:SetPoint("TOPLEFT", body, "TOPLEFT", 14, -y)
	optionsInfo:SetWidth(520)
	optionsInfo:SetWordWrap(true)
	optionsInfo:SetHeight(28)
	y = y + 32
	local debug = NewButton(body, "Print debug report", 150, 22)
	debug:SetPoint("TOPLEFT", body, "TOPLEFT", 10, -y)
	debug:SetScript("OnClick", function()
		for _, line in ipairs(ns.DebugReport()) do DEFAULT_CHAT_FRAME:AddMessage(line) end
	end)
	y = y + 28
	body:SetHeight(y + 4)
end

-- ------------------------------------------------------------------
-- Building and laying out
-- ------------------------------------------------------------------

-- ------------------------------------------------------------------
-- Profile tabs, hanging under the window like the character and spellbook tabs
-- ------------------------------------------------------------------

local tabs = {}
local tabStyle, tabStrip, targetsBox
local TAB_MIN, TAB_H, TAB_X, TAB_GAP, TAB_TUCK = 72, 32, 8, 3, 1
local BOX_PAD = 6

-- Water and Food sit in their own inset, the only part a profile changes, and the profile tabs hang
-- from its bottom border. Like a window's tabs they rest under it: the inset's border is drawn above
-- them (a window's sits at frame level 500; the inset's shares the box's level, so it is raised) and
-- their tops start 1 up, inside the 3 pixel line. Blizzard overlaps its tabs by 16, but the tab
-- art's visible edge sits right at the tab's frame (the side pieces carry their own margin), so here
-- they stand 3 apart, spread across the whole width.
local function BuildTargetsBox()
	local ok, box = pcall(CreateFrame, "Frame", nil, content, "InsetFrameTemplate")
	if ok and box and box.NineSlice then
		report["targets box"] = "InsetFrameTemplate"
	else
		box = CreateFrame("Frame", nil, content)
		box:SetFrameLevel(content:GetFrameLevel())
		local bg = box:CreateTexture(nil, "BACKGROUND")
		bg:SetAllPoints()
		bg:SetColorTexture(0, 0, 0, 0.35)
		-- The lines get a frame of their own, like the template's NineSlice, so they can go over the tabs.
		box.NineSlice = CreateFrame("Frame", nil, box)
		box.NineSlice:SetAllPoints()
		for _, edge in ipairs({ { "TOPLEFT", "TOPRIGHT", true }, { "BOTTOMLEFT", "BOTTOMRIGHT", true },
			{ "TOPLEFT", "BOTTOMLEFT", false }, { "TOPRIGHT", "BOTTOMRIGHT", false } }) do
			local line = box.NineSlice:CreateTexture(nil, "BORDER")
			line:SetColorTexture(0.45, 0.4, 0.3, 0.9)
			line:SetPoint(edge[1])
			line:SetPoint(edge[2])
			if edge[3] then line:SetHeight(1) else line:SetWidth(1) end
		end
		report["targets box"] = "plain"
	end
	box:SetHeight(1)
	targetsBox = box
end

local function BuildTabs()
	tabStyle = "PanelTabButtonTemplate"
	tabStrip = CreateFrame("Frame", nil, content)
	tabStrip:SetHeight(TAB_H)
	tabStrip:SetWidth(content:GetWidth() or 1)
	-- Evenly spread across the list, never under the art's own minimum.
	local count = #ns.PROFILES
	local span = (content:GetWidth() or 0) - TAB_X - 3
	local width = math.max(TAB_MIN, math.floor((span - (count - 1) * TAB_GAP) / count))
	for i, def in ipairs(ns.PROFILES) do
		local ok, tab = pcall(CreateFrame, "Button", "ConjurerFrameTab" .. i, tabStrip, "PanelTabButtonTemplate")
		if not (ok and tab and tab.Text and tab.Left) then
			if ok and tab then tab:Hide() end
			tabStyle = "plain"
			tab = CreateFrame("Button", "ConjurerFrameTabPlain" .. i, tabStrip)
			tab:SetSize(math.floor((span - (count - 1) * TAB_GAP) / count), 24)
			tab.bg = tab:CreateTexture(nil, "BACKGROUND")
			tab.bg:SetAllPoints()
			tab.bg:SetColorTexture(0.12, 0.1, 0.07, 0.95)
			local fs = tab:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
			fs:SetPoint("CENTER")
			tab:SetFontString(fs)
			tab.Text = fs
			local hl = tab:CreateTexture(nil, "HIGHLIGHT")
			hl:SetAllPoints()
			hl:SetColorTexture(1, 1, 1, 0.1)
		end
		tab:SetID(i)
		tab:SetText(def.label)
		tab:ClearAllPoints()
		if i == 1 then
			tab:SetPoint("TOPLEFT", targetsBox, "BOTTOMLEFT", TAB_X, TAB_TUCK)
		elseif tabStyle == "PanelTabButtonTemplate" then
			tab:SetPoint("LEFT", tabs[i - 1], "RIGHT", TAB_GAP, 0)
		else
			tab:SetPoint("LEFT", tabs[i - 1], "RIGHT", TAB_GAP, 0)
		end
		-- A tab you click only shows its amounts, to see and set; Ready conjures the profile for your
		-- group's size, marked with a check. With "Conjure for your group's size" off, a click picks
		-- the profile Ready conjures instead.
		tab:SetScript("OnClick", Guard("profile tab", function()
			Sound("IG_CHARACTER_INFO_TAB", 841)
			if ns.db.profileAuto then
				UI.viewKey = def.key ~= ns.ProfileKey() and def.key or nil
				UI.Refresh()
			else
				ns.SetProfile(def.key, "picked")
			end
		end))
		tab:SetScript("OnEnter", function(self)
			GameTooltip:SetOwner(self, "ANCHOR_TOP")
			GameTooltip:SetText(def.label .. " profile", 1, 1, 1)
			GameTooltip:AddLine(def.tip, nil, nil, nil, true)
			local inUse = ns.ProfileKey() == def.key
			if ns.db.profileAuto then
				if inUse then
					GameTooltip:AddLine("Your group is this size now, so Ready conjures these amounts.", 0.4, 0.85, 0.4, true)
				else
					GameTooltip:AddLine("Click to see and set these amounts. Ready conjures them when your group is this size; now it conjures "
						.. ns.PROFILE_BY_KEY[ns.ProfileKey()].label .. ".", 0.8, 0.8, 0.8, true)
				end
			else
				GameTooltip:AddLine(inUse and "Ready conjures these amounts: you picked this tab." or "Click to conjure these amounts instead.",
					0.8, 0.8, 0.8, true)
				if ns.Bracket() == def.key then GameTooltip:AddLine("Your group is this size now.", 0.4, 0.85, 0.4) end
			end
			GameTooltip:Show()
		end)
		tab.inUse = tab:CreateTexture(nil, "OVERLAY")
		tab.inUse:SetSize(12, 12)
		tab.inUse:SetPoint("RIGHT", tab.Text, "LEFT", -2, 0)
		if ns.HasAtlas("common-icon-checkmark") then
			tab.inUse:SetAtlas("common-icon-checkmark")
		else
			tab.inUse:SetSize(6, 6)
			tab.inUse:SetColorTexture(0.4, 0.85, 0.4, 1)
		end
		tab.inUse:Hide()
		tab:SetScript("OnLeave", function() GameTooltip:Hide() end)
		tabs[i] = tab
	end
	if tabStyle == "PanelTabButtonTemplate" then
		tabStrip.numTabs = #tabs
		for _, tab in ipairs(tabs) do
			if PanelTemplates_TabResize then pcall(PanelTemplates_TabResize, tab, 0, width) end
		end
	end
	tabStrip.tabWidth = width
	report["profile tabs"] = tabStyle
end

local function RefreshTabs()
	local index = ns.PROFILE_BY_KEY[UI.ViewKey()].index
	local inUse = ns.ProfileKey()
	for i, tab in ipairs(tabs) do
		if tab.inUse then tab.inUse:SetShown(ns.PROFILES[i].key == inUse) end
	end
	if tabStyle == "PanelTabButtonTemplate" and PanelTemplates_SetTab then
		pcall(PanelTemplates_SetTab, tabStrip, index)
		-- The selected tab's taller art is lifted above both its neighbours.
		local base = (tabStrip:GetFrameLevel() or 0) + 4
		for i, tab in ipairs(tabs) do tab:SetFrameLevel(base + (i == index and 2 or 0)) end
	else
		for i, tab in ipairs(tabs) do
			tab.selected = i == index
			if tab.bg then
				if i == index then tab.bg:SetColorTexture(0.35, 0.28, 0.12, 1) else tab.bg:SetColorTexture(0.12, 0.1, 0.07, 0.95) end
			end
		end
	end
	-- And the box's border above every tab, so their tops rest under it.
	if targetsBox and targetsBox.NineSlice then
		local top = 0
		for _, tab in ipairs(tabs) do top = math.max(top, tab:GetFrameLevel() or 0) end
		targetsBox.NineSlice:SetFrameLevel(top + 1)
	end
end

local function BuildScroll()
	local inset = frame.insetFrame
	local ok, made = pcall(CreateFrame, "ScrollFrame", "ConjurerScrollFrame", inset, "ConjurerScrollFrameTemplate")
	if ok and made and made.ScrollBar then
		scroll = made
		report["scroll frame"] = "ScrollFrameTemplate with MinimalScrollBar"
	else
		if ok and made then made:Hide() end
		ok, made = pcall(CreateFrame, "ScrollFrame", "ConjurerScrollFrameOld", inset, "UIPanelScrollFrameTemplate")
		if ok and made then
			scroll = made
			report["scroll frame"] = "UIPanelScrollFrameTemplate"
		else
			scroll = CreateFrame("ScrollFrame", nil, inset)
			report["scroll frame"] = "plain, mouse wheel only"
		end
	end
	scroll:SetPoint("TOPLEFT", inset, "TOPLEFT", 6, -6)
	scroll:SetPoint("BOTTOMRIGHT", inset, "BOTTOMRIGHT", -24, 6)
	scroll:EnableMouseWheel(true)
	if not scroll:GetScript("OnMouseWheel") then
		scroll:SetScript("OnMouseWheel", function(self, delta)
			local range = math.max(0, (content:GetHeight() or 0) - (self:GetHeight() or 0))
			local v = math.min(range, math.max(0, (self:GetVerticalScroll() or 0) - delta * 40))
			self:SetVerticalScroll(v)
		end)
	end
	content = CreateFrame("Frame", nil, scroll)
	content:SetSize(WIDTH - 4 - 6 - 6 - 24, 1)
	scroll:SetScrollChild(content)
end

local function Build()
	if frame then return end
	ns.Stage("building the window")
	frame = CreateWindow()
	Place()
	BuildReadyBar()
	BuildScroll()
	BuildTargetsBox()
	BuildTabs()

	for _, def in ipairs(SECTIONS) do
		local s = { def = def }
		s.header = NewHeader(content, def)
		s.body = CreateFrame("Frame", nil, content)
		s.body:SetHeight(1)
		sections[def.key] = s
	end
	BuildRanks(sections.water.body, "water")
	BuildRanks(sections.food.body, "food")
	BuildGems(sections.gems.body)
	BuildShares(sections.shares.body)
	BuildGroupTop(sections.group.body)
	groupEmpty = Text(sections.group.body, "GameFontDisable")
	groupEmpty:SetPoint("TOPLEFT", sections.group.body, "TOPLEFT", 14, -GROUP_TOP - 6)
	groupEmpty:SetText("You're not in a group. Shares go to your party or raid when you are.")
	BuildMacro(sections.macro.body)
	BuildAlert(sections.alert.body)
	BuildAnnounce(sections.announce.body)
	BuildOptions(sections.options.body)

	-- Header buttons: they sit left of the header's own +/- art.
	local fill = NewButton(sections.water.header, "Fill targets from group", 160, 20)
	fill:SetPoint("RIGHT", sections.water.header, "RIGHT", -34, 0)
	fill:SetScript("OnClick", Guard("Fill targets", function() ns.Trade.FillTargets(true) end))
	Tip(fill, "Fill targets from group",
		"Sets every target to what your party or raid is still owed, at the rank each person can use, plus what you keep for yourself.")
	sections.water.action = fill
	local allRanks = NewCheck(sections.water.header, "Show all ranks",
		function() return ns.db.showAllRanks end,
		function(v)
			ns.db.showAllRanks = v
			if ns.Conjure.armed then ns.Conjure.Update() end
		end,
		"Off: just your best rank of water and food. On: every rank you know, for players too low for your best. Ready conjures only the ranks listed.")
	allRanks:SetPoint("RIGHT", sections.water.header, "RIGHT", -292, 0)
	sections.water.extras = { allRanks, allRanks.label }
	UI.allRanks = allRanks
	local reset = NewButton(sections.group.header, "Reset handed out", 130, 20)
	reset:SetPoint("RIGHT", sections.group.header, "RIGHT", -34, 0)
	reset:SetScript("OnClick", Guard("Reset handed out", function() ns.Trade.ResetHanded() end))
	Tip(reset, "Reset handed out", "Forget who was already given their share now, so everyone gets a new one. Hand-outs are also forgotten by themselves after the time set below.")
	sections.group.action = reset

	-- For the offline harness and the debug report.
	UI.parts = {
		frame = frame, content = content, sections = sections, rankRows = rankRows, shareRows = shareRows,
		memberRows = memberRows, readyButton = readyButton, readyGlow = readyGlow, readyAnim = readyAnim,
		readyTitle = readyTitle, readyDetail = readyDetail, keyButton = keyButton, capture = capture,
		groupEmpty = groupEmpty, optionsInfo = optionsInfo, macroButton = macroButton, macroText = macroText,
		macroStatus = macroStatus, macroMake = macroMake, alertMove = alertMove,
		settingsState = settingsState, settingsButton = settingsButton, tabs = tabs, tabStrip = tabStrip,
		targetsBox = targetsBox, gemRows = gemRows,
		announceBox = announceBox, announcePreview = announcePreview, announceMove = announceMove,
	}
	local used = {}
	for _, key in ipairs({ "window template", "slider template", "check template", "button template", "scroll frame",
		"section header art", "ready glow", "icon button art", "profile tabs", "targets box" }) do
		used[#used + 1] = key .. " " .. tostring(report[key])
	end
	ns.Log("window built: " .. table.concat(used, "; "))

	frame:SetScript("OnShow", function()
		Sound("IG_SPELLBOOK_OPEN", 829)
		UI.Refresh()
		if C_Timer and C_Timer.NewTicker and not ticker then
			ticker = C_Timer.NewTicker(1, function() UI.Refresh() end)
		end
	end)
	frame:SetScript("OnHide", function()
		Sound("IG_SPELLBOOK_CLOSE", 830)
		if ticker then ticker:Cancel() ticker = nil end
		if capturing and UI.EndCapture then UI.EndCapture() end
		if ns.Alert and ns.Alert.preview then ns.Alert.SetPreview(false) end
		if ns.Announce and ns.Announce.preview then ns.Announce.SetPreview(false) end
	end)
	ns.Stage("idle")
end

-- Water and Food, the part a profile changes, go inside the targets box.
local BOXED = { water = true, food = true }

function UI.Layout()
	local y = 0
	local boxTop
	for _, def in ipairs(SECTIONS) do
		local s = sections[def.key]
		local boxed = BOXED[def.key] and targetsBox ~= nil
		local x = boxed and BOX_PAD or 0
		if boxed and not boxTop then
			boxTop = y
			y = y + BOX_PAD
		end
		local collapsed = ns.db.collapsed[def.key] and true or false
		s.header:ClearAllPoints()
		s.header:SetPoint("TOPLEFT", content, "TOPLEFT", x, -y)
		s.header:SetPoint("TOPRIGHT", content, "TOPRIGHT", -x, -y)
		local bottom = y + 26
		y = y + 28
		if collapsed then
			s.body:Hide()
		else
			s.body:ClearAllPoints()
			s.body:SetPoint("TOPLEFT", content, "TOPLEFT", x, -y)
			s.body:SetPoint("TOPRIGHT", content, "TOPRIGHT", -x, -y)
			s.body:Show()
			bottom = y + (s.body:GetHeight() or 0)
			y = y + (s.body:GetHeight() or 0) + 8
		end
		if s.header.Right then
			s.header.Right:SetAtlas(collapsed and ART.right or ART.open, true)
			s.header.HighlightRight:SetAtlas(collapsed and ART.right or ART.open, true)
		elseif s.header.Sign then
			s.header.Sign:SetText(collapsed and "+" or "-")
		end
		s.header.Summary:SetText(collapsed and SUMMARY[def.key]() or "")
		if s.action then s.action:SetShown(not collapsed) end
		if s.extras then
			for _, region in ipairs(s.extras) do region:SetShown(not collapsed) end
		end
		-- The box closes after Food; the profile tabs hang from its bottom border.
		if def.key == "food" and boxTop then
			local boxBottom = bottom + BOX_PAD
			targetsBox:ClearAllPoints()
			targetsBox:SetPoint("TOPLEFT", content, "TOPLEFT", 0, -boxTop)
			targetsBox:SetPoint("TOPRIGHT", content, "TOPRIGHT", 0, -boxTop)
			targetsBox:SetHeight(boxBottom - boxTop)
			tabStrip:ClearAllPoints()
			tabStrip:SetPoint("TOPLEFT", targetsBox, "BOTTOMLEFT", 0, 0)
			y = boxBottom + TAB_H + 6
		end
	end
	content:SetHeight(math.max(y, 1))
	if scroll.UpdateScrollChildRect then pcall(scroll.UpdateScrollChildRect, scroll) end
end

function UI.Refresh()
	if not (frame and frame:IsShown()) then return end
	local C = ns.Conjure
	local title, detail = C.Status()
	if UI.ViewKey() ~= ns.ProfileKey() then
		detail = detail .. " Showing " .. ns.PROFILE_BY_KEY[UI.ViewKey()].label .. "'s amounts."
	end
	readyTitle:SetText(title)
	if C.armed then readyTitle:SetTextColor(0.35, 0.85, 1) else readyTitle:SetTextColor(1, 0.82, 0) end
	readyDetail:SetText(detail)
	local row = (C.armed and C.placed) or C.CurrentRow() or ns.TopKnown("water") or ns.WATER[#ns.WATER]
	readyButton.icon:SetTexture(ns.SpellIcon(row))
	readyButton.icon:SetDesaturated(not ns.isMage)
	if C.armed then
		readyGlow:Show()
		if not readyAnim:IsPlaying() then readyAnim:Play() end
		readyButton:LockHighlight()
	else
		readyAnim:Stop()
		readyGlow:Hide()
		readyButton:UnlockHighlight()
	end
	-- Play while there is something to start (greyed when there isn't), stop while lit.
	local canStart = ns.isMage and C.CurrentRow() ~= nil
	readyButton.play:SetShown(not C.armed and readyButton.playArt ~= nil)
	readyButton.play:SetDesaturated(not canStart)
	readyButton.play:SetAlpha(canStart and 1 or 0.45)
	readyButton.stop:SetShown(C.armed and readyButton.stopArt ~= nil)
	local missing = C.armed and not readyButton.stopArt or (not C.armed and not readyButton.playArt)
	readyButton.playText:SetShown(missing and true or false)
	readyButton.playText:SetText(C.armed and "Stop" or "Start")
	readyButton.playText:SetAlpha((C.armed or canStart) and 1 or 0.45)
	SetPortrait(ns.SpellIcon(ns.WATER[#ns.WATER]))

	if capturing then
		keyButton:SetText("Press a key")
		keyHint:SetText("Escape cancels")
	else
		keyButton:SetText("Key: " .. C.KeyText())
		keyHint:SetText("the key you hold")
	end

	RefreshTabs()
	RefreshGems(sections.gems.body)
	RefreshRanks("water")
	RefreshRanks("food")
	for _, r in ipairs(shareRows) do r.Sync() end
	for _, sync in ipairs(syncers) do sync() end
	RefreshGroup(sections.group.body)
	RefreshMacro()
	alertMove:SetText(ns.Alert.preview and "Done moving" or "Show it to move it")
	RefreshAnnounce()

	local held, down = C.SettingState()
	local function Word(v)
		if v == "1" then return "|cff66dd66on|r" end
		if v == nil then return "|cff999999missing|r" end
		return "|cffff5555off|r"
	end
	settingsState:SetText("Game options now: Press and Hold Casting " .. Word(held) .. ", Cast on Key Down " .. Word(down))
	settingsButton:SetShown(held ~= "1" or down == "0")

	local where = C.where or C.FindSlot()
	optionsInfo:SetText(where
		and ("Ready borrows " .. where.label .. " button " .. where.index .. " (action slot " .. where.slot .. ")"
			.. (where.shown and ", a bar you show" or ", a bar you don't show") .. ", and empties it again when Ready goes off.")
		or "Every action bar button is in use; empty one on Action Bar 6, 7 or 8 for Ready to borrow.")
	UI.Layout()
end

function UI.Toggle()
	Build()
	if frame:IsShown() then frame:Hide() else frame:Show() end
end

function UI.Show()
	Build()
	frame:Show()
end

function UI.ResetPosition()
	ns.db.point = nil
	Build()
	Place()
	frame:Show()
end

function UI.Init()
	-- Built on first open, so a session that never opens it pays nothing.
end
