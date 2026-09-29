# Conjurer

Mage food and water for WoW Forever. Set how much of each rank you want, click Ready, hold one
key (or just click), and the game conjures until every target is met. Then hand out shares by
class to your party or raid straight into the trade window, and eat and drink with one button.

Type `/conjure` (or `/conjurer`), or click the minimap button.

## The window

A Blizzard-style window with the Ready bar at the top and sections you can fold away:

- **Water** and **Food**: your best rank of each, the level needed to use it, how many you have,
  and a slider for how many you want. Click an icon to conjure that rank (one cast, out of combat).
  Tick **Show all ranks** to list every rank you've learned,
  for players too low for your best; Ready conjures only the ranks listed. **Fill targets from
  group** sets every target to what your group is still owed plus what you keep for yourself, and
  says so when someone needs a lower rank that isn't shown.
- **Mana gems**: tick **Keep your mana gems** and Ready conjures any ticked gem you're missing
  (one of each, as the game allows), before water and food. Click a gem's icon to conjure it. Missing gems also show on the low
  alert.
- **Shares by class**: how much water and food each class gets, how much you keep, and the most a
  stranger gets. Options to fill the trade window by itself (for strangers too, if you like), to
  give each person the best rank they can use, to put what you conjure with a trade open into the
  trade, and to include the whole raid or just your group of five.
- **Group**: everyone in your party or raid with their share and whether they're ready, short,
  out of range or already handed out. The Trade button asks them to trade and fills the window.
  A hand-out is forgotten after the time you set (30 minutes to start, 0 keeps it until you press
  **Reset handed out**), so they're owed a new share.
- **Eat and drink macro**: one action bar button that eats your best conjured food and drinks your
  best conjured water at the same time.
- **Low food and water alert**: an icon that shows when you run low, with a threshold for each.
- **Options**: the chime, drinking when out of mana, player tooltips, tidying your bags, hold to
  cast, the minimap button, and the debug report.

## Profiles

Every group size has its own targets: Water and Food sit in their own box, with a tab for each group size hanging from its bottom edge. Nothing else changes with the profile.

| Tab | When |
|---|---|
| Solo | on your own |
| Party | a party of up to five |
| Raid 10, Raid 20, Raid 40 | a raid of up to 10, 11 to 20, or more than 20 |
| BG 10, BG 20, AV 40 | a battleground of up to 10 a side (Warsong Gulch), 11 to 20 (Arathi Basin), or more (Alterac Valley) |

Ready always conjures the profile for your group's size right now. Its tab carries a green check,
and the Ready line names it. A battleground goes by its own size, as the game reports it, and falls
back to the number of people in it.

Clicking another tab only shows that profile's amounts, so you can set them ahead of time; the
sliders change the profile you're looking at. When your group changes size, the window moves to
the new profile. **Fill targets from group** fills your group's profile. Each profile starts with
amounts to suit its size at your best rank.

To pick the profile yourself, untick **Conjure for your group's size** in Options: Ready then
conjures the tab you click, whatever your group.

## Ready and hold to cast

WoW Forever can repeat a cast while you hold its key (Options > Combat > Press and Hold Casting).
The game only does that for its own action bar buttons, so while Ready is lit Conjurer borrows one
button on an action bar you don't show (Action Bar 8 first), puts the next conjure spell on it,
and points the key you picked at that button's own key binding. Holding the key is then exactly
like holding one of your action bar keys.

- Click the **play** button on the Ready icon when you're set. It lights up like a spell alert and
  the play button turns into a stop button.
- Hold your key. The game keeps conjuring until the row reaches its target, then the hold stops.
  It chimes and says what's next: let go and hold again for the next row.
- Conjurer knows how many items one cast makes (it grows with your level, from the spell data, and
  it checks against what your bags show), so it ends the hold exactly at the target: when the last
  cast starts, the button already moves on. It counts a cast that has landed but whose items haven't
  reached your bags yet, which they do about a second later.
- If that last cast comes up short after all, the spell goes back on the button, but never while you
  still hold the key between casts (the game refuses that): let go and hold again. A cast whose
  items arrive in two parts (one tops up a stack, the rest start a new one) isn't taken as short.
- **Bags full**: each cast checks that the next one will fit. The hold ends on the last cast that
  fits, a row with no room is passed over, and when nothing fits Ready goes off and says so.
- **Out of mana**: once the next cast can't be paid for, or the game says "Not enough mana", the
  borrowed button gets your best conjured water instead, so your next press drinks (the game won't
  let an addon drink by itself). As soon as the drink starts the spell is back, so you stand up and
  conjure whenever you like. The Ready bar counts the drink down, and pressing too soon says how long
  it has left instead of drinking another water. Untick **Drink when you run out of mana** in Options
  to keep the spell.
- When every target is met, Ready switches itself off, the borrowed button is emptied and your key
  goes back to what it normally does.
- Entering combat switches Ready off at once. A secure state driver also takes the key away the
  moment combat starts, even if the addon itself is too late.

The key can be any key, with Shift, Ctrl or Alt, or a side mouse button.

### Making sure the game's hold to cast is on

Hold to cast needs two of the game's own settings: **Press and Hold Casting** and **Cast on Key
Down** (Options > Combat). Conjurer looks after them in three ways:

- **Options** shows whether each one is on right now, with a **Turn both on** button that switches
  them on for good, the same as ticking them yourself.
