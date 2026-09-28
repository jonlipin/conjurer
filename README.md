# Conjurer

Mage food and water for WoW Forever. Set how much of each rank you want, click Ready, hold one
key, and the game conjures until every target is met. Then hand out shares by class to your party
or raid straight into the trade window, and eat and drink with one button.

Type `/conjure` (or `/conjurer`), or click the minimap button.

## The window

A Blizzard-style window with the Ready bar at the top and six sections you can fold away:

- **Water** and **Food**: every rank, the level needed to use it, how many you have, and a slider
  for how many you want. Only the ranks you've learned are listed. **Fill targets from group**
  sets every target to what your group is still owed plus what you keep for yourself.
- **Shares by class**: how much water and food each class gets, and how much you keep. Options to
  fill the trade window by itself, to give each person the best rank they can use, and to include
  the whole raid or just your group of five.
- **Group**: everyone in your party or raid with their share and whether they're ready, short,
  out of range or already handed out. The Trade button asks them to trade and fills the window.
- **Eat and drink macro**: one action bar button that eats your best conjured food and drinks your
  best conjured water at the same time.
- **Low food and water alert**: an icon that shows when you run low, with a threshold for each.
- **Options**: the chime, hold to cast, the minimap button, and the debug report.

## Profiles

Every group size has its own targets: the tabs right under the Water and Food sliders switch which set of amounts the sliders show and Ready conjures to. Nothing else changes with the profile.

| Tab | When |
|---|---|
| Solo | on your own |
| Party | a party of up to five |
| Raid 10, Raid 20, Raid 40 | a raid of up to 10, 11 to 20, or more than 20 |
| BG 10, BG 20, AV 40 | a battleground of up to 10 a side (Warsong Gulch), 11 to 20 (Arathi Basin), or more (Alterac Valley) |

A battleground goes by its own size, as the game reports it, and falls back to the number of
people in it. The profile follows your group by itself (**Switch profile with your group** in
Options). Click a tab to use that profile instead; your pick holds until your group moves into
another size. Each profile starts with amounts to suit its size at your best rank, and the sliders
and **Fill targets from group** change the profile in use only.

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
- Conjurer learns how many items one cast makes (it grows with your level), so it can end the hold
  exactly at the target: during the last cast it already moves the button on. The very first time
  a rank is cast at a new level it can't know yet, so one cast may go over.
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

## Trading

When a group member opens a trade with you (or you click Trade on their row), their share goes into
the trade window: the best rank they can use, in whole stacks where possible. A share that isn't
whole stacks is split inside your bags first and then moved in. You still press the game's own
Trade button to finish. What was handed over is counted only once the trade completes.

## The eat and drink macro

Click **Make macro** (or drag the icon to your bar). Conjurer writes a macro called Conjurer Eat
that uses your best conjured food and water by item id, so it works in any client language, and
rewrites it as your bags change, out of combat. Delete it and Conjurer leaves it deleted.

## The low food and water alert

When your conjured water or food drops below the amount you set (20 water and 10 food to start
with), an icon for it appears, glowing like a spell alert, with how many you have left. It counts
every rank you're high enough to use and only alerts for what you can conjure.

- Next to it are a **play** button that starts conjuring (stop while it runs) and a **cog** that
  opens Conjurer. Started from the alert, it stays up until conjuring stops, so stop stays in reach.
- **Show it**: out of combat (the default), in combat, or always.
- Click an icon to open Conjurer, right-click it to start or stop conjuring, and drag it wherever
  you like (**Show it to move it** shows it so you can). A sound when it appears is optional.

## The announce button

An optional button you can put anywhere on screen (turn it on in the **Announce button** section).
One click tells your group to trade you for food and water, with how much you have left:

> Mage food and water here! Trade me for yours. I have 120 Crystal Water (55+), 40 Sparkling Water
> (45+) and 60 Cinnamon Roll (55+).

- It goes to your battleground or instance group when you're in one, else your raid, else your
  party. The section shows exactly what would be sent, and where, before you click.
- The message is yours to word: `{stock}` becomes everything you have, `{water}` and `{food}` each
  kind on its own. **Reset text** brings back the default.
- By default it only shows while you're in a group. It won't send more than once every 10 seconds,
  and only when you click it.
- Right-click it for Conjurer's settings, drag it to move it (**Show it to move it** shows it so
  you can).

## Commands

- `/conjure` opens the window.
- `/conjure ready` turns Ready on or off.
- `/conjure fill` sets the targets from your group.
- `/conjure reset` puts the window back in the middle of the screen.
- `/conjure debug` prints what Conjurer found on this client.
- `/conjure note <text>` writes a line into the log.

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
