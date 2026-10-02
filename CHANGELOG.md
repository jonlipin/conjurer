# Changelog

## 1.3.1 - 2026-10-02

- With the quick access bar's panel hidden, the announce button is the same framed chat button as in the title bar, under the cog at the end of the row, instead of a big icon in the row.

## 1.3.0 - 2026-10-02

- The low food and water alert is now the quick access bar. Show it Always, as a quick bar, or Only when low: your water and food with how many you have, the click-to-conjure button, the announce button, a Ready button like the window's (it glows while Ready is lit, however you started it), and the cog that opens Conjurer. Everything else it had is kept; the combat choice now reads out of combat, in combat, or in and out of combat.
- The quick access bar sits in a panel like the bag window's, titled Conjurer, with the cog in its title bar. The title can show the progress count instead, "60 of 80 (75%)" (With the progress count in its title). Show its border and background can take the panel away, leaving the icons, buttons and progress bar. A Size slider makes it from half to twice as big. Drag it by the panel or any icon.
- A progress bar shows how far the conjuring has got, what you have toward every target out of all of them: under the quick access bar and across the Conjurer window. It's the professions book's skill bar, with alchemy's flowing blue-green fill. Hover it for every row. On the quick access bar it can be hidden, or shown without its count.
- The announce button lives in the quick access bar's title bar, the chat symbol in a framed button like the cog (an icon in the row without the panel); Show the announce button puts it there. The Show it to move it buttons are gone: drag the bar by its panel or any of its icons.
- The eat and drink macro drinks first, so its button shows your water.

## 1.2.2 - 2026-10-01

- Fixed: running out of mana on any other spell, with Ready off, made Conjurer think you wanted a drink, so drinking afterwards showed its "Drinking" message. Only a conjure's "Not enough mana" counts now: while Ready is lit, or just after a click on one of Conjurer's conjure buttons or icons.

## 1.2.1 - 2026-09-29

- Before the trade window is filled (by itself, with Give share, or with + Water and + Food), loose stacks of what's being handed over are merged first, so whole stacks go over instead of a 13 and a 7. With tidying switched off in Options they go as they are.

## 1.2.0 - 2026-09-29

- Click a water, food or mana gem icon in the window to conjure that exact item and rank: one cast, out of combat, no Ready or key needed.
- The low alert's icons conjure what they show with a click too. Right-click still starts or stops Ready, and the cog opens Conjurer.
- Tidying stacks now only follows a conjure, Ready going off or a trade closing; it no longer restacks every time you eat or drink.

## 1.1.0 - 2026-09-28

- Conjure by click: a button on the Ready bar and one on the low alert conjure with a click, one cast per click, no Ready or key needed. It always holds the next row short of its target, and on the alert, once every target is met, whatever the alert shows as low. (Holding the mouse down conjures once: the game repeats a held cast only for a key. A side mouse button can be your key.)
- Out of mana: once the next cast can't be paid for, or the game says "Not enough mana", your next press of the key (or click on the click button) drinks your best conjured water. The game won't let an addon drink by itself, so it's that press that drinks. As soon as the drink starts, the key and the click conjure again, so you stand up and conjure whenever you like; the Ready bar counts the drink down, and pressing too soon says how long it has left instead of drinking another water. Can be switched off in Options.
- Bags full: each cast checks that the next one fits. The hold ends on the last cast that fits, a row with no room is passed over, and Ready goes off saying the bags are full instead of wasting casts.
- Loose stacks of conjured food and water are tidied into whole ones, out of combat, when you're not conjuring, trading or casting.
- Under the trade window: + Water and + Food add a stack of your best conjured water or food they can use, your fullest first, and Clear takes it all back out.
- Strangers get their class's share but never more than the new Strangers row (20 water and 20 food to start), and can have their trades filled by themselves too.
- What you conjure with a trade open goes into the trade as it arrives.
- Hovering a friendly player shows what Conjurer would hand them, and whether they've had it.
- The announce button uses item links people can shift-click, and on your own (with Only while you're in a group off) it tells the people around you.

## 1.0.0 - 2026-09-28

First release.

- Conjure every rank of food and water to a target you set. Click play, hold one key, and the game's own Press and Hold Casting conjures until the row's target is met, then stops there: Conjurer learns how much each cast makes and moves on during the last one. A chime says when to press again for the next row.
- Profiles for every group size: Solo, Party, Raid 10, Raid 20, Raid 40, and battlegrounds of 10, 20 and 40 a side (Warsong Gulch, Arathi Basin, Alterac Valley), each with its own amounts to conjure, on Blizzard-style tabs hanging from the box that holds the Water and Food sliders. Ready conjures the profile for your group's size (a battleground by its own size), marked with a check on its tab; clicking another tab shows its amounts to set ahead of time. Untick Conjure for your group's size to conjure the tab you pick instead.
- Show all ranks: off by default, only your best rank of water and food is listed and conjured; ticked, every rank you know.
- Mana gems: keep one of each you tick. Ready conjures the missing ones first, and the low alert shows them until you have them.
- Handed-out shares are forgotten after a time you set in the Group section (30 minutes to start).
- Ready borrows one button on an action bar you don't show and binds your key to it only while Ready is lit. It switches off by itself when you're done or enter combat, and puts your settings and your key back.
- Shares by class for your party or raid, filled into the trade window at the best rank each person can use, with a Group list showing who is ready, short, out of range or already handed out. A Give share button under the trade window does it by hand, for anyone.
- Fill targets from group: every target set to what your group is owed plus what you keep.
- An eat and drink macro that uses your best conjured food and water with one button, kept up to date as your bags change.
- An alert icon when your conjured water or food runs low, with a threshold for each, a play button to start conjuring and a cog to open Conjurer, shown out of combat, in combat or always. It counts your best rank, so a pile of a lower rank doesn't hide that you're out (lower ranks can count too).
- An optional announce button you can put anywhere: one click tells your party, raid or battleground to trade you for food and water, with how much of each rank you have left, in your own words.
- The game's Press and Hold Casting and Cast on Key Down settings, shown in Options with a button to turn both on, switched on by Ready when needed and put back unless you ask to keep them on.
- A Blizzard-style window with collapsible sections, a minimap button, and a log saved to disk at every /reload for troubleshooting.