- When you click play, Conjurer turns on whichever is off (**Turn them on while Ready is lit**,
  on by default) and puts them back afterwards, unless **Leave them on when Ready goes off** is
  ticked.
- If the game ever refuses the change, Conjurer says so, and each press conjures once until you
  tick them in Options > Combat. The Ready bar says so too.

## Conjuring by click

Rather click than hold a key? The button next to the key button on the Ready bar, and the one on
the low alert, conjure with a click: one cast per click, no Ready and no key needed. It always holds
the next row still short of its target, counting items on their way, so a click during a row's last
cast already makes the next row. On the alert, once every target is met, it conjures whatever the
alert shows as low. It follows the same rules as Ready: a row with no room is passed over, and out
of mana it drinks your best water until you're full. It works out of combat only.

Holding the mouse button down conjures once: the game repeats a held cast only for a key, never a
mouse click (not even on its own action bars). To conjure by holding with the mouse, pick a side
mouse button as your key.

## Trading

When a group member opens a trade with you (or you click Trade on their row), their share goes into
the trade window: the best rank they can use, in whole stacks where possible. A share that isn't
whole stacks is split inside your bags first and then moved in. You still press the game's own
Trade button to finish. What was handed over is counted only once the trade completes.

A row of buttons hangs under the game's trade window:

- **Conjurer: give share** puts their share in by hand, for anyone you trade, when the automatic
  fill is off or didn't happen.
- **+ Water** and **+ Food** each put in one stack of your best conjured water or food they can
  use, your fullest stack first. Click again for another.
- **Clear** takes everything you put in back out.

Someone outside your group gets their class's share, but never more than the **Strangers, at
most** row (20 water and 20 food to start). Tick **And for strangers too** to fill their trades by
themselves as well.

Conjure while a trade is open and what you make goes into the window as it arrives (**Put what you
conjure with a trade open into the trade**, on by default).

Hovering a friendly player shows what Conjurer would hand them, and whether they've had it
(**Show shares on player tooltips** in Options).

## Tidy bags

After you conjure, when Ready goes off and when a trade closes, loose stacks of conjured food and
water are merged into whole ones, one move at a time, once nothing else is going on: out of
combat, Ready off, no trade open, nothing on the cursor, nothing being cast. Eating and drinking
don't set it off. Untick **Tidy conjured stacks in your bags** in Options to leave your bags alone.

## The eat and drink macro

Click **Make macro** (or drag the icon to your bar). Conjurer writes a macro called Conjurer Eat
that uses your best conjured food and water by item id, so it works in any client language, and
rewrites it as your bags change, out of combat. Delete it and Conjurer leaves it deleted.

## The low food and water alert

When your conjured water or food drops below the amount you set (20 water and 10 food to start
with), an icon for it appears, glowing like a spell alert, with how many you have left. It counts
your best rank, the one you conjure (and any better one another mage gave you), so a pile of a
lower rank doesn't hide that you're out; tick **Count lower ranks too** to count every rank you're
high enough to use. It only alerts for what you can conjure.

- Next to it are a click-to-conjure button, a **play** button that starts Ready (stop while it
  runs) and a **cog** that opens Conjurer. Started from the alert, it stays up until conjuring
  stops, so stop stays in reach.
- **Show it**: out of combat (the default), in combat, or always.
- Click an icon to conjure what it shows (one cast, out of combat), right-click it to start or stop
  Ready, and drag it wherever you like (**Show it to move it** shows it so you can). A sound when it
  appears is optional.

## The announce button

An optional button you can put anywhere on screen (turn it on in the **Announce button** section).
One click tells your group to trade you for food and water, with how much you have left:

> Mage food and water here! Trade me for yours. I have 120 Crystal Water (55+), 40 Sparkling Water
> (45+) and 60 Cinnamon Roll (55+).

- The items are links people can shift-click. When the links would make the message too long for
  the chat, it goes with plain names instead.
- It goes to your battleground or instance group when you're in one, else your raid, else your
  party. The section shows exactly what would be sent, and where, before you click.
- The message is yours to word: `{stock}` becomes everything you have, `{water}` and `{food}` each
  kind on its own. **Reset text** brings back the default.
- By default it only shows while you're in a group. Untick **Only while you're in a group** and
  on your own it tells the people around you (Say), for a call in town. It won't send more than
  once every 10 seconds, and only when you click it.
- Right-click it for Conjurer's settings, drag it to move it (**Show it to move it** shows it so
  you can).

## Commands

- `/conjure` opens the window.
- `/conjure ready` turns Ready on or off.
- `/conjure fill` sets the targets from your group.
- `/conjure reset` puts the window back in the middle of the screen.
- `/conjure debug` prints what Conjurer found on this client.
- `/conjure note <text>` writes a line into the log.

Another addon (ConjureBot) also uses `/conjure`. With both installed, `/conjurer` always reaches
Conjurer.

## The log

Conjurer keeps a log of what it does (Ready, the borrowed button, each cast, trades, the macro,
and any error) in its saved variables. The game writes it to disk at every `/reload` and logout, in
`WTF\Account\<account>\SavedVariables\Conjurer.lua`. `node tools/conjurer-log.js` in this
repository prints it, with the latest debug report.

## Development

`node tests/conjurertest.js` runs the offline harness (fengari; `--bare` runs it with every
Blizzard template and atlas missing).

## License

MIT
