# Changelog

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
